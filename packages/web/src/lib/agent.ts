import {
  Agent,
  type AgentEvent,
  type AgentMessage,
} from "@mariozechner/pi-agent-core";
import {
  getModel,
  getModels,
  registerBuiltInApiProviders,
  streamSimple,
  type Message,
  type Model,
} from "@mariozechner/pi-ai";
import type { CopilotChatModel } from "./copilotOAuth";
import type { RepoRuntime } from "./repoRuntime";
import { createRepoTools } from "./tools";

let builtinsRegistered = false;
function ensureBuiltins(): void {
  if (builtinsRegistered) return;
  registerBuiltInApiProviders();
  builtinsRegistered = true;
}

export type ProviderId = "openai-codex" | "github-copilot" | "anthropic";

export interface SupportedModel {
  provider: ProviderId;
  modelId: string;
  label: string;
}

export const SUPPORTED_MODELS: SupportedModel[] = [
  // GitHub Copilot (subscription)
  { provider: "github-copilot", modelId: "claude-haiku-4.5", label: "Copilot · Claude Haiku 4.5" },
  { provider: "github-copilot", modelId: "gpt-5.4", label: "Copilot · GPT-5.4" },
  { provider: "github-copilot", modelId: "gpt-4o", label: "Copilot · GPT-4o" },

  // OpenAI Codex (ChatGPT Plus/Pro subscription)
  { provider: "openai-codex", modelId: "gpt-5.4", label: "Codex · GPT-5.4" },
  { provider: "openai-codex", modelId: "gpt-5.4-mini", label: "Codex · GPT-5.4 Mini" },
  { provider: "openai-codex", modelId: "gpt-5.3-codex", label: "Codex · GPT-5.3" },

  // Anthropic (Claude Pro / Max subscription)
  { provider: "anthropic", modelId: "claude-sonnet-4-6", label: "Claude · Sonnet 4.6" },
  { provider: "anthropic", modelId: "claude-opus-4-6", label: "Claude · Opus 4.6" },
  { provider: "anthropic", modelId: "claude-haiku-4-5", label: "Claude · Haiku 4.5" },
];

export const ANTHROPIC_MODEL_PRIORITY: string[] = [
  "claude-sonnet-4-6",
  "claude-opus-4-6",
  "claude-haiku-4-5",
];

export const COPILOT_MODEL_PRIORITY: string[] = [
  "claude-sonnet-4.6",
  "claude-sonnet-4.5",
  "claude-haiku-4.5",
  "gpt-5.4",
  "gpt-4.1",
  "gpt-4o",
];

export const CODEX_MODEL_PRIORITY: string[] = [
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-5.3-codex",
];

export const DEFAULT_MODEL: SupportedModel = SUPPORTED_MODELS[0];

/**
 * Runtime Model definitions for Copilot ids outside the static registry
 * (e.g. "gpt-5.4-mini-free-auto"), synthesized from a registry template
 * matched by id or family. resolveModel consults this before the registry.
 */
const dynamicCopilotModels = new Map<string, Model<any>>();

/**
 * Build picker options for Copilot from the models the user's plan actually
 * offers (fetched at chat time). Each option needs a registry template
 * (matched by exact id, else by family) so we know how to call it; templates
 * carry the API shape, headers, and base URL, while id, name, and limits come
 * from the live catalog. Priority models come first, the rest alphabetically.
 */
export function copilotModelOptions(
  available: CopilotChatModel[]
): SupportedModel[] {
  ensureBuiltins();
  const registry = getModels("github-copilot" as never) as Model<any>[];
  const byId = new Map(registry.map((m) => [m.id, m]));

  const options: SupportedModel[] = [];
  for (const info of available) {
    const template =
      byId.get(info.id) ?? (info.family ? byId.get(info.family) : undefined);
    if (!template) continue;
    if (!byId.has(info.id)) {
      dynamicCopilotModels.set(info.id, {
        ...template,
        id: info.id,
        name: info.name,
        contextWindow: info.contextWindow ?? template.contextWindow,
        maxTokens: info.maxTokens ?? template.maxTokens,
      });
    }
    options.push({
      provider: "github-copilot",
      modelId: info.id,
      label: `Copilot · ${info.name}`,
    });
  }

  const rank = (m: SupportedModel) => {
    const i = COPILOT_MODEL_PRIORITY.indexOf(m.modelId);
    return i === -1 ? COPILOT_MODEL_PRIORITY.length : i;
  };
  return options.sort(
    (a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label)
  );
}

const FORBIDDEN_BROWSER_HEADERS = new Set([
  "user-agent",
  "editor-version",
  "editor-plugin-version",
  "referer",
  "origin",
  "host",
  "cookie",
]);

function sanitizeHeaders(
  headers: Record<string, string> | undefined
): Record<string, string> | undefined {
  if (!headers) return headers;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (FORBIDDEN_BROWSER_HEADERS.has(k.toLowerCase())) continue;
    out[k] = v;
  }
  return out;
}

export function resolveModel(
  selection: SupportedModel,
  overrides?: { baseUrl?: string }
): Model<any> {
  ensureBuiltins();
  const model =
    (selection.provider === "github-copilot"
      ? dynamicCopilotModels.get(selection.modelId)
      : undefined) ??
    getModel(selection.provider as never, selection.modelId as never);
  const sanitized = {
    ...model,
    headers: sanitizeHeaders((model as { headers?: Record<string, string> }).headers),
  };
  if (overrides?.baseUrl) {
    return { ...sanitized, baseUrl: overrides.baseUrl } as Model<any>;
  }
  return sanitized as Model<any>;
}

export function buildAccountSystemPrompt(
  owner: string,
  kind: string,
  repoCount: number
): string {
  return `You are git-fs, an expert code-research agent answering questions about the GitHub ${kind.toLowerCase()} ${owner}.

Your environment is a read-only virtual filesystem rooted at /. Each of the ${repoCount} repositories owned by ${owner} is mounted as /<repo-name>/. Think of this account as a super-repo: a folder whose children are entire repositories.

<inventory>
- /README.md — full manifest of all ${repoCount} repos with language, stars, description, pushed date.
- /.meta/<repo>.json — per-repo metadata (no hydration needed).
- /<repo>/ — lazy-mounted repo. First access transparently fetches the tree from GitHub (typically 1–3s). Subsequent accesses are instant.
- /<repo>/.repo-meta.json — metadata, always present inside a hydrated repo.
- /<repo>/.hydration-status.json — only present if GitHub returned a truncated tree (very large repos). Note this limitation in your answer if you see it.
</inventory>

<approach>
- For inventory questions ("what repos exist", "which ones use Go"), read /README.md and /.meta/*.json. Do not hydrate repos just to list them.
- For repo-specific questions ("how does bun parse JSON", "deep dive into awesome-bun"), drill into /<repo>/ and explore with bash / read exactly as if it were a standalone repo. Use grep, find, cat, ls freely. The first command that touches /<repo>/ will take an extra second or two — that's hydration, not a hang.
- When multiple lookups are independent, call tools in parallel.
- Cite sources: reference paths as /<repo>/<file>, and link full GitHub URLs of the form https://github.com/${owner}/<repo>/blob/<default-branch>/<path>.
- If the tree was truncated, say so and work with what's available.
</approach>

<tools>
- read: read any file. Use for /README.md, /.meta/*.json, or any file inside a repo.
- bash: read-only virtual shell. Use ls, cat, grep, sed, awk, find, head, tail, wc, sort, uniq, jq. No writes, no network commands, no installs. Recursive operations (grep -r, find) across a repo are fine and will work correctly.
</tools>

<completeness>
- Don't deflect with "open that repo directly". You can read the source — hydration happens automatically.
- Keep exploring until you can give a grounded answer.
- If something is genuinely unknowable (runtime behavior, closed-source deps, private repos you lack access to), say so specifically.
</completeness>

<style>
- No emojis. No decorative icons, no greeting flourishes, no "Here are some things you can ask me" menus.
- Don't pitch capabilities. Answer the question that was asked; if there is no question, summarize the account from /README.md in one short paragraph.
</style>`;
}

export function buildSystemPrompt(
  owner: string,
  repo: string,
  ref: string
): string {
  return `You are git-fs, an expert code-research agent answering questions about the GitHub repository ${owner}/${repo} at ref ${ref}.

Your only environment is a read-only virtual shell rooted at the repo snapshot. The repo is already populated at /. There is no host machine, no network, and no package manager.

<tools>
- read: read a text file from the snapshot. Prefer this for quick inspection of specific files.
- bash: read-only virtual shell for exploration. Use pipes, grep, sed, awk, find, head, tail, ls, wc, sort, uniq, jq. No writes, installs, network, git, node/npm/python/curl.
</tools>

<approach>
- Don't ask permission to explore. Answer the question directly.
- Ground every answer in the snapshot: inspect relevant files (read or bash) before answering, even when you think you know the answer from prior knowledge. Cite only files you actually read this session.
- When multiple lookups are independent, call tools in parallel.
- Cite sources: reference files by path, and when useful, quote short snippets. For external citations, use full GitHub blob URLs of the form https://github.com/${owner}/${repo}/blob/${ref}/<path>.
- If a command hits a missing tool or a binary file, adapt (use bash builtins or skip that file) rather than stopping.
- Be thorough but concise. Use bullet lists, code blocks, and section headers in markdown.
</approach>

<completeness>
- Keep exploring until you can give a grounded answer to the user's actual question.
- If something is genuinely unknowable from the snapshot (runtime behavior, secrets, closed-source deps), say so and explain what would be needed.
</completeness>

<style>
- No emojis. No decorative icons, no greeting flourishes, no "Here are some things you can ask me" menus.
- Don't pitch capabilities. Answer the question that was asked; if there is no question, respond with one short line.
</style>`;
}

export interface BuildAgentOptions {
  runtime: RepoRuntime;
  model: SupportedModel;
  getApiKey: (provider: string) => Promise<string | undefined>;
  modelOverrides?: { baseUrl?: string };
  sessionId?: string;
  existingMessages?: AgentMessage[];
}

export function buildAgent(opts: BuildAgentOptions): Agent {
  ensureBuiltins();
  const resolvedModel = resolveModel(opts.model, opts.modelOverrides);
  const tools = createRepoTools(opts.runtime);

  const agent = new Agent({
    streamFn: streamSimple,
    getApiKey: opts.getApiKey,
    sessionId: opts.sessionId,
    convertToLlm: (messages: AgentMessage[]): Message[] => {
      return messages.flatMap((m) => {
        if (
          m.role === "user" ||
          m.role === "assistant" ||
          m.role === "toolResult"
        ) {
          return [m as Message];
        }
        return [];
      });
    },
    initialState: {
      systemPrompt:
        opts.runtime.scope === "account"
          ? buildAccountSystemPrompt(
              opts.runtime.owner,
              opts.runtime.accountMeta?.kind ?? "User",
              opts.runtime.accountRepos?.length ?? 0
            )
          : buildSystemPrompt(
              opts.runtime.owner,
              opts.runtime.repo,
              opts.runtime.ref
            ),
      model: resolvedModel,
      tools,
      messages: opts.existingMessages ?? [],
      thinkingLevel: "off",
    },
  });

  return agent;
}

export type { AgentEvent };
