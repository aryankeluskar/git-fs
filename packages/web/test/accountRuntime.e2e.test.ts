// @vitest-environment node
/**
 * End-to-end test for auto-hydration in account scope.
 *
 * This test mocks the GitHub API but exercises the full stack:
 *   createAccountRuntime -> LazyAccountFs -> MountableFs -> Bash interpreter
 *
 * It simulates the exact shell commands the agent would issue in response to
 * a user question like "deep dive into awesome-bun", proving that the `cd`,
 * `ls`, `grep`, `cat` flow transparently hydrates the repo and returns real
 * source contents instead of empty stubs.
 */
import { describe, it, expect } from "vitest";
import {
  createAccountRuntime,
  execInRepo,
  type RepoRuntime,
} from "../src/lib/repoRuntime";

interface MockRepo {
  default_branch: string;
  headSha: string;
  files: Record<string, string>;
  truncated?: boolean;
}

const OVEN: Record<string, MockRepo> = {
  bun: {
    default_branch: "main",
    headSha: "sha_bun",
    files: {
      "README.md": "# Bun\n\nFast JS runtime.",
      "src/runtime.zig": "// bun runtime entry\npub fn main() !void {}\n",
      "src/bun.js/javascript.zig": "// SECRET_MARKER_BUN_JS",
      "package.json": '{"name":"bun","version":"1.1.0"}',
    },
  },
  "awesome-bun": {
    default_branch: "master",
    headSha: "sha_awesome",
    files: {
      "README.md":
        "# Awesome Bun\n\n## Frameworks\n- elysia\n- hono\n\n## Tools\n- SECRET_MARKER_AWESOME\n",
      "CONTRIBUTING.md": "contribute here",
    },
  },
};

const ORG_REPOS = [
  {
    name: "bun",
    description: "Fast JS runtime",
    default_branch: "main",
    language: "Zig",
    stargazers_count: 89000,
    pushed_at: "2026-04-18T00:00:00Z",
    private: false,
    archived: false,
    fork: false,
  },
  {
    name: "awesome-bun",
    description: "A curated list",
    default_branch: "master",
    language: null,
    stargazers_count: 3548,
    pushed_at: "2026-04-17T00:00:00Z",
    private: false,
    archived: false,
    fork: false,
  },
];

type Call = { path: string };

function installFetchMock(): { calls: Call[]; restore: () => void } {
  const calls: Call[] = [];
  const orig = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    const u = new URL(url);
    const p = u.pathname + u.search;
    calls.push({ path: p });

    if (u.pathname === "/users/oven-sh") {
      return new Response(
        JSON.stringify({
          login: "oven-sh",
          type: "Organization",
          name: "Oven",
          avatar_url: "x",
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    if (u.pathname === "/orgs/oven-sh/repos") {
      return new Response(JSON.stringify(ORG_REPOS), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    // repo meta: /repos/oven-sh/<name>
    const metaMatch = u.pathname.match(/^\/repos\/oven-sh\/([^/]+)$/);
    if (metaMatch) {
      const repo = OVEN[metaMatch[1]];
      if (!repo) return new Response("nf", { status: 404 });
      return new Response(
        JSON.stringify({ default_branch: repo.default_branch }),
        { status: 200 }
      );
    }
    // branch: /repos/oven-sh/<name>/branches/<branch>
    const branchMatch = u.pathname.match(
      /^\/repos\/oven-sh\/([^/]+)\/branches\/([^/]+)$/
    );
    if (branchMatch) {
      const repo = OVEN[branchMatch[1]];
      if (!repo || branchMatch[2] !== repo.default_branch) {
        return new Response("nf", { status: 404 });
      }
      return new Response(JSON.stringify({ commit: { sha: repo.headSha } }), {
        status: 200,
      });
    }
    // tree: /repos/oven-sh/<name>/git/trees/<sha>
    const treeMatch = u.pathname.match(
      /^\/repos\/oven-sh\/([^/]+)\/git\/trees\/(.+)$/
    );
    if (treeMatch) {
      const repo = OVEN[treeMatch[1]];
      if (!repo) return new Response("nf", { status: 404 });
      const entries: Array<{
        path: string;
        mode: string;
        type: "blob" | "tree";
        sha: string;
        size: number;
      }> = [];
      const dirs = new Set<string>();
      for (const path of Object.keys(repo.files)) {
        const parts = path.split("/");
        for (let i = 1; i < parts.length; i += 1) {
          dirs.add(parts.slice(0, i).join("/"));
        }
        entries.push({
          path,
          mode: "100644",
          type: "blob",
          sha: `b_${path}`,
          size: repo.files[path].length,
        });
      }
      for (const d of dirs) {
        entries.push({ path: d, mode: "040000", type: "tree", sha: `t_${d}`, size: 0 });
      }
      return new Response(
        JSON.stringify({
          sha: treeMatch[2].split("?")[0],
          url: "",
          tree: entries,
          truncated: repo.truncated ?? false,
        }),
        { status: 200 }
      );
    }
    // blob: /repos/oven-sh/<name>/contents/<path>?ref=<sha>
    const blobMatch = u.pathname.match(
      /^\/repos\/oven-sh\/([^/]+)\/contents\/(.+)$/
    );
    if (blobMatch) {
      const repo = OVEN[blobMatch[1]];
      if (!repo) return new Response("nf", { status: 404 });
      const path = decodeURIComponent(blobMatch[2]);
      const content = repo.files[path];
      if (content === undefined) return new Response("nf", { status: 404 });
      return new Response(content, { status: 200 });
    }
    return new Response("unhandled " + p, { status: 500 });
  }) as typeof fetch;

  return {
    calls,
    restore: () => {
      globalThis.fetch = orig;
    },
  };
}

async function sh(
  runtime: RepoRuntime,
  cmd: string
): Promise<{ stdout: string; stderr: string; exitCode: number; cwd: string }> {
  return execInRepo(runtime, cmd);
}

describe("account runtime e2e — auto-hydration through Bash", () => {
  it("completes the full 'deep dive' flow: boot, ls, cd, cat, grep, find", async () => {
    const mock = installFetchMock();
    try {
      const runtime = await createAccountRuntime({ owner: "oven-sh" });
      expect(runtime.scope).toBe("account");
      expect(runtime.accountRepos?.length).toBe(2);

      // Step 1: ls / should show both repo directories plus README.md and .meta,
      // with no hydration yet.
      const lsRoot = await sh(runtime, "ls /");
      expect(lsRoot.exitCode).toBe(0);
      expect(lsRoot.stdout).toContain("bun");
      expect(lsRoot.stdout).toContain("awesome-bun");
      expect(lsRoot.stdout).toContain("README.md");

      // No tree fetches yet.
      expect(
        mock.calls.some((c) => c.path.includes("/git/trees/"))
      ).toBe(false);

      // Step 2: cat the account README — still no hydration.
      const readme = await sh(runtime, "cat /README.md");
      expect(readme.stdout).toContain("oven-sh (Organization)");
      expect(
        mock.calls.some((c) => c.path.includes("/git/trees/"))
      ).toBe(false);

      // Step 3: inventory-only question — read .meta files.
      const meta = await sh(runtime, "cat /.meta/bun.json");
      expect(meta.stdout).toContain('"repo": "bun"');
      expect(meta.stdout).toContain('"stars": 89000');
      expect(
        mock.calls.some((c) => c.path.includes("/git/trees/"))
      ).toBe(false);

      // Step 4: drill into awesome-bun — first cd+ls must hydrate it.
      const cdAwesome = await sh(runtime, "cd /awesome-bun && ls -a");
      expect(cdAwesome.exitCode).toBe(0);
      expect(cdAwesome.stdout).toContain("README.md");
      expect(cdAwesome.stdout).toContain("CONTRIBUTING.md");
      expect(cdAwesome.stdout).toContain(".repo-meta.json");
      expect(runtime.fs.constructor.name).toBe("LazyAccountFs");
      const treeFetchesAfterAwesome = mock.calls.filter((c) =>
        c.path.startsWith("/repos/oven-sh/awesome-bun/git/trees/")
      ).length;
      expect(treeFetchesAfterAwesome).toBe(1);

      // Step 5: grep for a marker inside awesome-bun — blob fetched lazily.
      const grep = await sh(
        runtime,
        "grep -r SECRET_MARKER_AWESOME /awesome-bun"
      );
      expect(grep.exitCode).toBe(0);
      expect(grep.stdout).toContain("SECRET_MARKER_AWESOME");

      // Step 6: drill into bun — second repo hydrates independently.
      const findBun = await sh(runtime, "find /bun -name '*.zig'");
      expect(findBun.exitCode).toBe(0);
      expect(findBun.stdout).toContain("/bun/src/runtime.zig");
      expect(findBun.stdout).toContain("/bun/src/bun.js/javascript.zig");
      const treeFetchesAfterBun = mock.calls.filter((c) =>
        c.path.startsWith("/repos/oven-sh/bun/git/trees/")
      ).length;
      expect(treeFetchesAfterBun).toBe(1);

      // Step 7: second access into bun triggers NO additional tree fetch.
      const catBun = await sh(runtime, "cat /bun/package.json");
      expect(catBun.stdout).toContain('"name":"bun"');
      const treeFetchesFinal = mock.calls.filter((c) =>
        c.path.startsWith("/repos/oven-sh/bun/git/trees/")
      ).length;
      expect(treeFetchesFinal).toBe(1);

      // Step 8: cwd is preserved across execInRepo calls.
      await sh(runtime, "cd /awesome-bun");
      const pwd = await sh(runtime, "pwd");
      expect(pwd.stdout.trim()).toBe("/awesome-bun");

      // Step 9: accessing a nonexistent repo yields ENOENT, no crash.
      const ghost = await sh(runtime, "ls /does-not-exist");
      expect(ghost.exitCode).not.toBe(0);
    } finally {
      mock.restore();
    }
  });

  it("auto-hydrates when shell cd jumps deep into unhydrated repo", async () => {
    const mock = installFetchMock();
    try {
      const runtime = await createAccountRuntime({ owner: "oven-sh" });
      // The agent sometimes jumps multiple levels in one go.
      const result = await sh(
        runtime,
        "cat /bun/src/bun.js/javascript.zig"
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("SECRET_MARKER_BUN_JS");
      const treeFetches = mock.calls.filter((c) =>
        c.path.includes("/bun/git/trees/")
      ).length;
      expect(treeFetches).toBe(1);
    } finally {
      mock.restore();
    }
  });
});
