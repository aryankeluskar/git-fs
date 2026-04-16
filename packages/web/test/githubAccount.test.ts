// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  fetchAccountMeta,
  fetchAccountRepos,
  buildAccountManifest,
  buildAccountSkeleton,
  type RepoSummary,
  type AccountMeta,
} from "../src/lib/githubAccount";

function mockFetcher(routes: Record<string, unknown>) {
  return async (path: string): Promise<Response> => {
    const key = Object.keys(routes).find((k) => path.startsWith(k));
    if (!key) {
      return new Response("not found", { status: 404 });
    }
    return new Response(JSON.stringify(routes[key]), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
}

const meta: AccountMeta = {
  login: "aryankeluskar",
  kind: "User",
  name: "Aryan",
  avatarUrl: "a.png",
};

const repos: RepoSummary[] = [
  {
    name: "alpha",
    description: "first",
    defaultBranch: "main",
    language: "TypeScript",
    stars: 3,
    pushedAt: "2026-01-02T00:00:00Z",
    private: false,
    archived: false,
    fork: false,
  },
  {
    name: "beta",
    description: null,
    defaultBranch: "master",
    language: null,
    stars: 0,
    pushedAt: "2025-12-01T00:00:00Z",
    private: false,
    archived: false,
    fork: false,
  },
];

describe("fetchAccountMeta", () => {
  it("parses user response", async () => {
    const fetcher = mockFetcher({
      "/users/foo": { login: "foo", type: "User", name: "Foo", avatar_url: "x" },
    });
    const m = await fetchAccountMeta("foo", undefined, fetcher);
    expect(m).toEqual({
      login: "foo",
      kind: "User",
      name: "Foo",
      bio: undefined,
      avatarUrl: "x",
    });
  });

  it("throws on 404", async () => {
    const fetcher = mockFetcher({});
    await expect(fetchAccountMeta("nope", undefined, fetcher)).rejects.toThrow();
  });
});

describe("fetchAccountRepos", () => {
  it("uses /orgs/ path for organizations", async () => {
    let seenPath = "";
    const fetcher = async (path: string) => {
      seenPath = path;
      return new Response(JSON.stringify([]), { status: 200 });
    };
    await fetchAccountRepos("acme", "Organization", { fetcher });
    expect(seenPath.startsWith("/orgs/acme/repos")).toBe(true);
  });

  it("uses /users/ path for users and maps fields", async () => {
    const raw = [
      {
        name: "alpha",
        description: "d",
        default_branch: "main",
        language: "Go",
        stargazers_count: 5,
        pushed_at: "2026-01-01T00:00:00Z",
        private: false,
        archived: false,
        fork: false,
      },
    ];
    const fetcher = async (path: string) => {
      if (path.startsWith("/users/foo/repos")) {
        return new Response(JSON.stringify(raw), { status: 200 });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    };
    const got = await fetchAccountRepos("foo", "User", { fetcher, limit: 10 });
    expect(got).toHaveLength(1);
    expect(got[0].name).toBe("alpha");
    expect(got[0].stars).toBe(5);
  });

  it("respects limit", async () => {
    const make = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        name: `r${i}`,
        description: null,
        default_branch: "main",
        language: null,
        stargazers_count: 0,
        pushed_at: "2026-01-01T00:00:00Z",
        private: false,
        archived: false,
        fork: false,
      }));
    const fetcher = async (path: string) => {
      const page = Number(new URL("http://x" + path).searchParams.get("page") ?? "1");
      return new Response(JSON.stringify(page === 1 ? make(100) : []), {
        status: 200,
      });
    };
    const got = await fetchAccountRepos("foo", "User", { fetcher, limit: 30 });
    expect(got).toHaveLength(30);
  });
});

describe("buildAccountManifest", () => {
  it("includes header and table rows", () => {
    const md = buildAccountManifest(meta, repos);
    expect(md).toContain("# aryankeluskar (User)");
    expect(md).toContain("alpha");
    expect(md).toContain("beta");
    expect(md).toContain("2 repositories");
  });

  it("escapes pipes in description", () => {
    const md = buildAccountManifest(meta, [
      { ...repos[0], description: "pipe|test" },
    ]);
    expect(md).toContain("pipe\\|test");
  });
});

describe("buildAccountSkeleton", () => {
  it("creates README and per-repo metadata stubs", async () => {
    const { fs, repoNames } = buildAccountSkeleton(meta, repos);
    expect(repoNames).toEqual(["alpha", "beta"]);
    const dec = new TextDecoder();
    const readme = dec.decode(await fs.readFileBuffer("/README.md"));
    expect(readme).toContain("aryankeluskar");
    const alphaMeta = JSON.parse(
      dec.decode(await fs.readFileBuffer("/alpha/.repo-meta.json"))
    );
    expect(alphaMeta.owner).toBe("aryankeluskar");
    expect(alphaMeta.repo).toBe("alpha");
    expect(alphaMeta.defaultBranch).toBe("main");
  });

  it("does not fetch tree contents (only meta stubs present)", async () => {
    const { fs } = buildAccountSkeleton(meta, repos);
    const entries = await fs.readdir("/alpha");
    expect(entries).toEqual([".repo-meta.json"]);
  });
});
