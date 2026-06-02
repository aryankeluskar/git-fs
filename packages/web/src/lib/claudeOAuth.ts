import { getApiBase } from "./config";
import {
  requireString,
  requireNumber,
  parseLoginCode,
  postJsonToken,
} from "./oauthUtils";

/**
 * Claude Pro/Max (Anthropic subscription) OAuth credential handling.
 *
 * Refresh goes through the gitfs worker since
 * platform.claude.com doesn't set CORS for arbitrary origins.
 */

const TOKEN_PROXY_PATH = "/oauth/anthropic/token";
const CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";

/**
 * Anthropic refuses direct browser calls for OAuth-authenticated
 * (Pro/Max subscription) tokens regardless of the
 * `anthropic-dangerous-direct-browser-access` header — it returns
 * `authentication_error: CORS requests are not allowed for this
 * Organization`. Route all inference through the worker so it
 * originates server-side without `Origin`/`Referer`.
 */
export function getAnthropicBaseUrl(): string {
  return `${getApiBase()}/anthropic-api`;
}

export interface ClaudeCredentials {
  access: string;
  refresh: string;
  expires: number;
  providerId: "anthropic";
}

interface ClaudeCredentialsDraft {
  access?: unknown;
  refresh?: unknown;
  expires?: unknown;
  providerId?: unknown;
}

function validateDraft(draft: ClaudeCredentialsDraft): ClaudeCredentials {
  if (draft.providerId !== "anthropic") {
    throw new Error("Login code is not for Claude (anthropic)");
  }
  return {
    access: requireString(draft.access, "access token"),
    refresh: requireString(draft.refresh, "refresh token"),
    expires: requireNumber(draft.expires, "expires"),
    providerId: "anthropic",
  };
}

export function parseImportedClaudeCredentials(value: string): ClaudeCredentials {
  return validateDraft(parseLoginCode(value) as ClaudeCredentialsDraft);
}

export async function refreshClaude(
  creds: ClaudeCredentials,
): Promise<ClaudeCredentials> {
  const tokenData = await postJsonToken(
    `${getApiBase()}${TOKEN_PROXY_PATH}`,
    {
      client_id: CLIENT_ID,
      grant_type: "refresh_token",
      refresh_token: creds.refresh,
    },
    "Anthropic token request failed"
  );

  const access = tokenData.access_token;
  const refresh = tokenData.refresh_token;
  const expiresIn = tokenData.expires_in;

  if (
    typeof access !== "string" ||
    typeof refresh !== "string" ||
    typeof expiresIn !== "number"
  ) {
    throw new Error("Anthropic token refresh response missing required fields");
  }

  return {
    access,
    refresh,
    expires: Date.now() + expiresIn * 1000 - 5 * 60 * 1000,
    providerId: "anthropic",
  };
}

export async function ensureFreshClaude(
  creds: ClaudeCredentials,
): Promise<ClaudeCredentials> {
  if (creds.expires > Date.now()) return creds;
  return refreshClaude(creds);
}
