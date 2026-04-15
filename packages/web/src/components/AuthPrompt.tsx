import { useEffect, useRef, useState } from "react";
import { setCredential } from "../db/credentials";
import {
  exchangeGithubTokenForCopilot,
  pollForGithubAccessToken,
  startCopilotDeviceFlow,
} from "../lib/copilotOAuth";
import { loginCodex } from "../lib/codexOAuth";

type Provider = "anthropic" | "openai" | "google" | "openrouter";

type Mode = "signin" | "key";

const PROVIDERS: Array<{
  id: Provider;
  name: string;
  keyHint: string;
  credKey: string;
}> = [
  { id: "anthropic", name: "Anthropic", keyHint: "sk-ant-...", credKey: "ANTHROPIC_API_KEY" },
  { id: "openai", name: "OpenAI", keyHint: "sk-...", credKey: "OPENAI_API_KEY" },
  { id: "google", name: "Google AI", keyHint: "AIza...", credKey: "GOOGLE_API_KEY" },
  { id: "openrouter", name: "OpenRouter", keyHint: "sk-or-...", credKey: "OPENROUTER_API_KEY" },
];

interface AuthPromptProps {
  onAuthenticated: () => void | Promise<void>;
}

export function AuthPrompt({ onAuthenticated }: AuthPromptProps) {
  const [mode, setMode] = useState<Mode>("signin");

  return (
    <div className="mx-auto my-4 max-w-lg animate-fade-in">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-zinc-800 text-zinc-400">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M8 1.5a3 3 0 00-3 3V7H4a1.5 1.5 0 00-1.5 1.5v5A1.5 1.5 0 004 15h8a1.5 1.5 0 001.5-1.5v-5A1.5 1.5 0 0012 7h-1V4.5a3 3 0 00-3-3zm-1.5 3a1.5 1.5 0 013 0V7h-3V4.5z"
                fill="currentColor"
              />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-[14px] font-medium text-zinc-200">
              Connect an AI provider
            </h3>
            <p className="mt-1 text-[12px] leading-relaxed text-zinc-500">
              Sign in with a subscription, or paste an API key. Credentials stay
              in your browser only (IndexedDB).
            </p>
          </div>
        </div>

        <div className="mb-4 flex gap-1 rounded-lg bg-zinc-900/60 p-1">
          {(["signin", "key"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 rounded-md px-3 py-1.5 text-[12px] font-medium transition ${
                mode === m
                  ? "bg-zinc-100 text-zinc-900"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {m === "signin" ? "Sign in" : "API key"}
            </button>
          ))}
        </div>

        {mode === "signin" ? (
          <SubscriptionSignIn onAuthenticated={onAuthenticated} />
        ) : (
          <ApiKeyForm onAuthenticated={onAuthenticated} />
        )}
      </div>
    </div>
  );
}

type CopilotStage =
  | "idle"
  | "starting"
  | "awaiting"
  | "polling"
  | "exchanging"
  | "done"
  | "error";

function SubscriptionSignIn({ onAuthenticated }: AuthPromptProps) {
  return (
    <div className="space-y-2">
      <CopilotSignIn onAuthenticated={onAuthenticated} />
      <CodexSignIn onAuthenticated={onAuthenticated} />
    </div>
  );
}

export function CodexSignIn({
  onAuthenticated,
  autoStart = false,
}: AuthPromptProps & { autoStart?: boolean }) {
  const [stage, setStage] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  async function startLogin() {
    setError(null);
    setStage("loading");
    try {
      const creds = await loginCodex();
      await setCredential("CODEX_OAUTH", JSON.stringify(creds));
      setStage("done");
      await onAuthenticated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      setStage("error");
    }
  }

  useEffect(() => {
    if (autoStart && !startedRef.current) {
      startedRef.current = true;
      startLogin();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <button
        onClick={startLogin}
        disabled={stage === "loading"}
        className="press flex w-full items-center justify-center gap-2.5 rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-2.5 text-[13px] font-medium text-zinc-200 shadow-inset-hair transition-colors hover:border-zinc-700 hover:bg-zinc-800/80 hover:text-white disabled:opacity-50"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z" />
        </svg>
        {stage === "loading" ? "Connecting..." : "Sign in with ChatGPT Plus/Pro"}
      </button>
      {stage === "done" && (
        <p className="mt-2 text-center text-[11px] text-emerald-400">Connected!</p>
      )}
      {error && (
        <p className="mt-2 rounded-md bg-red-950/30 px-3 py-2 text-[12px] text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

export function CopilotSignIn({
  onAuthenticated,
  autoStart = false,
}: AuthPromptProps & { autoStart?: boolean }) {
  const [stage, setStage] = useState<CopilotStage>("idle");
  const [userCode, setUserCode] = useState<string>("");
  const [verificationUri, setVerificationUri] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  useEffect(() => {
    if (autoStart && !startedRef.current) {
      startedRef.current = true;
      startLogin();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startLogin() {
    setError(null);
    setStage("starting");
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const device = await startCopilotDeviceFlow();
      setUserCode(device.user_code);
      setVerificationUri(device.verification_uri);
      setStage("awaiting");

      try {
        await navigator.clipboard.writeText(device.user_code);
      } catch {
        /* ignore */
      }
      window.open(device.verification_uri, "_blank", "noopener,noreferrer");

      setStage("polling");
      const ghToken = await pollForGithubAccessToken(
        device.device_code,
        device.interval,
        device.expires_in,
        undefined,
        ac.signal
      );
      setStage("exchanging");
      const creds = await exchangeGithubTokenForCopilot(ghToken);
      await setCredential("COPILOT_OAUTH", JSON.stringify(creds));
      setStage("done");
      await onAuthenticated();
    } catch (err) {
      if (ac.signal.aborted) return;
      setError(err instanceof Error ? err.message : "Login failed");
      setStage("error");
    }
  }

  function cancel() {
    abortRef.current?.abort();
    setStage("idle");
  }

  return (
    <div>
      {stage === "idle" || stage === "starting" ? (
        <button
          onClick={startLogin}
          disabled={stage === "starting"}
          className="press flex w-full items-center justify-center gap-2.5 rounded-lg bg-white px-4 py-2.5 text-[13px] font-medium text-zinc-900 shadow-inset-hair transition-colors hover:bg-zinc-200 disabled:opacity-50"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
          {stage === "starting" ? "Starting..." : "Sign in with GitHub Copilot"}
        </button>
      ) : (
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
          <p className="mb-2 text-[12px] text-zinc-500">Your device code:</p>
          <div className="mb-3 select-all rounded-md bg-zinc-900 px-3 py-2 text-center font-mono text-[18px] font-semibold tracking-[0.3em] text-zinc-100">
            {userCode}
          </div>
          <p className="mb-3 text-[12px] leading-relaxed text-zinc-500">
            {stage === "exchanging"
              ? "Exchanging token..."
              : stage === "done"
              ? "Connected!"
              : "Paste this code at "}
            {stage !== "done" && stage !== "exchanging" && (
              <a
                href={verificationUri}
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-400 hover:text-emerald-300"
              >
                {verificationUri}
              </a>
            )}
          </p>
          {stage === "polling" && (
            <p className="flex items-center gap-2 text-[11px] text-zinc-600">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              Waiting for authorization...
            </p>
          )}
          {(stage === "polling" || stage === "awaiting") && (
            <button
              onClick={cancel}
              className="mt-2 text-[11px] text-zinc-500 underline hover:text-zinc-300"
            >
              Cancel
            </button>
          )}
        </div>
      )}
      {error && (
        <p className="mt-2 rounded-md bg-red-950/30 px-3 py-2 text-[12px] text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

export function ApiKeyForm({ onAuthenticated }: AuthPromptProps) {
  const [selected, setSelected] = useState<Provider>("anthropic");
  const [apiKey, setApiKey] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const entry = PROVIDERS.find((p) => p.id === selected);
      if (!entry) throw new Error("Unknown provider");
      await setCredential(entry.credKey, apiKey.trim());
      await onAuthenticated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save key");
    } finally {
      setSubmitting(false);
    }
  };

  const current = PROVIDERS.find((p) => p.id === selected);

  return (
    <>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {PROVIDERS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setSelected(p.id)}
            className={`rounded-md px-2.5 py-1 text-[12px] transition-colors ${
              selected === p.id
                ? "bg-zinc-100 text-zinc-900"
                : "bg-zinc-800/60 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            }`}
          >
            {p.name}
          </button>
        ))}
      </div>

      <form onSubmit={onSubmit} className="space-y-2">
        <input
          type="password"
          autoFocus
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={current?.keyHint ?? "API key"}
          className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-[13px] text-zinc-200 placeholder-zinc-600 outline-none focus:border-zinc-700"
        />
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-zinc-600">
            Stored locally in your browser
          </span>
          <button
            type="submit"
            disabled={!apiKey.trim() || submitting}
            className="rounded-md bg-white px-3 py-1.5 text-[12px] font-medium text-zinc-900 transition-opacity disabled:opacity-40"
          >
            {submitting ? "Saving..." : "Connect"}
          </button>
        </div>
        {error && <p className="text-[12px] text-red-400">{error}</p>}
      </form>
    </>
  );
}
