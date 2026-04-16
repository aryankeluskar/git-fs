import { Bash, type InMemoryFs, type BashExecResult } from "just-bash/browser";
import { hydrateRepoFs, type HydratedRepoFs } from "./githubFs";
import {
  buildAccountSkeleton,
  fetchAccountMeta,
  fetchAccountRepos,
  type AccountMeta,
  type RepoSummary,
} from "./githubAccount";

export type RuntimeScope = "repo" | "account";

export interface RepoRuntime {
  scope: RuntimeScope;
  fs: InMemoryFs;
  bash: Bash;
  owner: string;
  repo: string;
  ref: string;
  headSha: string;
  truncated: boolean;
  fileCount: number;
  accountMeta?: AccountMeta;
  accountRepos?: RepoSummary[];
  getCwd(): string;
  setCwd(next: string): void;
}

export interface RepoExecResult extends BashExecResult {
  cwd: string;
}

export interface CreateRepoRuntimeOptions {
  owner: string;
  repo: string;
  ref?: string;
  getToken?: () => string | undefined | Promise<string | undefined>;
}

export async function createRepoRuntime(
  opts: CreateRepoRuntimeOptions
): Promise<RepoRuntime> {
  const hydrated: HydratedRepoFs = await hydrateRepoFs({
    owner: opts.owner,
    repo: opts.repo,
    ref: opts.ref ?? "HEAD",
    token: opts.getToken,
  });

  const bash = new Bash({ cwd: "/", fs: hydrated.fs });
  let cwd = "/";

  return {
    scope: "repo",
    fs: hydrated.fs,
    bash,
    owner: opts.owner,
    repo: opts.repo,
    ref: hydrated.resolvedRef,
    headSha: hydrated.headSha,
    truncated: hydrated.truncated,
    fileCount: hydrated.fileCount,
    getCwd: () => cwd,
    setCwd: (next) => {
      if (!next) return;
      cwd = next.startsWith("/") ? next : `/${next}`;
    },
  };
}

export interface CreateAccountRuntimeOptions {
  owner: string;
  limit?: number;
  getToken?: () => string | undefined | Promise<string | undefined>;
}

export async function createAccountRuntime(
  opts: CreateAccountRuntimeOptions
): Promise<RepoRuntime> {
  const token = opts.getToken ? await opts.getToken() : undefined;
  const fetcher = async (path: string, t?: string) => {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    if (t) headers.Authorization = `Bearer ${t}`;
    return fetch(`https://api.github.com${path}`, { headers });
  };
  const meta = await fetchAccountMeta(opts.owner, token, fetcher);
  const repos = await fetchAccountRepos(opts.owner, meta.kind, {
    limit: opts.limit ?? 50,
    token,
    fetcher,
  });
  const { fs } = buildAccountSkeleton(meta, repos);
  const bash = new Bash({ cwd: "/", fs });
  let cwd = "/";

  return {
    scope: "account",
    fs,
    bash,
    owner: opts.owner,
    repo: "",
    ref: meta.kind === "Organization" ? "org" : "user",
    headSha: "",
    truncated: false,
    fileCount: repos.length,
    accountMeta: meta,
    accountRepos: repos,
    getCwd: () => cwd,
    setCwd: (next) => {
      if (!next) return;
      cwd = next.startsWith("/") ? next : `/${next}`;
    },
  };
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export async function execInRepo(
  runtime: RepoRuntime,
  command: string,
  signal?: AbortSignal
): Promise<RepoExecResult> {
  const cwd = runtime.getCwd();
  const script = cwd === "/" ? command : `cd ${shellQuote(cwd)}\n${command}`;
  const result = await runtime.bash.exec(script, { cwd, signal });
  const nextCwd = result.env?.PWD;
  if (nextCwd) runtime.setCwd(nextCwd);
  return { ...result, cwd: runtime.getCwd() };
}
