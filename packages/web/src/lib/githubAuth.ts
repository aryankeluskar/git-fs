import { getCredential, setCredential } from "../db/credentials";
import {
  pollForGithubAccessToken,
  startCopilotDeviceFlow,
  type CopilotCredentials,
} from "./copilotOAuth";

/**
 * Standalone GitHub identity, decoupled from the Copilot exchange.
 *
 * We reuse the Copilot OAuth app's client_id to avoid requiring a separate
 * registered GitHub OAuth app. Its granted scope is `read:user`, which is
 * sufficient to authenticate REST calls for public repo metadata and lift
 * the 60 req/hr unauthenticated rate limit to 5000 req/hr per user.
 *
 * When the user later picks GitHub Copilot as an AI provider, the same
 * token is exchanged for a Copilot bearer (no second device flow).
 */

export const GITHUB_OAUTH_KEY = "GITHUB_OAUTH";
export const COPILOT_OAUTH_KEY = "COPILOT_OAUTH";
export const GITHUB_PAT_KEY = "GITHUB_TOKEN";

export interface GithubCredentials {
  /** GitHub user access token (OAuth). */
  access: string;
  /** Granted scope string (space-separated). */
  scope?: string;
  /** Epoch ms this token was issued. GitHub user tokens don't expire by default. */
  issuedAt: number;
}

async function readGithubOAuth(): Promise<GithubCredentials | null> {
  const raw = await getCredential(GITHUB_OAUTH_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as GithubCredentials;
    if (typeof parsed.access === "string" && parsed.access.length > 0) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

async function readCopilotGithubToken(): Promise<string | null> {
  const raw = await getCredential(COPILOT_OAUTH_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CopilotCredentials;
    return typeof parsed.refresh === "string" && parsed.refresh.length > 0
      ? parsed.refresh
      : null;
  } catch {
    return null;
  }
}

/**
 * Resolve the best available GitHub token for REST calls.
 * Priority: dedicated GitHub OAuth → Copilot's underlying GitHub token → PAT.
 * Returns undefined if none are configured (caller should fall back to
 * unauthenticated requests, accepting the 60 req/hr limit).
 */
export async function getGithubToken(): Promise<string | undefined> {
  const gh = await readGithubOAuth();
  if (gh) return gh.access;

  const copilotGh = await readCopilotGithubToken();
  if (copilotGh) return copilotGh;

  const pat = await getCredential(GITHUB_PAT_KEY);
  if (pat && pat.length > 0) return pat;

  return undefined;
}

/** True if any GitHub credential source is present. */
export async function hasGithubAuth(): Promise<boolean> {
  return (await getGithubToken()) !== undefined;
}

/** Build Authorization headers for api.github.com calls. */
export async function githubAuthHeaders(): Promise<HeadersInit> {
  const token = await getGithubToken();
  const base: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) base.Authorization = `Bearer ${token}`;
  return base;
}

export async function saveGithubCredentials(
  creds: GithubCredentials,
): Promise<void> {
  await setCredential(GITHUB_OAUTH_KEY, JSON.stringify(creds));
}

export interface GithubDeviceFlowHandlers {
  onCode: (info: { userCode: string; verificationUri: string }) => void;
  signal?: AbortSignal;
}

/**
 * Run the GitHub device flow and persist the resulting credentials.
 * Returns the access token so callers can chain (e.g. immediately exchange
 * it for a Copilot token without prompting a second device flow).
 */
export async function loginGithub(
  handlers: GithubDeviceFlowHandlers,
): Promise<GithubCredentials> {
  const device = await startCopilotDeviceFlow();
  handlers.onCode({
    userCode: device.user_code,
    verificationUri: device.verification_uri,
  });
  const access = await pollForGithubAccessToken(
    device.device_code,
    device.interval,
    device.expires_in,
    undefined,
    handlers.signal,
  );
  const creds: GithubCredentials = {
    access,
    scope: "read:user",
    issuedAt: Date.now(),
  };
  await saveGithubCredentials(creds);
  return creds;
}
