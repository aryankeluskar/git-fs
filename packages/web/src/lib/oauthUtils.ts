export function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Login code is missing ${field}`);
  }
  return value;
}

export function requireNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Login code has invalid ${field}`);
  }
  return value;
}

/**
 * Parse a pasted login code — either raw JSON or base64url-encoded JSON — into
 * an object. Throws user-facing errors for empty/invalid input. The caller
 * validates the resulting shape into its provider-specific credentials type.
 */
export function parseLoginCode(value: string): Record<string, unknown> {
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

  return parsed as Record<string, unknown>;
}

export async function postJsonToken(
  url: string,
  body: Record<string, string>,
  errorLabel: string
): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${errorLabel}: ${res.status} ${text}`);
  }
  return (await res.json()) as Record<string, unknown>;
}
