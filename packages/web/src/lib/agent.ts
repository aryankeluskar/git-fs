import {
  Agent,
  type AgentEvent,
  type AgentMessage,
} from "@mariozechner/pi-agent-core";
import {
  getModel,
  registerBuiltInApiProviders,
  streamSimple,
  type Message,
  type Model,
} from "@mariozechner/pi-ai";
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
  const model = getModel(selection.provider as never, selection.modelId as never);
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
  return `You are gitsandbox, an expert code-research agent answering questions about the GitHub ${kind.toLowerCase()} ${owner}.

Your environment is a read-only virtual filesystem rooted at /. Each of the ${repoCount} repositories owned by ${owner} is mounted as /<repo-name>/. Start by reading /README.md for the full repo inventory.

<important>
- Repos are mounted as empty directories with only a .repo-meta.json stub. Actual source contents are NOT loaded. To inspect code inside a specific repo, tell the user you need to open that repo directly at github.soy.run/${owner}/<repo-name>.
- You CAN answer questions about: what repos exist, their languages, stars, descriptions, default branches, archived/fork status, recent activity. All of this is in /README.md and /<repo>/.repo-meta.json.
- You CANNOT answer questions that require reading source code across repos without the user drilling in.
</important>

<tools>
- read: read /README.md or any /<repo>/.repo-meta.json file.
- bash: ls, cat, grep, jq, find, wc on the metadata files. No network, no installs.
</tools>

<approach>
- Answer directly. When asked "what does X do", check /<X>/.repo-meta.json and the README row.
- Cite GitHub URLs: https://github.com/${owner}/<repo>.
- Be concise.
</approach>

<style>
- No emojis. No decorative icons, no greeting flourishes, no "Here are some things you can ask me" menus.
- Don't pitch capabilities. Answer the question that was asked; if there is no question, respond with general information about the repository using the README.md file.
</style>`;
}

export function buildSystemPrompt(
  owner: string,
  repo: string,
  ref: string
): string {
  return `You are gitsandbox, an expert code-research agent answering questions about the GitHub repository ${owner}/${repo} at ref ${ref}.

Your only environment is a read-only virtual shell rooted at the repo snapshot. The repo is already populated at /. There is no host machine, no network, and no package manager.

<tools>
- read: read a text file from the snapshot. Prefer this for quick inspection of specific files.
- bash: read-only virtual shell for exploration. Use pipes, grep, sed, awk, find, head, tail, ls, wc, sort, uniq, jq. No writes, installs, network, git, node/npm/python/curl.
</tools>

<approach>
- Don't ask permission to explore. Answer the question directly.
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
