import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Agent, AgentEvent } from "@mariozechner/pi-agent-core";
import type {
  AssistantMessage,
  Message,
  ToolResultMessage,
  UserMessage,
} from "@mariozechner/pi-ai";
import {
  buildAgent,
  COPILOT_MODEL_PRIORITY,
  CODEX_MODEL_PRIORITY,
  DEFAULT_MODEL,
  SUPPORTED_MODELS,
  type SupportedModel,
} from "../lib/agent";
import { createRepoRuntime, type RepoRuntime } from "../lib/repoRuntime";
import { deleteCredential, getCredential, setCredential } from "../db/credentials";
import { db } from "../db";
import { createSession, touchSession } from "../db/sessions";
import {
  ensureFreshCopilot,
  getCopilotBaseUrl,
  listCopilotModels,
  type CopilotCredentials,
} from "../lib/copilotOAuth";
import {
  ensureFreshCodex,
  type CodexCredentials,
} from "../lib/codexOAuth";

const COPILOT_CRED_KEY = "COPILOT_OAUTH";
const CODEX_CRED_KEY = "CODEX_OAUTH";

async function getCopilotCreds(): Promise<CopilotCredentials | null> {
  const raw = await getCredential(COPILOT_CRED_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CopilotCredentials;
  } catch {
    return null;
  }
}

async function saveCopilotCreds(creds: CopilotCredentials): Promise<void> {
  await setCredential(COPILOT_CRED_KEY, JSON.stringify(creds));
}

async function getCodexCreds(): Promise<CodexCredentials | null> {
  const raw = await getCredential(CODEX_CRED_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CodexCredentials;
  } catch {
    return null;
  }
}

async function saveCodexCreds(creds: CodexCredentials): Promise<void> {
  await setCredential(CODEX_CRED_KEY, JSON.stringify(creds));
}

export type ChatStatus =
  | "idle"
  | "loading"
  | "streaming"
  | "needs_auth"
  | "error";

export type BootStage =
  | "cloning"
  | "starting_server"
  | "checking_providers"
  | "ready";

export interface OcPart {
  type: string;
  text?: string;
  thinking?: string;
  toolCallId?: string;
  toolName?: string;
  args?: Record<string, unknown>;
  result?: unknown;
  isError?: boolean;
  [key: string]: unknown;
}

export interface OcMessage {
  info: {
    id: string;
    role: "user" | "assistant" | "tool";
    createdAt?: string;
    [key: string]: unknown;
  };
  parts: OcPart[];
}

export interface UseAgentReturn {
  messages: OcMessage[];
  status: ChatStatus;
  bootStage: BootStage;
  error: string | null;
  connectedProviders: string[];
  activeModel: SupportedModel;
  selectModel: (model: SupportedModel) => Promise<void>;
  logoutProvider: (provider: SupportedModel["provider"]) => Promise<void>;
  sendMessage: (text: string) => Promise<void>;
  abort: () => void;
  refreshProviders: () => Promise<void>;
  ready: boolean;
  sessionId: number | undefined;
}

const PROVIDER_CRED_KEY: Record<string, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GOOGLE_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
};

async function checkConnectedProviders(): Promise<string[]> {
  const entries = await Promise.all(
    Object.entries(PROVIDER_CRED_KEY).map(async ([provider, key]) => {
      const v = await getCredential(key);
      return v && v.length > 0 ? provider : null;
    })
  );
  const list = entries.filter((v): v is string => v !== null);
  const copilot = await getCopilotCreds();
  if (copilot) list.push("github-copilot");
  const codex = await getCodexCreds();
  if (codex) list.push("openai-codex");
  return list;
}

async function resolveApiKey(provider: string): Promise<string | undefined> {
  if (provider === "github-copilot") {
    const creds = await getCopilotCreds();
    if (!creds) return undefined;
    const fresh = await ensureFreshCopilot(creds);
    if (fresh.access !== creds.access) await saveCopilotCreds(fresh);
    return fresh.access;
  }
  if (provider === "openai-codex") {
    const creds = await getCodexCreds();
    if (!creds) return undefined;
    const fresh = await ensureFreshCodex(creds);
    if (fresh.access !== creds.access) await saveCodexCreds(fresh);
    return fresh.access;
  }
  const key = PROVIDER_CRED_KEY[provider];
  if (!key) return undefined;
  return await getCredential(key);
}

function messagesToParts(messages: Message[]): OcMessage[] {
  const out: OcMessage[] = [];
  const toolResults = new Map<string, ToolResultMessage>();
  for (const m of messages) {
    if (m.role === "toolResult") toolResults.set(m.toolCallId, m);
  }
  let idCounter = 0;
  for (const m of messages) {
    if (m.role === "toolResult") continue;
    const id = `m-${idCounter}-${m.timestamp}`;
    idCounter += 1;

    if (m.role === "user") {
      const u = m as UserMessage;
      const parts: OcPart[] =
        typeof u.content === "string"
          ? [{ type: "text", text: u.content }]
          : u.content.map((c) =>
              c.type === "text"
                ? { type: "text", text: c.text }
                : { type: "image", data: c.data, mimeType: c.mimeType }
            );
      out.push({
        info: {
          id,
          role: "user",
          createdAt: new Date(u.timestamp).toISOString(),
        },
        parts,
      });
      continue;
    }

    const a = m as AssistantMessage;
    const parts: OcPart[] = [];
    for (const c of a.content) {
      if (c.type === "text") {
        parts.push({ type: "text", text: c.text });
      } else if (c.type === "thinking") {
        parts.push({ type: "reasoning", thinking: c.thinking });
      } else if (c.type === "toolCall") {
        parts.push({
          type: "tool-call",
          toolCallId: c.id,
          toolName: c.name,
          args: c.arguments,
        });
        const tr = toolResults.get(c.id);
        if (tr) {
          const textContent = tr.content
            .filter((cc) => cc.type === "text")
            .map((cc) => (cc as { text: string }).text)
            .join("\n");
          parts.push({
            type: "tool-result",
            toolCallId: c.id,
            toolName: c.name,
            result: tr.details ?? { text: textContent },
            isError: tr.isError,
          });
        }
      }
    }
    out.push({
      info: {
        id,
        role: "assistant",
        createdAt: new Date(a.timestamp).toISOString(),
        model: { providerID: a.provider, modelID: a.model },
      },
      parts,
    });
  }
  return out;
}

interface RepoIdent {
  owner: string;
  repo: string;
  branch?: string;
}

const PROVIDER_PRIORITY: Record<string, number> = {
  "github-copilot": 0,
  "openai-codex": 1,
  anthropic: 2,
  openai: 3,
  google: 4,
  openrouter: 5,
};

function bestProvider(providers: string[]): string | undefined {
  return [...providers].sort(
    (a, b) => (PROVIDER_PRIORITY[a] ?? 99) - (PROVIDER_PRIORITY[b] ?? 99)
  )[0];
}

let copilotAvailableCache: { token: string; ids: Set<string> } | null = null;

async function getCopilotAvailableModels(): Promise<Set<string>> {
  const creds = await getCopilotCreds();
  if (!creds) return new Set();
  const fresh = await ensureFreshCopilot(creds);
  if (fresh.access !== creds.access) await saveCopilotCreds(fresh);
  if (copilotAvailableCache && copilotAvailableCache.token === fresh.access) {
    return copilotAvailableCache.ids;
  }
  try {
    const ids = await listCopilotModels(fresh.access, fresh.enterpriseUrl);
    const set = new Set(ids);
    copilotAvailableCache = { token: fresh.access, ids: set };
    return set;
  } catch {
    return new Set();
  }
}

async function pickCopilotModel(): Promise<SupportedModel | undefined> {
  const available = await getCopilotAvailableModels();
  for (const id of COPILOT_MODEL_PRIORITY) {
    if (!available.has(id)) continue;
    const match = SUPPORTED_MODELS.find(
      (m) => m.provider === "github-copilot" && m.modelId === id
    );
    if (match) return match;
  }
  return undefined;
}

async function pickModelForProviders(
  currentModel: SupportedModel,
  providers: string[]
): Promise<SupportedModel> {
  if (providers.length === 0) return currentModel;

  if (providers.includes(currentModel.provider)) {
    if (currentModel.provider === "github-copilot") {
      const available = await getCopilotAvailableModels();
      if (available.has(currentModel.modelId)) return currentModel;
      const picked = await pickCopilotModel();
      if (picked) return picked;
    }
    return currentModel;
  }

  const preferred = bestProvider(providers);
  if (preferred === "github-copilot") {
    const picked = await pickCopilotModel();
    if (picked) return picked;
  }
  if (preferred === "openai-codex") {
    for (const id of CODEX_MODEL_PRIORITY) {
      const match = SUPPORTED_MODELS.find(
        (m) => m.provider === "openai-codex" && m.modelId === id
      );
      if (match) return match;
    }
  }
  const match = SUPPORTED_MODELS.find((m) => m.provider === preferred);
  return match ?? currentModel;
}

async function resolveModelOverrides(
  model: SupportedModel
): Promise<{ baseUrl?: string } | undefined> {
  if (model.provider !== "github-copilot") return undefined;
  const creds = await getCopilotCreds();
  if (!creds) return undefined;
  const fresh = await ensureFreshCopilot(creds);
  if (fresh.access !== creds.access) await saveCopilotCreds(fresh);
  return { baseUrl: getCopilotBaseUrl(fresh.access, fresh.enterpriseUrl) };
}

const LOGOUT_CRED_KEY: Record<string, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GOOGLE_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  "github-copilot": "COPILOT_OAUTH",
  "openai-codex": "CODEX_OAUTH",
};

export function useAgent(repo: RepoIdent | null): UseAgentReturn {
  const [status, setStatus] = useState<ChatStatus>("idle");
  const [bootStage, setBootStage] = useState<BootStage>("ready");
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<OcMessage[]>([]);
  const [connectedProviders, setConnectedProviders] = useState<string[]>([]);
  const [activeModel, setActiveModel] = useState<SupportedModel>(DEFAULT_MODEL);
  const [ready, setReady] = useState(false);
  const [sessionId, setSessionId] = useState<number | undefined>();

  const agentRef = useRef<Agent | null>(null);
  const runtimeRef = useRef<RepoRuntime | null>(null);
  const modelRef = useRef<SupportedModel>(DEFAULT_MODEL);
  const providersRef = useRef<string[]>([]);
  const subscribedRef = useRef<Agent | null>(null);
  const sessionIdRef = useRef<number | undefined>(undefined);
  const copilotBaseUrlRef = useRef<string | undefined>(undefined);

  const syncProviders = useCallback(async (): Promise<string[]> => {
    const list = await checkConnectedProviders();
    providersRef.current = list;
    setConnectedProviders(list);
    return list;
  }, []);

  const subscribe = useCallback((agent: Agent) => {
    if (subscribedRef.current === agent) return;
    subscribedRef.current = agent;
    agent.subscribe((ev: AgentEvent) => {
      if (ev.type === "agent_start") setStatus("streaming");
      if (
        ev.type === "message_start" ||
        ev.type === "message_update" ||
        ev.type === "message_end" ||
        ev.type === "turn_end" ||
        ev.type === "agent_end"
      ) {
        const snap = agent.state.messages.filter(
          (m) =>
            m.role === "user" ||
            m.role === "assistant" ||
            m.role === "toolResult"
        ) as Message[];
        setMessages(messagesToParts(snap));
      }
      if (ev.type === "agent_end") {
        setStatus(providersRef.current.length === 0 ? "needs_auth" : "idle");
      }
    });
  }, []);

  const rebuildAgent = useCallback(async (opts?: { skipModelPick?: boolean }): Promise<Agent | null> => {
    const runtime = runtimeRef.current;
    if (!runtime) return null;
    const providers = providersRef.current;

    if (!opts?.skipModelPick) {
      modelRef.current = await pickModelForProviders(modelRef.current, providers);
    }

    const modelOverrides = await resolveModelOverrides(modelRef.current);
    copilotBaseUrlRef.current = modelOverrides?.baseUrl;

    const sid = sessionIdRef.current;
    if (sid !== undefined) {
      db.sessions.update(sid, { provider: modelRef.current.provider }).catch(() => {});
    }

    const existingMessages = agentRef.current?.state?.messages ?? [];

    console.log("[gitsandbox] rebuildAgent", {
      providers,
      picked: modelRef.current,
      baseUrl: modelOverrides?.baseUrl,
      carriedMessages: existingMessages.length,
    });
    const agent = buildAgent({
      runtime,
      model: modelRef.current,
      getApiKey: resolveApiKey,
      modelOverrides,
      existingMessages,
    });
    agentRef.current = agent;
    subscribe(agent);
    setActiveModel(modelRef.current);
    return agent;
  }, [subscribe]);

  const selectModel = useCallback(
    async (model: SupportedModel) => {
      const runtime = runtimeRef.current;
      if (!runtime || !ready) return;
      const providers = await syncProviders();
      if (!providers.includes(model.provider)) return;
      modelRef.current = model;
      setActiveModel(model);

      const modelOverrides = await resolveModelOverrides(model);
      copilotBaseUrlRef.current = modelOverrides?.baseUrl;

      const sid = sessionIdRef.current;
      if (sid !== undefined) {
        db.sessions.update(sid, { provider: model.provider }).catch(() => {});
      }

      const existingMessages = agentRef.current?.state?.messages ?? [];

      console.log("[gitsandbox] selectModel", {
        picked: model,
        baseUrl: modelOverrides?.baseUrl,
        carriedMessages: existingMessages.length,
      });
      const agent = buildAgent({
        runtime,
        model,
        getApiKey: resolveApiKey,
        modelOverrides,
        existingMessages,
      });
      agentRef.current = agent;
      subscribe(agent);
    },
    [ready, subscribe, syncProviders]
  );

  const logoutProvider = useCallback(
    async (provider: SupportedModel["provider"]) => {
      const credKey = LOGOUT_CRED_KEY[provider];
      if (credKey) await deleteCredential(credKey);
      if (provider === "github-copilot") copilotAvailableCache = null;
      const list = await syncProviders();
      if (runtimeRef.current) {
        await rebuildAgent();
      }
      setStatus(list.length === 0 ? "needs_auth" : "idle");
    },
    [rebuildAgent, syncProviders]
  );

  const refreshProviders = useCallback(async () => {
    const list = await syncProviders();
    if (runtimeRef.current) {
      await rebuildAgent();
    }
    setStatus((prev) => {
      if (prev === "needs_auth" && list.length > 0) return "idle";
      return prev;
    });
  }, [rebuildAgent, syncProviders]);

  useEffect(() => {
    let cancelled = false;
    if (!repo) return;

    async function boot() {
      setReady(false);
      setError(null);
      setStatus("loading");
      setBootStage("cloning");
      setMessages([]);

      try {
        const providers = await syncProviders();
        if (cancelled) return;

        const runtime = await createRepoRuntime({
          owner: repo!.owner,
          repo: repo!.repo,
          ref: repo!.branch,
          getToken: async () => await getCredential("GITHUB_TOKEN"),
        });
        if (cancelled) return;
        runtimeRef.current = runtime;
        setBootStage("ready");

        providersRef.current = providers;
        modelRef.current = await pickModelForProviders(
          modelRef.current,
          providers
        );

        const session = await createSession({
          repoUrl: `https://github.com/${repo!.owner}/${repo!.repo}`,
          agent: "gitsandbox",
          provider: modelRef.current.provider,
          sandboxId: `${repo!.owner}/${repo!.repo}`,
        });
        if (cancelled) return;
        sessionIdRef.current = session.id;
        setSessionId(session.id);

        await rebuildAgent({ skipModelPick: true });
        if (cancelled) return;

        setReady(true);
        setStatus(providers.length === 0 ? "needs_auth" : "idle");
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load repo");
        setStatus("error");
      }
    }

    boot();
    return () => {
      cancelled = true;
      agentRef.current?.abort();
      agentRef.current = null;
      runtimeRef.current = null;
      subscribedRef.current = null;
    };
  }, [repo?.owner, repo?.repo, repo?.branch, rebuildAgent, syncProviders]);

  const sendMessage = useCallback(
    async (text: string) => {
      const providers = await syncProviders();
      if (providers.length === 0) {
        setStatus("needs_auth");
        return;
      }

      let agent = agentRef.current;
      const needsRebuild =
        !agent || !providers.includes(modelRef.current.provider);
      if (needsRebuild) {
        agent = await rebuildAgent();
      } else if (modelRef.current.provider === "github-copilot") {
        const overrides = await resolveModelOverrides(modelRef.current);
        const baseUrlChanged =
          overrides?.baseUrl && overrides.baseUrl !== copilotBaseUrlRef.current;
        if (baseUrlChanged) {
          agent = await rebuildAgent({ skipModelPick: true });
        }
      }
      if (!agent) {
        setError("Agent not ready");
        setStatus("error");
        return;
      }

      if (sessionIdRef.current) {
        touchSession(sessionIdRef.current).catch(() => {});
      }

      setError(null);
      setStatus("streaming");
      try {
        await agent.prompt(text);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Agent error");
        setStatus("error");
      }
    },
    [rebuildAgent, syncProviders]
  );

  const abort = useCallback(() => {
    agentRef.current?.abort();
    setStatus("idle");
  }, []);

  return useMemo(
    () => ({
      messages,
      status,
      bootStage,
      error,
      connectedProviders,
      activeModel,
      selectModel,
      logoutProvider,
      sendMessage,
      abort,
      refreshProviders,
      ready,
      sessionId,
    }),
    [
      messages,
      status,
      bootStage,
      error,
      connectedProviders,
      activeModel,
      selectModel,
      logoutProvider,
      sendMessage,
      abort,
      refreshProviders,
      ready,
      sessionId,
    ]
  );
}
