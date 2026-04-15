import { describe, it, expect } from "vitest";
import {
  parseRepoUrl,
  buildTarballUrl,
  buildTarballCandidates,
  InvalidRepoUrlError,
} from "../src/repo";

describe("parseRepoUrl", () => {
  it("parses full GitHub URL", () => {
    expect(parseRepoUrl("https://github.com/owner/repo")).toEqual({
      owner: "owner",
      repo: "repo",
      branch: "main",
    });
  });

  it("parses GitHub URL with branch", () => {
    expect(parseRepoUrl("https://github.com/owner/repo/tree/dev")).toEqual({
      owner: "owner",
      repo: "repo",
      branch: "dev",
    });
  });

  it("parses shorthand owner/repo", () => {
    expect(parseRepoUrl("owner/repo")).toEqual({
      owner: "owner",
      repo: "repo",
      branch: "main",
    });
  });

  it("throws InvalidRepoUrlError on bad input", () => {
    expect(() => parseRepoUrl("not-a-url")).toThrow(InvalidRepoUrlError);
  });

  it("handles trailing slash", () => {
    expect(parseRepoUrl("https://github.com/a/b/")).toEqual({
      owner: "a",
      repo: "b",
      branch: "main",
    });
  });

  it("handles .git suffix", () => {
    expect(parseRepoUrl("https://github.com/a/b.git")).toEqual({
      owner: "a",
      repo: "b",
      branch: "main",
    });
  });
});

describe("buildTarballUrl", () => {
  it("builds codeload URL without token", () => {
    const url = buildTarballUrl(
      { owner: "expressjs", repo: "express", branch: "main" },
      false
    );
    expect(url).toBe(
      "https://codeload.github.com/expressjs/express/tar.gz/refs/heads/main"
    );
  });

  it("builds API URL with token", () => {
    const url = buildTarballUrl(
      { owner: "expressjs", repo: "express", branch: "main" },
      true
    );
    expect(url).toBe(
      "https://api.github.com/repos/expressjs/express/tarball/main"
    );
  });

  it("builds URL with explicit ref override", () => {
    const url = buildTarballUrl(
      { owner: "a", repo: "b", branch: "main" },
      false,
      "master"
    );
    expect(url).toBe(
      "https://codeload.github.com/a/b/tar.gz/refs/heads/master"
    );
  });
});

describe("buildTarballCandidates", () => {
  it("returns main then master when branch is default", () => {
    const urls = buildTarballCandidates(
      { owner: "a", repo: "b", branch: "main" },
      false,
      false
    );
    expect(urls).toEqual([
      "https://codeload.github.com/a/b/tar.gz/refs/heads/main",
      "https://codeload.github.com/a/b/tar.gz/refs/heads/master",
    ]);
  });

  it("returns only explicit branch when user provided one", () => {
    const urls = buildTarballCandidates(
      { owner: "a", repo: "b", branch: "dev" },
      false,
      true
    );
    expect(urls).toEqual([
      "https://codeload.github.com/a/b/tar.gz/refs/heads/dev",
    ]);
  });

  it("uses api.github.com when token is available", () => {
    const urls = buildTarballCandidates(
      { owner: "a", repo: "b", branch: "main" },
      true,
      false
    );
    expect(urls).toEqual([
      "https://api.github.com/repos/a/b/tarball/main",
      "https://api.github.com/repos/a/b/tarball/master",
    ]);
  });
});
