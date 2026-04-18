import { useEffect, useRef, useState } from "react";
import { setCredential } from "../db/credentials";
import {
  exchangeGithubTokenForCopilot,
  pollForGithubAccessToken,
  startCopilotDeviceFlow,
} from "../lib/copilotOAuth";
import { parseImportedCodexCredentials } from "../lib/codexOAuth";
import { parseImportedClaudeCredentials } from "../lib/claudeOAuth";
import {
  getGithubToken,
  loginGithub,
  saveGithubCredentials,
} from "../lib/githubAuth";

const CODEX_CLI_COMMAND = "npx @gitinspect/cli login -p codex";
const CLAUDE_CLI_COMMAND = "npx @gitinspect/cli login -p anthropic";

interface AuthPromptProps {
  onAuthenticated: () => void | Promise<void>;
}

export function AuthPrompt({ onAuthenticated }: AuthPromptProps) {
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
              Sign in with your existing subscription. Credentials stay in your
              browser only (IndexedDB).
            </p>
          </div>
        </div>

        <SubscriptionSignIn onAuthenticated={onAuthenticated} />
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
      <ClaudeSignIn onAuthenticated={onAuthenticated} />
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
      // If the user already has a GitHub token (e.g. from the mandatory
      // GitHub sign-in gate), skip the device flow and go straight to the
      // Copilot token exchange. Two-birds: one OAuth prompt covers both.
      const existingGhToken = await getGithubToken();
      let ghToken: string;
      if (existingGhToken) {
        setStage("exchanging");
        ghToken = existingGhToken;
      } else {
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
        ghToken = await pollForGithubAccessToken(
          device.device_code,
          device.interval,
          device.expires_in,
          undefined,
          ac.signal,
        );
        // Persist the GitHub identity as well so the gate never re-asks.
        await saveGithubCredentials({
          access: ghToken,
          scope: "read:user",
          issuedAt: Date.now(),
        });
      }
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

export function CodexSignIn({
  onAuthenticated,
  autoStart = false,
}: AuthPromptProps & { autoStart?: boolean }) {
  const [expanded, setExpanded] = useState(autoStart);
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const creds = parseImportedCodexCredentials(code);
      await setCredential("CODEX_OAUTH", JSON.stringify(creds));
      setCode("");
      await onAuthenticated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid login code");
    } finally {
      setSubmitting(false);
    }
  };

  const copyCommand = async () => {
    try {
      await navigator.clipboard.writeText(CODEX_CLI_COMMAND);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="press flex w-full items-center justify-center gap-2.5 rounded-lg bg-white px-4 py-2.5 text-[13px] font-medium text-zinc-900 shadow-inset-hair transition-colors hover:bg-zinc-200"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z" />
        </svg>
        Connect ChatGPT (Plus / Pro)
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
      <p className="text-[12px] font-medium text-zinc-200">
        Connect ChatGPT (Plus / Pro)
      </p>
      <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-500">
        OpenAI only allows Codex sign-in from a local terminal. Run this in your
        shell, complete browser sign-in, then paste the code it prints.
      </p>

      <div className="mt-3 space-y-1.5">
        <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">
          1. Run this command
        </p>
        <div className="flex gap-1.5">
          <code className="min-w-0 flex-1 overflow-x-auto rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 font-mono text-[11.5px] text-zinc-200">
            {CODEX_CLI_COMMAND}
          </code>
          <button
            type="button"
            onClick={copyCommand}
            className="press shrink-0 rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-[11px] font-medium text-zinc-300 transition-colors hover:bg-zinc-800"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      <div className="mt-3 space-y-1.5">
        <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">
          2. Paste the returned code
        </p>
        <textarea
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            if (error) setError(null);
          }}
          spellCheck={false}
          autoComplete="off"
          placeholder="Paste the code from the terminal..."
          className="min-h-[80px] w-full resize-y rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-2 font-mono text-[11.5px] text-zinc-200 placeholder-zinc-600 outline-none focus:border-zinc-700"
        />
        {error && (
          <p className="rounded-md bg-red-950/30 px-2.5 py-1.5 text-[11.5px] text-red-400">
            {error}
          </p>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => {
            setExpanded(false);
            setError(null);
            setCode("");
          }}
          className="press text-[11px] font-medium text-zinc-500 hover:text-zinc-300"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={submitting || code.trim().length === 0}
          className="press rounded-md bg-white px-3 py-1.5 text-[11.5px] font-medium text-zinc-900 transition-opacity hover:bg-zinc-200 disabled:opacity-40"
        >
          {submitting ? "Connecting..." : "Connect"}
        </button>
      </div>
    </div>
  );
}

export function ClaudeSignIn({
  onAuthenticated,
  autoStart = false,
}: AuthPromptProps & { autoStart?: boolean }) {
  const [expanded, setExpanded] = useState(autoStart);
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const creds = parseImportedClaudeCredentials(code);
      await setCredential("ANTHROPIC_OAUTH", JSON.stringify(creds));
      setCode("");
      await onAuthenticated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid login code");
    } finally {
      setSubmitting(false);
    }
  };

  const copyCommand = async () => {
    try {
      await navigator.clipboard.writeText(CLAUDE_CLI_COMMAND);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="press flex w-full items-center justify-center gap-2.5 rounded-lg bg-white px-4 py-2.5 text-[13px] font-medium text-zinc-900 shadow-inset-hair transition-colors hover:bg-zinc-200"
      >
        <svg width="16" height="14" viewBox="0 0 92.2 65" fill="currentColor">
          <path d="M66.5,0H52.4l25.7,65h14.1L66.5,0z M25.7,0L0,65h14.4l5.3-13.6h26.9L51.8,65h14.4L40.5,0C40.5,0,25.7,0,25.7,0z M24.3,39.3l8.8-22.8l8.8,22.8H24.3z" />
        </svg>
        Connect Claude (Pro / Max)
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
      <p className="text-[12px] font-medium text-zinc-200">
        Connect Claude (Pro / Max)
      </p>
      <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-500">
        Anthropic only allows subscription sign-in from a local terminal. Run
        this in your shell, complete browser sign-in, then paste the code it
        prints.
      </p>

      <div className="mt-3 space-y-1.5">
        <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">
          1. Run this command
        </p>
        <div className="flex gap-1.5">
          <code className="min-w-0 flex-1 overflow-x-auto rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 font-mono text-[11.5px] text-zinc-200">
            {CLAUDE_CLI_COMMAND}
          </code>
          <button
            type="button"
            onClick={copyCommand}
            className="press shrink-0 rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-[11px] font-medium text-zinc-300 transition-colors hover:bg-zinc-800"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      <div className="mt-3 space-y-1.5">
        <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">
          2. Paste the returned code
        </p>
        <textarea
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            if (error) setError(null);
          }}
          spellCheck={false}
          autoComplete="off"
          placeholder="Paste the code from the terminal..."
          className="min-h-[80px] w-full resize-y rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-2 font-mono text-[11.5px] text-zinc-200 placeholder-zinc-600 outline-none focus:border-zinc-700"
        />
        {error && (
          <p className="rounded-md bg-red-950/30 px-2.5 py-1.5 text-[11.5px] text-red-400">
            {error}
          </p>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => {
            setExpanded(false);
            setError(null);
            setCode("");
          }}
          className="press text-[11px] font-medium text-zinc-500 hover:text-zinc-300"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={submitting || code.trim().length === 0}
          className="press rounded-md bg-white px-3 py-1.5 text-[11.5px] font-medium text-zinc-900 transition-opacity hover:bg-zinc-200 disabled:opacity-40"
        >
          {submitting ? "Connecting..." : "Connect"}
        </button>
      </div>
    </div>
  );
}

type GithubStage =
  | "idle"
  | "starting"
  | "awaiting"
  | "polling"
  | "done"
  | "error";

interface GithubSignInProps {
  onAuthenticated: () => void | Promise<void>;
  autoStart?: boolean;
}

/**
 * Standalone GitHub sign-in. Reuses the Copilot OAuth app's device flow to
 * obtain a `read:user` GitHub token — enough to authenticate REST calls and
 * escape the 60 req/hr unauthenticated rate limit. The same token is later
 * reused by the Copilot flow, so users only OAuth once.
 */
export function GithubSignIn({
  onAuthenticated,
  autoStart = false,
}: GithubSignInProps) {
  const [stage, setStage] = useState<GithubStage>("idle");
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
      start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function start() {
    setError(null);
    setStage("starting");
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      await loginGithub({
        signal: ac.signal,
        onCode: ({ userCode, verificationUri }) => {
          setUserCode(userCode);
          setVerificationUri(verificationUri);
          setStage("awaiting");
          navigator.clipboard.writeText(userCode).catch(() => {
            /* ignore */
          });
          window.open(verificationUri, "_blank", "noopener,noreferrer");
          setStage("polling");
        },
      });
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
          onClick={start}
          disabled={stage === "starting"}
          className="press flex w-full items-center justify-center gap-2.5 rounded-lg bg-white px-4 py-2.5 text-[13px] font-medium text-zinc-900 shadow-inset-hair transition-colors hover:bg-zinc-200 disabled:opacity-50"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
          {stage === "starting" ? "Starting..." : "Sign in with GitHub"}
        </button>
      ) : (
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
          <p className="mb-2 text-[12px] text-zinc-500">Your device code:</p>
          <div className="mb-3 select-all rounded-md bg-zinc-900 px-3 py-2 text-center font-mono text-[18px] font-semibold tracking-[0.3em] text-zinc-100">
            {userCode}
          </div>
          <p className="mb-3 text-[12px] leading-relaxed text-zinc-500">
            {stage === "done" ? "Connected!" : "Paste this code at "}
            {stage !== "done" && (
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

interface GithubAuthGateProps {
  repoLabel: string;
  onAuthenticated: () => void | Promise<void>;
}

/**
 * Mandatory GitHub sign-in shown when landing directly on a repo/account URL
 * without any GitHub credentials. Blocks the chat view until sign-in succeeds.
 * Never shown on the landing page.
 */
export function GithubAuthGate({
  repoLabel,
  onAuthenticated,
}: GithubAuthGateProps) {
  return (
    <div className="relative flex flex-1 items-center justify-center px-6 py-10">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-grid" />
      <div className="relative w-full max-w-md animate-fade-in">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 shadow-inset-hair">
          <div className="mb-5 flex items-start gap-3">
            <div className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-zinc-800 text-zinc-300">
              <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-[15px] font-semibold text-zinc-100">
                Connect GitHub to open{" "}
                <span className="font-mono text-zinc-300">{repoLabel}</span>
              </h3>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-zinc-500">
                We use your GitHub identity to read repository data to avoid
                hitting the 60-per-hour rate limit. Your token
                stays in this browser only (IndexedDB).
              </p>
            </div>
          </div>

          <GithubSignIn onAuthenticated={onAuthenticated} />
        </div>
      </div>
    </div>
  );
}
