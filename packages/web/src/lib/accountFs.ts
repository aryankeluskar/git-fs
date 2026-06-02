import {
  InMemoryFs,
  MountableFs,
  type BufferEncoding,
  type CpOptions,
  type DirectoryEntry,
  type FileContent,
  type FsStat,
  type IFileSystem,
  type MkdirOptions,
  type RmOptions,
} from "just-bash/browser";
import {
  buildAccountManifest,
  type AccountMeta,
  type RepoSummary,
} from "./githubAccount";
import { hydrateRepoFs, type HydratedRepoFs } from "./githubFs";
import { ghFetch, type Fetcher } from "./githubApi";

interface ReadFileOptions {
  encoding?: BufferEncoding | null;
}

interface WriteFileOptions {
  encoding?: BufferEncoding;
}

export interface HydrationEvent {
  repo: string;
  phase: "start" | "success" | "error";
  error?: Error;
  truncated?: boolean;
  fileCount?: number;
  durationMs?: number;
}

export interface LazyAccountFsOptions {
  meta: AccountMeta;
  repos: RepoSummary[];
  token?: () => string | undefined | Promise<string | undefined>;
  fetcher?: Fetcher;
  /**
   * Called whenever a repo is hydrated (first access). Useful for surfacing
   * progress in the UI.
   */
  onHydration?: (event: HydrationEvent) => void;
  /**
   * Hydration hook — overrides the default hydrateRepoFs call. Primarily for
   * tests.
   */
  hydrate?: (repo: string) => Promise<HydratedRepoFs>;
  /**
   * Whether to attempt hydrating repos not present in the initial inventory.
   * When true, the fs will issue a GET /repos/:owner/:name to check existence
   * before giving up with ENOENT. Defaults to true.
   */
  optimistic?: boolean;
}

function enoent(path: string): Error {
  const err = new Error(`ENOENT: no such file or directory, '${path}'`);
  (err as Error & { code?: string }).code = "ENOENT";
  return err;
}

function normalize(path: string): string {
  if (!path.startsWith("/")) path = `/${path}`;
  // collapse double slashes, strip trailing slash except root
  const out = path.replace(/\/+/g, "/");
  if (out.length > 1 && out.endsWith("/")) return out.slice(0, -1);
  return out;
}

function firstSegment(path: string): string | null {
  const n = normalize(path);
  if (n === "/") return null;
  const idx = n.indexOf("/", 1);
  return idx === -1 ? n.slice(1) : n.slice(1, idx);
}

function repoMetaJson(owner: string, repo: RepoSummary): string {
  return JSON.stringify(
    {
      owner,
      repo: repo.name,
      defaultBranch: repo.defaultBranch,
      description: repo.description,
      language: repo.language,
      stars: repo.stars,
      archived: repo.archived,
      fork: repo.fork,
      pushedAt: repo.pushedAt,
    },
    null,
    2
  );
}

/**
 * A filesystem for an entire GitHub account. Each repo is a virtual directory
 * that is hydrated from the GitHub Git Trees API on first access.
 *
 * Structure:
 *   /README.md              — account manifest with repo inventory
 *   /.meta/<repo>.json      — per-repo metadata (always readable, no hydration)
 *   /<repo>/                — lazy mount; hydrates on first read
 *   /<repo>/.repo-meta.json — copy of metadata, written into the hydrated fs
 *   /<repo>/.hydration-status.json — present iff tree was truncated
 */
export class LazyAccountFs implements IFileSystem {
  private readonly mountable: MountableFs;
  private readonly baseFs: InMemoryFs;
  private readonly meta: AccountMeta;
  private readonly inventory: Map<string, RepoSummary>;
  private readonly token?: () => string | undefined | Promise<string | undefined>;
  private readonly fetcher: Fetcher;
  private readonly onHydration?: (event: HydrationEvent) => void;
  private readonly hydrateImpl?: (repo: string) => Promise<HydratedRepoFs>;
  private readonly optimistic: boolean;

  private readonly hydrations = new Map<string, Promise<void>>();
  private readonly failures = new Map<string, Error>();
  private readonly hydratedRepos = new Set<string>();

  constructor(opts: LazyAccountFsOptions) {
    this.meta = opts.meta;
    this.inventory = new Map(opts.repos.map((r) => [r.name, r]));
    this.token = opts.token;
    this.fetcher = opts.fetcher ?? ghFetch;
    this.onHydration = opts.onHydration;
    this.hydrateImpl = opts.hydrate;
    this.optimistic = opts.optimistic ?? true;

    this.baseFs = new InMemoryFs();
    this.baseFs.writeFileSync(
      "/README.md",
      buildAccountManifest(opts.meta, opts.repos)
    );
    this.baseFs.mkdirSync("/.meta", { recursive: true });
    for (const r of opts.repos) {
      this.baseFs.writeFileSync(
        `/.meta/${r.name}.json`,
        repoMetaJson(opts.meta.login, r)
      );
    }

    this.mountable = new MountableFs({ base: this.baseFs });
  }

  getInventory(): ReadonlyMap<string, RepoSummary> {
    return this.inventory;
  }

  isHydrated(repo: string): boolean {
    return this.hydratedRepos.has(repo);
  }

  private async ensureHydratedForPath(path: string): Promise<void> {
    const seg = firstSegment(path);
    if (!seg) return;
    // Skip reserved top-level entries that live on the base fs.
    if (seg === "README.md" || seg === ".meta") return;
    await this.ensureHydrated(seg);
  }

  private async ensureHydrated(repo: string): Promise<void> {
    if (this.hydratedRepos.has(repo)) return;
    const cached = this.failures.get(repo);
    if (cached) throw cached;
    const inFlight = this.hydrations.get(repo);
    if (inFlight) return inFlight;

    if (!this.inventory.has(repo)) {
      if (!this.optimistic) {
        throw enoent(`/${repo}`);
      }
      // Not in inventory — attempt to fetch metadata and add it.
      const discovered = await this.discoverRepo(repo);
      if (!discovered) {
        const err = enoent(`/${repo}`);
        this.failures.set(repo, err);
        throw err;
      }
      this.inventory.set(repo, discovered);
      this.baseFs.writeFileSync(
        `/.meta/${repo}.json`,
        repoMetaJson(this.meta.login, discovered)
      );
    }

    const p = this.performHydration(repo).catch((err: unknown) => {
      const e = err instanceof Error ? err : new Error(String(err));
      this.failures.set(repo, e);
      this.hydrations.delete(repo);
      this.onHydration?.({ repo, phase: "error", error: e });
      throw e;
    });
    this.hydrations.set(repo, p);
    return p;
  }

  private async discoverRepo(repo: string): Promise<RepoSummary | null> {
    const token = this.token ? await this.token() : undefined;
    const r = await this.fetcher(
      `/repos/${this.meta.login}/${repo}`,
      token
    );
    if (!r.ok) return null;
    const data = (await r.json()) as {
      name: string;
      description: string | null;
      default_branch: string;
      language: string | null;
      stargazers_count: number;
      pushed_at: string;
      private: boolean;
      archived: boolean;
      fork: boolean;
    };
    return {
      name: data.name,
      description: data.description,
      defaultBranch: data.default_branch,
      language: data.language,
      stars: data.stargazers_count,
      pushedAt: data.pushed_at,
      private: data.private,
      archived: data.archived,
      fork: data.fork,
    };
  }

  private async performHydration(repo: string): Promise<void> {
    const summary = this.inventory.get(repo);
    if (!summary) throw enoent(`/${repo}`);
    const started = Date.now();
    this.onHydration?.({ repo, phase: "start" });

    const hydrated: HydratedRepoFs = this.hydrateImpl
      ? await this.hydrateImpl(repo)
      : await hydrateRepoFs({
          owner: this.meta.login,
          repo,
          ref: summary.defaultBranch || "HEAD",
          token: this.token,
        });

    // Write .repo-meta.json into the child fs so /<repo>/.repo-meta.json is always readable.
    const childFs = hydrated.fs as InMemoryFs;
    childFs.writeFileSync(
      "/.repo-meta.json",
      repoMetaJson(this.meta.login, summary)
    );
    if (hydrated.truncated) {
      childFs.writeFileSync(
        "/.hydration-status.json",
        JSON.stringify(
          {
            truncated: true,
            fileCount: hydrated.fileCount,
            note:
              "GitHub git trees API returned a truncated tree. Some files are not listed.",
          },
          null,
          2
        )
      );
    }

    this.mountable.mount(`/${repo}`, hydrated.fs);
    this.hydratedRepos.add(repo);
    this.onHydration?.({
      repo,
      phase: "success",
      truncated: hydrated.truncated,
      fileCount: hydrated.fileCount,
      durationMs: Date.now() - started,
    });
  }


  async readFile(
    path: string,
    options?: ReadFileOptions | BufferEncoding
  ): Promise<string> {
    await this.ensureHydratedForPath(path);
    return this.mountable.readFile(path, options);
  }

  async readFileBuffer(path: string): Promise<Uint8Array> {
    await this.ensureHydratedForPath(path);
    return this.mountable.readFileBuffer(path);
  }

  async exists(path: string): Promise<boolean> {
    const seg = firstSegment(path);
    if (seg && this.inventory.has(seg) && !this.hydratedRepos.has(seg)) {
      // For exists() we don't want to eagerly hydrate every repo just because
      // the agent globbed /*. But if the path goes deeper than the repo root,
      // we must hydrate to answer truthfully.
      const n = normalize(path);
      if (n === `/${seg}`) return true;
      try {
        await this.ensureHydrated(seg);
      } catch {
        return false;
      }
    }
    return this.mountable.exists(path);
  }

  private async statVia(
    path: string,
    delegate: (p: string) => Promise<FsStat>
  ): Promise<FsStat> {
    const seg = firstSegment(path);
    const n = normalize(path);
    if (seg && this.inventory.has(seg) && !this.hydratedRepos.has(seg)) {
      if (n === `/${seg}`) {
        // Shortcut: repo root is always a directory.
        return {
          isFile: false,
          isDirectory: true,
          isSymbolicLink: false,
          mode: 0o755,
          size: 0,
          mtime: new Date(),
        };
      }
      await this.ensureHydrated(seg);
    }
    return delegate(path);
  }

  async stat(path: string): Promise<FsStat> {
    return this.statVia(path, (p) => this.mountable.stat(p));
  }

  async lstat(path: string): Promise<FsStat> {
    return this.statVia(path, (p) => this.mountable.lstat(p));
  }

  async readdir(path: string): Promise<string[]> {
    const n = normalize(path);
    if (n === "/") {
      // Merge inventory repo names with base fs entries so unhydrated repos
      // appear in `ls /`.
      const set = new Set<string>(await this.mountable.readdir("/"));
      for (const name of this.inventory.keys()) set.add(name);
      return Array.from(set).sort();
    }
    await this.ensureHydratedForPath(path);
    return this.mountable.readdir(path);
  }

  async realpath(path: string): Promise<string> {
    await this.ensureHydratedForPath(path);
    return this.mountable.realpath(path);
  }

  async readlink(path: string): Promise<string> {
    await this.ensureHydratedForPath(path);
    return this.mountable.readlink(path);
  }


  async writeFile(
    _path: string,
    _content: FileContent,
    _options?: WriteFileOptions | BufferEncoding
  ): Promise<void> {
    throw new Error("EROFS: read-only file system");
  }

  async appendFile(
    _path: string,
    _content: FileContent,
    _options?: WriteFileOptions | BufferEncoding
  ): Promise<void> {
    throw new Error("EROFS: read-only file system");
  }

  async mkdir(_path: string, _options?: MkdirOptions): Promise<void> {
    throw new Error("EROFS: read-only file system");
  }

  async rm(_path: string, _options?: RmOptions): Promise<void> {
    throw new Error("EROFS: read-only file system");
  }

  async cp(_src: string, _dest: string, _options?: CpOptions): Promise<void> {
    throw new Error("EROFS: read-only file system");
  }

  async mv(_src: string, _dest: string): Promise<void> {
    throw new Error("EROFS: read-only file system");
  }

  async chmod(_path: string, _mode: number): Promise<void> {
    throw new Error("EROFS: read-only file system");
  }

  async symlink(_target: string, _linkPath: string): Promise<void> {
    throw new Error("EROFS: read-only file system");
  }

  async link(_existingPath: string, _newPath: string): Promise<void> {
    throw new Error("EROFS: read-only file system");
  }

  async utimes(_path: string, _atime: Date, _mtime: Date): Promise<void> {
    throw new Error("EROFS: read-only file system");
  }


  resolvePath(base: string, path: string): string {
    return this.mountable.resolvePath(base, path);
  }

  getAllPaths(): string[] {
    const set = new Set<string>(this.mountable.getAllPaths());
    for (const name of this.inventory.keys()) set.add(`/${name}`);
    return Array.from(set).sort();
  }
}

// Re-export DirectoryEntry so tests can type-check without importing from
// just-bash directly.
export type { DirectoryEntry };
