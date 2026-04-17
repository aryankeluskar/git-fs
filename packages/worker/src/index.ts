import { Hono } from "hono";
import { logger } from "hono/logger";
import type { Env, CreateSandboxBody, DestroySandboxBody } from "./types";
import { createSandbox, destroySandbox, proxyToOpenCode } from "./sandbox";
import { InvalidRepoUrlError } from "./repo";

export { Sandbox } from "@cloudflare/sandbox";

const app = new Hono<{ Bindings: Env }>();

function allowedOrigin(origin: string | null): string {
  if (!origin) return "";
  if (origin === "https://github.soy.run") return origin;
  if (origin === "http://localhost:3000") return origin;
  if (/^https:\/\/[a-z0-9-]+\.gitsandbox-web\.pages\.dev$/.test(origin)) return origin;
  if (origin === "https://gitsandbox-web.pages.dev") return origin;
  return "";
}

app.use("*", async (c, next) => {
  const origin = allowedOrigin(c.req.header("Origin") ?? null);
  if (c.req.method === "OPTIONS") {
    const reqHeaders = c.req.header("Access-Control-Request-Headers") ?? "*";
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
        "Access-Control-Allow-Headers": reqHeaders,
        "Access-Control-Max-Age": "86400",
        "Vary": "Origin, Access-Control-Request-Headers",
      },
    });
  }
  await next();
  if (origin) {
    c.res.headers.set("Access-Control-Allow-Origin", origin);
    c.res.headers.append("Vary", "Origin");
  }
});
app.use("*", logger());

app.get("/health", (c) => c.json({ ok: true, ts: Date.now() }));

app.all("/oauth/gh/*", async (c) => {
  const prefix = "/oauth/gh";
  const rest = c.req.path.slice(prefix.length) || "/";
  const search = new URL(c.req.url).search;

  let target: string;
  if (rest.startsWith("/login/")) {
    target = `https://github.com${rest}${search}`;
  } else if (rest.startsWith("/copilot_internal/")) {
    target = `https://api.github.com${rest}${search}`;
  } else if (rest.startsWith("/enterprise/")) {
    const m = rest.match(/^\/enterprise\/([^/]+)(\/.*)$/);
    if (!m) return c.json({ error: "bad enterprise path" }, 400);
    const [, domain, sub] = m;
    if (sub.startsWith("/copilot_internal/")) {
      target = `https://api.${domain}${sub}${search}`;
    } else {
      target = `https://${domain}${sub}${search}`;
    }
  } else {
    return c.json({ error: "not found" }, 404);
  }

  const headers = new Headers(c.req.raw.headers);
  headers.delete("host");
  headers.delete("origin");
  headers.delete("referer");
  headers.delete("cookie");
  headers.set("User-Agent", "GitHubCopilotChat/0.35.0");
  if (rest.startsWith("/copilot_internal/") || rest.includes("/copilot_internal/")) {
    headers.set("Editor-Version", "vscode/1.107.0");
    headers.set("Editor-Plugin-Version", "copilot-chat/0.35.0");
    headers.set("Copilot-Integration-Id", "vscode-chat");
  }

  const init: RequestInit = {
    method: c.req.method,
    headers,
    body:
      c.req.method === "GET" || c.req.method === "HEAD"
        ? undefined
        : c.req.raw.body,
  };

  const upstream = await fetch(target, init);
  const respHeaders = new Headers(upstream.headers);
  respHeaders.delete("set-cookie");
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: respHeaders,
  });
});

app.all("/oauth/anthropic/token", async (c) => {
  const target = "https://platform.claude.com/v1/oauth/token";

  const headers = new Headers();
  const contentType = c.req.header("Content-Type");
  if (contentType) headers.set("Content-Type", contentType);
  headers.set("Accept", "application/json");
  headers.set("User-Agent", "claude-cli/1.0.0");

  const upstream = await fetch(target, {
    method: c.req.method,
    headers,
    body:
      c.req.method === "GET" || c.req.method === "HEAD"
        ? undefined
        : c.req.raw.body,
  });

  const respHeaders = new Headers(upstream.headers);
  respHeaders.delete("set-cookie");
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: respHeaders,
  });
});

app.all("/anthropic-api/*", async (c) => {
  const prefix = "/anthropic-api";
  const rest = c.req.path.slice(prefix.length) || "/";
  const search = new URL(c.req.url).search;
  const target = `https://api.anthropic.com${rest}${search}`;

  const headers = new Headers(c.req.raw.headers);
  headers.delete("host");
  headers.delete("origin");
  headers.delete("referer");
  headers.delete("cookie");
  headers.delete("accept-encoding");
  // Claude Code identity - OAuth subscription tokens only work against
  // endpoints that look like the first-party CLI.
  headers.set("User-Agent", "claude-cli/1.0.0 (external, cli)");
  headers.set("X-App", "cli");
  if (!headers.has("anthropic-version")) {
    headers.set("anthropic-version", "2023-06-01");
  }
  if (!headers.has("anthropic-beta")) {
    headers.set(
      "anthropic-beta",
      "claude-code-20250219,oauth-2025-04-20,fine-grained-tool-streaming-2025-05-14",
    );
  }

  const init: RequestInit = {
    method: c.req.method,
    headers,
    body:
      c.req.method === "GET" || c.req.method === "HEAD"
        ? undefined
        : c.req.raw.body,
  };

  const upstream = await fetch(target, init);
  const respHeaders = new Headers(upstream.headers);
  respHeaders.delete("set-cookie");
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: respHeaders,
  });
});

app.all("/copilot-api/:host/*", async (c) => {
  const host = c.req.param("host");
  if (!/^[a-z0-9.-]+\.githubcopilot\.com$/i.test(host) && !/^copilot-api\.[a-z0-9.-]+$/i.test(host)) {
    return c.json({ error: "host not allowed" }, 400);
  }
  const prefix = `/copilot-api/${host}`;
  const rest = c.req.path.slice(prefix.length) || "/";
  const search = new URL(c.req.url).search;
  const target = `https://${host}${rest}${search}`;

  const headers = new Headers(c.req.raw.headers);
  headers.delete("host");
  headers.delete("origin");
  headers.delete("referer");
  headers.delete("cookie");
  headers.set("User-Agent", "GitHubCopilotChat/0.35.0");
  headers.set("Editor-Version", "vscode/1.107.0");
  headers.set("Editor-Plugin-Version", "copilot-chat/0.35.0");
  headers.set("Copilot-Integration-Id", "vscode-chat");

  const init: RequestInit = {
    method: c.req.method,
    headers,
    body:
      c.req.method === "GET" || c.req.method === "HEAD"
        ? undefined
        : c.req.raw.body,
  };

  const upstream = await fetch(target, init);
  const respHeaders = new Headers(upstream.headers);
  respHeaders.delete("set-cookie");
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: respHeaders,
  });
});

app.post("/sandbox/create", async (c) => {
  const body = await c.req.json<CreateSandboxBody>();

  if (!body.repoUrl) {
    return c.json({ error: "repoUrl is required" }, 400);
  }

  try {
    const meta = await createSandbox(
      c.env,
      body.repoUrl,
      body.branch,
      body.env ?? {}
    );
    return c.json(meta, 200);
  } catch (err) {
    if (err instanceof InvalidRepoUrlError) {
      return c.json({ error: err.message }, 400);
    }
    console.error("sandbox/create error:", err);
    return c.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      500
    );
  }
});

app.get("/sandbox/:id/diag", async (c) => {
  const sandboxId = c.req.param("id");
  const { getSandbox } = await import("@cloudflare/sandbox");
  const sandbox = getSandbox(c.env.Sandbox, sandboxId, { normalizeId: true });
  try {
    const ps = await sandbox.exec("ps aux | grep -E 'opencode|node' | grep -v grep");
    const ports = await sandbox.exec("ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null || true");
    const workspace = await sandbox.exec("ls -la /workspace/ 2>&1");
    let ocLog = "";
    try {
      const l = await sandbox.exec("find /tmp /var/log -name '*.log' 2>/dev/null | head -5 | xargs -I{} sh -c 'echo === {} ===; tail -30 {}' 2>&1");
      ocLog = l.stdout + l.stderr;
    } catch {}
    return c.json({
      ps: ps.stdout + ps.stderr,
      ports: ports.stdout + ports.stderr,
      workspace: workspace.stdout + workspace.stderr,
      ocLog,
    });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

app.post("/sandbox/destroy", async (c) => {
  const body = await c.req.json<DestroySandboxBody>();

  if (!body.sandboxId) {
    return c.json({ error: "sandboxId is required" }, 400);
  }

  try {
    await destroySandbox(c.env, body.sandboxId);
    return c.json({ ok: true });
  } catch (err) {
    console.error("sandbox/destroy error:", err);
    return c.json({ error: "Sandbox not found or already destroyed" }, 404);
  }
});

app.all("/oc/:sandboxId/*", async (c) => {
  const sandboxId = c.req.param("sandboxId");
  const fullPath = c.req.path;
  const prefix = `/oc/${sandboxId}`;
  const ocPath = fullPath.slice(prefix.length) || "/";

  const search = new URL(c.req.url).search;
  const pathWithQuery = ocPath + search;

  try {
    return await proxyToOpenCode(c.env, sandboxId, pathWithQuery, c.req.raw);
  } catch (err) {
    console.error("oc proxy error:", err);
    return c.json(
      { error: err instanceof Error ? err.message : "Proxy error" },
      502
    );
  }
});

export default app;
