import { InMemoryFs } from "just-bash/browser";

const GH_API = "https://api.github.com";

export type AccountKind = "User" | "Organization";

export interface AccountMeta {
  login: string;
  kind: AccountKind;
  name?: string;
  bio?: string;
  avatarUrl?: string;
}

export interface RepoSummary {
  name: string;
  description: string | null;
  defaultBranch: string;
  language: string | null;
  stars: number;
  pushedAt: string;
  private: boolean;
  archived: boolean;
  fork: boolean;
}

interface GhUserResponse {
  login: string;
  type: AccountKind;
  name?: string;
  bio?: string;
  avatar_url?: string;
}

interface GhRepoResponse {
  name: string;
  description: string | null;
  default_branch: string;
  language: string | null;
  stargazers_count: number;
  pushed_at: string;
  private: boolean;
  archived: boolean;
  fork: boolean;
}

type Fetcher = (path: string, token?: string) => Promise<Response>;

function defaultFetch(path: string, token?: string): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(`${GH_API}${path}`, { headers });
}

export async function fetchAccountMeta(
  owner: string,
  token?: string,
  fetcher: Fetcher = defaultFetch
): Promise<AccountMeta> {
  const r = await fetcher(`/users/${owner}`, token);
  if (!r.ok) throw new Error(`Account ${owner} not found (${r.status})`);
  const data = (await r.json()) as GhUserResponse;
  return {
    login: data.login,
    kind: data.type,
    name: data.name,
    bio: data.bio,
    avatarUrl: data.avatar_url,
  };
}

export async function fetchAccountRepos(
  owner: string,
  kind: AccountKind,
  opts: { limit?: number; token?: string; fetcher?: Fetcher } = {}
): Promise<RepoSummary[]> {
  const { limit = 50, token, fetcher = defaultFetch } = opts;
  const base = kind === "Organization" ? `/orgs/${owner}/repos` : `/users/${owner}/repos`;
  const perPage = Math.min(100, limit);
  const out: RepoSummary[] = [];
  let page = 1;
  while (out.length < limit) {
    const r = await fetcher(
      `${base}?per_page=${perPage}&page=${page}&sort=pushed&direction=desc`,
      token
    );
    if (!r.ok) throw new Error(`Failed to list repos: ${r.status}`);
    const batch = (await r.json()) as GhRepoResponse[];
    if (batch.length === 0) break;
    for (const r2 of batch) {
      out.push({
        name: r2.name,
        description: r2.description,
        defaultBranch: r2.default_branch,
        language: r2.language,
        stars: r2.stargazers_count,
        pushedAt: r2.pushed_at,
        private: r2.private,
        archived: r2.archived,
        fork: r2.fork,
      });
      if (out.length >= limit) break;
    }
    if (batch.length < perPage) break;
    page += 1;
  }
  return out;
}

export function buildAccountManifest(meta: AccountMeta, repos: RepoSummary[]): string {
  const lines: string[] = [];
  lines.push(`# ${meta.login} (${meta.kind})`);
  if (meta.name) lines.push(`**${meta.name}**`);
  if (meta.bio) lines.push("", meta.bio);
  lines.push("", `${repos.length} repositories. Each is mounted at \`/<repo-name>/\`.`, "");
  lines.push("| Repo | Lang | ★ | Pushed | Description |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const r of repos) {
    const desc = (r.description ?? "").replace(/\|/g, "\\|").slice(0, 100);
    lines.push(
      `| ${r.name} | ${r.language ?? ""} | ${r.stars} | ${r.pushedAt.slice(0, 10)} | ${desc} |`
    );
  }
  return lines.join("\n");
}

export interface AccountFsSkeleton {
  fs: InMemoryFs;
  repoNames: string[];
}

/**
 * Build a skeleton FS for an account:
 * - /README.md  (account manifest)
 * - /<repo>/.repo-meta.json  (per-repo metadata stub)
 * Tree contents for each repo are NOT fetched; call hydrateRepoInto() on demand.
 */
export function buildAccountSkeleton(
  meta: AccountMeta,
  repos: RepoSummary[]
): AccountFsSkeleton {
  const fs = new InMemoryFs();
  fs.writeFileSync("/README.md", buildAccountManifest(meta, repos));
  for (const r of repos) {
    fs.mkdirSync(`/${r.name}`, { recursive: true });
    fs.writeFileSync(
      `/${r.name}/.repo-meta.json`,
      JSON.stringify(
        {
          owner: meta.login,
          repo: r.name,
          defaultBranch: r.defaultBranch,
          description: r.description,
          language: r.language,
          stars: r.stars,
          archived: r.archived,
          fork: r.fork,
        },
        null,
        2
      )
    );
  }
  return { fs, repoNames: repos.map((r) => r.name) };
}
