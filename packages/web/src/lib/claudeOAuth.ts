import { getApiBase } from "./config";

/**
 * Claude Pro/Max (Anthropic subscription) OAuth credential handling.
 *
 * Refresh goes through the gitsandbox worker since
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

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Login code is missing ${field}`);
  }
  return value;
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Login code has invalid ${field}`);
  }
  return value;
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
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new Error("Paste the login code first");

  let jsonText: string;
  if (trimmed.startsWith("{")) {
    jsonText = trimmed;
  } else {
    try {
      jsonText = decodeBase64Url(trimmed);
    } catch {
      throw new Error("Login code is not valid base64url");
    }
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("Login code is not valid JSON");
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Login code must be a JSON object");
  }

  return validateDraft(parsed as ClaudeCredentialsDraft);
}

async function postTokenRequest(
  body: Record<string, string>,
): Promise<Record<string, unknown>> {
  const res = await fetch(`${getApiBase()}${TOKEN_PROXY_PATH}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic token request failed: ${res.status} ${text}`);
  }
  return (await res.json()) as Record<string, unknown>;
}

export async function refreshClaude(
  creds: ClaudeCredentials,
): Promise<ClaudeCredentials> {
  const tokenData = await postTokenRequest({
    client_id: CLIENT_ID,
    grant_type: "refresh_token",
    refresh_token: creds.refresh,
  });

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
