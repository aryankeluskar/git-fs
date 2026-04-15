export interface ParsedRepo {
  owner: string;
  repo: string;
  branch: string;
}

export class InvalidRepoUrlError extends Error {
  constructor(input: string) {
    super(`Invalid repository URL: ${input}`);
    this.name = "InvalidRepoUrlError";
  }
}

const GITHUB_URL_RE =
  /^(?:https?:\/\/)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\/tree\/([^\s/]+))?(?:\/|\.git)?$/;

const SHORTHAND_RE = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/;

export function parseRepoUrl(input: string): ParsedRepo {
  const trimmed = input.trim();

  const ghMatch = trimmed.match(GITHUB_URL_RE);
  if (ghMatch) {
    return {
      owner: ghMatch[1],
      repo: ghMatch[2],
      branch: ghMatch[3] ?? "main",
    };
  }

  const shortMatch = trimmed.match(SHORTHAND_RE);
  if (shortMatch) {
    return {
      owner: shortMatch[1],
      repo: shortMatch[2],
      branch: "main",
    };
  }

  throw new InvalidRepoUrlError(trimmed);
}

export function buildTarballUrl(
  parsed: ParsedRepo,
  hasToken: boolean,
  ref?: string
): string {
  const refToUse = ref ?? parsed.branch;
  if (hasToken) {
    return `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/tarball/${refToUse}`;
  }
  return `https://codeload.github.com/${parsed.owner}/${parsed.repo}/tar.gz/refs/heads/${refToUse}`;
}

export function buildTarballCandidates(
  parsed: ParsedRepo,
  hasToken: boolean,
  explicitBranch: boolean
): string[] {
  if (explicitBranch) {
    return [buildTarballUrl(parsed, hasToken)];
  }
  const refs = [parsed.branch, parsed.branch === "main" ? "master" : "main"];
  return refs.map((ref) => buildTarballUrl(parsed, hasToken, ref));
}
