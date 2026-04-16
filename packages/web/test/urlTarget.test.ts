import { describe, it, expect } from "vitest";
import { extractTargetFromPath } from "../src/lib/urlTarget";

describe("extractTargetFromPath", () => {
  it("returns null for root", () => {
    expect(extractTargetFromPath("/")).toBeNull();
  });

  it("returns account for single segment", () => {
    expect(extractTargetFromPath("/aryankeluskar")).toEqual({
      kind: "account",
      owner: "aryankeluskar",
    });
  });

  it("returns repo for two segments", () => {
    expect(extractTargetFromPath("/expressjs/express")).toEqual({
      kind: "repo",
      owner: "expressjs",
      repo: "express",
      branch: "main",
    });
  });

  it("handles tree branch", () => {
    expect(extractTargetFromPath("/o/r/tree/dev")).toEqual({
      kind: "repo",
      owner: "o",
      repo: "r",
      branch: "dev",
    });
  });

  it("handles slashed branch", () => {
    expect(extractTargetFromPath("/o/r/tree/feat/x")).toEqual({
      kind: "repo",
      owner: "o",
      repo: "r",
      branch: "feat/x",
    });
  });

  it("rejects invalid owner char", () => {
    expect(extractTargetFromPath("/bad name")).toBeNull();
  });

  it("rejects invalid repo char", () => {
    expect(extractTargetFromPath("/owner/bad name")).toBeNull();
  });
});
