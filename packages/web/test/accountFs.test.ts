// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { InMemoryFs } from "just-bash/browser";
import { LazyAccountFs, type HydrationEvent } from "../src/lib/accountFs";
import type { AccountMeta, RepoSummary } from "../src/lib/githubAccount";
import type { HydratedRepoFs } from "../src/lib/githubFs";

const meta: AccountMeta = {
  login: "oven-sh",
  kind: "Organization",
  name: "Oven",
};

function summary(
  name: string,
  overrides: Partial<RepoSummary> = {}
): RepoSummary {
  return {
    name,
    description: `the ${name} repo`,
    defaultBranch: "main",
    language: "TypeScript",
    stars: 1,
    pushedAt: "2026-01-01T00:00:00Z",
    private: false,
    archived: false,
    fork: false,
    ...overrides,
  };
}

function hydratedStub(files: Record<string, string>, truncated = false): HydratedRepoFs {
  const fs = new InMemoryFs();
  for (const [path, content] of Object.entries(files)) {
    const abs = path.startsWith("/") ? path : `/${path}`;
    fs.writeFileSync(abs, content);
  }
  return { fs, resolvedRef: "main", headSha: "sha", truncated, fileCount: Object.keys(files).length };
}

describe("LazyAccountFs", () => {
  it("lists all inventory repos in ls / without hydrating any", async () => {
    const hydrate = vi.fn();
    const fs = new LazyAccountFs({
      meta,
      repos: [summary("bun"), summary("awesome-bun")],
      hydrate,
    });
    const entries = await fs.readdir("/");
    expect(entries).toContain("bun");
    expect(entries).toContain("awesome-bun");
    expect(entries).toContain("README.md");
    expect(entries).toContain(".meta");
    expect(hydrate).not.toHaveBeenCalled();
  });

  it("serves /README.md and /.meta/<repo>.json without hydration", async () => {
    const hydrate = vi.fn();
    const fs = new LazyAccountFs({
      meta,
      repos: [summary("bun")],
      hydrate,
    });
    const readme = await fs.readFile("/README.md");
    expect(readme).toContain("oven-sh (Organization)");
    const bunMeta = JSON.parse(await fs.readFile("/.meta/bun.json"));
    expect(bunMeta.owner).toBe("oven-sh");
    expect(bunMeta.repo).toBe("bun");
    expect(hydrate).not.toHaveBeenCalled();
  });

  it("hydrates a repo transparently on first read", async () => {
    const hydrate = vi.fn(async (_repo: string) =>
      hydratedStub({ "README.md": "# bun", "src/index.ts": "export {}" })
    );
    const fs = new LazyAccountFs({
      meta,
      repos: [summary("bun")],
      hydrate,
    });
    expect(fs.isHydrated("bun")).toBe(false);
    const content = await fs.readFile("/bun/README.md");
    expect(content).toBe("# bun");
    expect(fs.isHydrated("bun")).toBe(true);
    expect(hydrate).toHaveBeenCalledTimes(1);

    // Second read must not trigger another hydration.
    await fs.readFile("/bun/src/index.ts");
    expect(hydrate).toHaveBeenCalledTimes(1);
  });

  it("writes .repo-meta.json into the hydrated fs", async () => {
    const hydrate = async () => hydratedStub({ "pkg.json": "{}" });
    const fs = new LazyAccountFs({
      meta,
      repos: [summary("bun")],
      hydrate,
    });
    const meta1 = JSON.parse(await fs.readFile("/bun/.repo-meta.json"));
    expect(meta1.owner).toBe("oven-sh");
    expect(meta1.repo).toBe("bun");
  });

  it("writes .hydration-status.json when tree is truncated", async () => {
    const hydrate = async () =>
      hydratedStub({ "a.ts": "x" }, /* truncated */ true);
    const fs = new LazyAccountFs({
      meta,
      repos: [summary("bun")],
      hydrate,
    });
    await fs.readdir("/bun");
    const status = JSON.parse(
      await fs.readFile("/bun/.hydration-status.json")
    );
    expect(status.truncated).toBe(true);
  });

  it("deduplicates concurrent hydrations into one fetch", async () => {
    let resolve!: (v: HydratedRepoFs) => void;
    const hydrate = vi.fn(
      () =>
        new Promise<HydratedRepoFs>((r) => {
          resolve = r;
        })
    );
    const fs = new LazyAccountFs({
      meta,
      repos: [summary("bun")],
      hydrate,
    });
    // Fire five concurrent accesses before hydration completes.
    const promises = [
      fs.readFile("/bun/a.ts"),
      fs.readFile("/bun/b.ts"),
      fs.readdir("/bun"),
      fs.stat("/bun/a.ts"),
      fs.exists("/bun/c.ts"),
    ];
    // Only one hydration call must be in flight.
    expect(hydrate).toHaveBeenCalledTimes(1);
    resolve(hydratedStub({ "a.ts": "a", "b.ts": "b" }));
    // c.ts doesn't exist, so exists() is false but must not throw.
    const [a, b, entries, stA, existsC] = await Promise.all(promises);
    expect(a).toBe("a");
    expect(b).toBe("b");
    expect(entries).toEqual(expect.arrayContaining(["a.ts", "b.ts"]));
    expect(stA.isFile).toBe(true);
    expect(existsC).toBe(false);
    expect(hydrate).toHaveBeenCalledTimes(1);
  });

  it("returns ENOENT for a repo that is not in inventory and not discoverable", async () => {
    const hydrate = vi.fn();
    const fetcher = async () => new Response("not found", { status: 404 });
    const fs = new LazyAccountFs({
      meta,
      repos: [summary("bun")],
      hydrate,
      fetcher,
    });
    await expect(fs.readFile("/ghost/README.md")).rejects.toThrow(/ENOENT/);
    expect(hydrate).not.toHaveBeenCalled();
  });

  it("does not attempt discovery when optimistic is false", async () => {
    const fetcher = vi.fn(async () => new Response("{}", { status: 200 }));
    const hydrate = vi.fn();
    const fs = new LazyAccountFs({
      meta,
      repos: [summary("bun")],
      hydrate,
      fetcher,
      optimistic: false,
    });
    await expect(fs.readFile("/ghost/README.md")).rejects.toThrow(/ENOENT/);
    expect(fetcher).not.toHaveBeenCalled();
    expect(hydrate).not.toHaveBeenCalled();
  });

  it("optimistically discovers and hydrates a repo not in initial inventory", async () => {
    const fetcher = vi.fn(async (path: string) => {
      if (path === "/repos/oven-sh/bun-pypi") {
        return new Response(
          JSON.stringify({
            name: "bun-pypi",
            description: "bun for pypi",
            default_branch: "main",
            language: "Python",
            stargazers_count: 2,
            pushed_at: "2026-02-01T00:00:00Z",
            private: false,
            archived: false,
            fork: false,
          }),
          { status: 200 }
        );
      }
      return new Response("not found", { status: 404 });
    });
    const hydrate = vi.fn(async () =>
      hydratedStub({ "setup.py": "print('ok')" })
    );
    const fs = new LazyAccountFs({
      meta,
      repos: [summary("bun")],
      hydrate,
      fetcher,
    });
    const content = await fs.readFile("/bun-pypi/setup.py");
    expect(content).toBe("print('ok')");
    expect(hydrate).toHaveBeenCalledWith("bun-pypi");
    // A later access should not re-discover.
    await fs.readFile("/bun-pypi/setup.py");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("caches hydration failures so they do not retry on every access", async () => {
    let calls = 0;
    const hydrate = vi.fn(async () => {
      calls += 1;
      throw new Error("rate limited");
    });
    const fs = new LazyAccountFs({
      meta,
      repos: [summary("bun")],
      hydrate,
    });
    await expect(fs.readFile("/bun/a.ts")).rejects.toThrow(/rate limited/);
    await expect(fs.readFile("/bun/b.ts")).rejects.toThrow(/rate limited/);
    expect(calls).toBe(1);
  });

  it("stat of an unhydrated repo root returns directory without hydrating", async () => {
    const hydrate = vi.fn();
    const fs = new LazyAccountFs({
      meta,
      repos: [summary("bun")],
      hydrate,
    });
    const st = await fs.stat("/bun");
    expect(st.isDirectory).toBe(true);
    expect(hydrate).not.toHaveBeenCalled();
  });

  it("hydrates when cwd jumps deep into a repo (cd /bun/src/deep)", async () => {
    const hydrate = vi.fn(async () =>
      hydratedStub({ "src/deep/inner.ts": "x" })
    );
    const fs = new LazyAccountFs({
      meta,
      repos: [summary("bun")],
      hydrate,
    });
    // Stat on a nested path must hydrate.
    const st = await fs.stat("/bun/src/deep/inner.ts");
    expect(st.isFile).toBe(true);
    expect(hydrate).toHaveBeenCalledTimes(1);
  });

  it("emits hydration lifecycle events", async () => {
    const events: HydrationEvent[] = [];
    const hydrate = async () => hydratedStub({ "a.ts": "a" });
    const fs = new LazyAccountFs({
      meta,
      repos: [summary("bun")],
      hydrate,
      onHydration: (e) => events.push(e),
    });
    await fs.readFile("/bun/a.ts");
    expect(events.map((e) => e.phase)).toEqual(["start", "success"]);
    expect(events[1].fileCount).toBe(1);
  });

  it("rejects writes with EROFS", async () => {
    const fs = new LazyAccountFs({
      meta,
      repos: [summary("bun")],
      hydrate: async () => hydratedStub({ "a.ts": "a" }),
    });
    await expect(fs.writeFile("/new.txt", "x")).rejects.toThrow(/EROFS/);
    await expect(fs.rm("/README.md")).rejects.toThrow(/EROFS/);
    await expect(fs.mkdir("/new")).rejects.toThrow(/EROFS/);
  });
});
