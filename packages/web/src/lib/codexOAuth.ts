import {
  requireString,
  requireNumber,
  parseLoginCode,
  postJsonToken,
} from "./oauthUtils";

const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const TOKEN_URL = "https://auth.openai.com/oauth/token";
const JWT_CLAIM_PATH = "https://api.openai.com/auth";

export interface CodexCredentials {
  access: string;
  refresh: string;
  accountId: string;
  expires: number;
  providerId: "openai-codex";
}

interface CodexCredentialsDraft {
  access?: unknown;
  accountId?: unknown;
  expires?: unknown;
  providerId?: unknown;
  refresh?: unknown;
}

function decodeJwt(token: string): Record<string, unknown> | undefined {
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[1]) return undefined;
  try {
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(atob(padded));
  } catch {
    return undefined;
  }
}

function getAccountId(accessToken: string): string | undefined {
  const payload = decodeJwt(accessToken);
  const authValue = payload?.[JWT_CLAIM_PATH];
  if (typeof authValue !== "object" || authValue === null) return undefined;
  return (authValue as { chatgpt_account_id?: string }).chatgpt_account_id;
}

function validateDraft(draft: CodexCredentialsDraft): CodexCredentials {
  if (draft.providerId !== "openai-codex") {
    throw new Error("Login code is not for ChatGPT / Codex");
  }
  return {
    access: requireString(draft.access, "access token"),
    refresh: requireString(draft.refresh, "refresh token"),
    accountId: requireString(draft.accountId, "accountId"),
    expires: requireNumber(draft.expires, "expires"),
    providerId: "openai-codex",
  };
}

export function parseImportedCodexCredentials(value: string): CodexCredentials {
  const draft = parseLoginCode(value) as CodexCredentialsDraft;

  // If accountId is missing but the access token is a JWT we can recover it.
  if (typeof draft.accountId !== "string" && typeof draft.access === "string") {
    const recovered = getAccountId(draft.access);
    if (recovered) draft.accountId = recovered;
  }

  return validateDraft(draft);
}

export async function refreshCodex(creds: CodexCredentials): Promise<CodexCredentials> {
  const tokenData = await postJsonToken(
    TOKEN_URL,
    {
      client_id: CLIENT_ID,
      grant_type: "refresh_token",
      refresh_token: creds.refresh,
    },
    "Token request failed"
  );

  const access = tokenData.access_token;
  const refresh = tokenData.refresh_token;
  const expiresIn = tokenData.expires_in;

  if (typeof access !== "string" || typeof refresh !== "string" || typeof expiresIn !== "number") {
    throw new Error("Token refresh response missing required fields");
  }

  const accountId = getAccountId(access) ?? creds.accountId;
  if (!accountId) throw new Error("Failed to extract accountId from refreshed token");

  return {
    access,
    refresh,
    accountId,
    expires: Date.now() + expiresIn * 1000,
    providerId: "openai-codex",
  };
}

export async function ensureFreshCodex(creds: CodexCredentials): Promise<CodexCredentials> {
  if (creds.expires > Date.now()) return creds;
  return refreshCodex(creds);
}
