import { getApiBase } from "./config";

const CLIENT_ID = atob("SXYxLmI1MDdhMDhjODdlY2ZlOTg=");

export interface CopilotCredentials {
  refresh: string;
  access: string;
  expires: number;
  enterpriseUrl?: string;
}

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  interval: number;
  expires_in: number;
}

function proxyBase(enterpriseDomain?: string): string {
  const api = getApiBase();
  return enterpriseDomain
    ? `${api}/oauth/gh/enterprise/${enterpriseDomain}`
    : `${api}/oauth/gh`;
}

export async function startCopilotDeviceFlow(
  enterpriseDomain?: string
): Promise<DeviceCodeResponse> {
  const res = await fetch(`${proxyBase(enterpriseDomain)}/login/device/code`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      scope: "read:user",
    }),
  });
  if (!res.ok) {
    throw new Error(`device code: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as DeviceCodeResponse;
  if (
    typeof data.device_code !== "string" ||
    typeof data.user_code !== "string" ||
    typeof data.verification_uri !== "string"
  ) {
    throw new Error("Invalid device code response");
  }
  return data;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error("cancelled"));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new Error("cancelled"));
      },
      { once: true }
    );
  });
}

export async function pollForGithubAccessToken(
  deviceCode: string,
  intervalSeconds: number,
  expiresIn: number,
  enterpriseDomain?: string,
  signal?: AbortSignal
): Promise<string> {
  const deadline = Date.now() + expiresIn * 1000;
  let intervalMs = Math.max(1000, Math.floor(intervalSeconds * 1000 * 1.2));

  while (Date.now() < deadline) {
    if (signal?.aborted) throw new Error("cancelled");
    await sleep(intervalMs, signal);

    const res = await fetch(
      `${proxyBase(enterpriseDomain)}/login/oauth/access_token`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: CLIENT_ID,
          device_code: deviceCode,
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        }),
      }
    );
    const body = (await res.json()) as {
      access_token?: string;
      error?: string;
      error_description?: string;
      interval?: number;
    };
    if (typeof body.access_token === "string") return body.access_token;
    if (body.error === "authorization_pending") continue;
    if (body.error === "slow_down") {
      intervalMs =
        typeof body.interval === "number" && body.interval > 0
          ? body.interval * 1000 * 1.4
          : intervalMs + 5000;
      continue;
    }
    if (body.error) {
      throw new Error(
        `${body.error}${body.error_description ? ": " + body.error_description : ""}`
      );
    }
  }
  throw new Error("Device flow timed out");
}

export async function exchangeGithubTokenForCopilot(
  githubAccessToken: string,
  enterpriseDomain?: string
): Promise<CopilotCredentials> {
  const res = await fetch(
    `${proxyBase(enterpriseDomain)}/copilot_internal/v2/token`,
    {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${githubAccessToken}`,
      },
    }
  );
  if (!res.ok) {
    throw new Error(`copilot token: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { token: string; expires_at: number };
  if (typeof data.token !== "string" || typeof data.expires_at !== "number") {
    throw new Error("Invalid Copilot token response");
  }
  return {
    refresh: githubAccessToken,
    access: data.token,
    expires: data.expires_at * 1000 - 5 * 60 * 1000,
    enterpriseUrl: enterpriseDomain,
  };
}

export async function refreshCopilotCredentials(
  creds: CopilotCredentials
): Promise<CopilotCredentials> {
  return exchangeGithubTokenForCopilot(creds.refresh, creds.enterpriseUrl);
}

export async function ensureFreshCopilot(
  creds: CopilotCredentials
): Promise<CopilotCredentials> {
  if (creds.expires > Date.now()) return creds;
  return refreshCopilotCredentials(creds);
}

interface CopilotModelInfo {
  id: string;
  name?: string;
  model_picker_enabled?: boolean;
  policy?: { state?: string };
  supported_endpoints?: string[];
  capabilities?: {
    type?: string;
    family?: string;
    limits?: {
      max_context_window_tokens?: number;
      max_output_tokens?: number;
    };
  };
}

/** A chat model the user's Copilot plan can actually call. */
export interface CopilotChatModel {
  id: string;
  name: string;
  /** Model family (e.g. "gpt-5.4-mini" for "gpt-5.4-mini-free-auto"). */
  family?: string;
  contextWindow?: number;
  maxTokens?: number;
}

/**
 * A model is usable when its per-model policy is enabled. Entries without a
 * policy are internal agent models (search/exec) unless explicitly
 * picker-enabled. Disabled policies mean the user never turned the model on
 * in their GitHub Copilot settings — calling those returns
 * model_not_supported.
 */
function isUsableChatModel(m: CopilotModelInfo): boolean {
  if (m.capabilities?.type !== "chat") return false;
  if (m.policy) return m.policy.state === "enabled";
  return m.model_picker_enabled === true;
}

export async function listCopilotModels(
  access: string,
  enterpriseDomain?: string
): Promise<CopilotChatModel[]> {
  const base = getCopilotBaseUrl(access, enterpriseDomain);
  const res = await fetch(`${base}/models`, {
    headers: {
      Authorization: `Bearer ${access}`,
      "Copilot-Integration-Id": "vscode-chat",
    },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { data?: CopilotModelInfo[] };
  if (!Array.isArray(data.data)) return [];
  return data.data.filter(isUsableChatModel).map((m) => ({
    id: m.id,
    name: m.name ?? m.id,
    family: m.capabilities?.family,
    contextWindow: m.capabilities?.limits?.max_context_window_tokens,
    maxTokens: m.capabilities?.limits?.max_output_tokens,
  }));
}

export function getCopilotBaseUrl(
  access: string,
  enterpriseDomain?: string
): string {
  const api = getApiBase();
  let host: string;
  const m = access.match(/proxy-ep=([^;]+)/);
  if (m) {
    host = m[1].replace(/^proxy\./, "api.");
  } else if (enterpriseDomain) {
    host = `copilot-api.${enterpriseDomain}`;
  } else {
    host = "api.individual.githubcopilot.com";
  }
  return `${api}/copilot-api/${host}`;
}
