export type UrlTarget =
  | { kind: "repo"; owner: string; repo: string; branch: string }
  | { kind: "account"; owner: string }
  | null;

const SEGMENT_RE = /^[A-Za-z0-9_.-]+$/;

function isValidSegment(s: string): boolean {
  return SEGMENT_RE.test(s);
}

export function extractTargetFromPath(pathname: string): UrlTarget {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return null;

  const owner = segments[0];
  if (!isValidSegment(owner)) return null;

  if (segments.length === 1) {
    return { kind: "account", owner };
  }

  const repo = segments[1];
  if (!isValidSegment(repo)) return null;

  let branch = "main";
  if (segments[2] === "tree" && segments[3]) {
    branch = segments.slice(3).join("/");
  }

  return { kind: "repo", owner, repo, branch };
}
