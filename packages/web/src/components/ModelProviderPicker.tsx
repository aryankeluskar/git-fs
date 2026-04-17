import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProviderId, SupportedModel } from "../lib/agent";
import { SUPPORTED_MODELS } from "../lib/agent";
import { ClaudeSignIn, CodexSignIn, CopilotSignIn } from "./AuthPrompt";

const SUBSCRIPTION_PROVIDERS: ProviderId[] = [
  "github-copilot",
  "anthropic",
  "openai-codex",
];

const PROVIDER_TITLE: Record<ProviderId, string> = {
  "github-copilot": "GitHub Copilot",
  "openai-codex": "ChatGPT · Codex",
  anthropic: "Claude · Pro / Max",
};

function modelsForProvider(p: ProviderId): SupportedModel[] {
  return SUPPORTED_MODELS.filter((m) => m.provider === p);
}

interface ModelProviderPickerProps {
  activeModel: SupportedModel;
  connectedProviders: string[];
  onSelectModel: (model: SupportedModel) => void | Promise<void>;
  onLogout: (provider: ProviderId) => void | Promise<void>;
  onAuthSuccess: () => void | Promise<void>;
  locked?: boolean;
}

type AuthPanel = null | "copilot" | "codex" | "claude";

export function ModelProviderPicker({
  activeModel,
  connectedProviders,
  onSelectModel,
  onLogout,
  onAuthSuccess,
  locked,
}: ModelProviderPickerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [authPanel, setAuthPanel] = useState<AuthPanel>(null);

  const connected = useMemo(
    () => new Set(connectedProviders),
    [connectedProviders]
  );

  const closeMenu = useCallback(() => {
    setOpen(false);
    setAuthPanel(null);
  }, []);

  const handleAuthDone = useCallback(async () => {
    await onAuthSuccess();
    closeMenu();
  }, [closeMenu, onAuthSuccess]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeMenu();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, closeMenu]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (authPanel) return;
      if (rootRef.current?.contains(e.target as Node)) return;
      closeMenu();
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open, authPanel, closeMenu]);

  const shortLabel = useMemo(() => activeModel.modelId, [activeModel]);

  return (
    <div ref={rootRef} className="relative flex shrink-0 self-stretch">
      <button
        type="button"
        aria-busy={locked}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="press focus-ring group flex h-full items-center gap-1.5 rounded-l-[16px] py-2 pl-3.5 pr-3 text-left transition-[opacity,background-color] duration-200 ease-[cubic-bezier(0.2,0,0,1)]"
      >
        <span className="max-w-[130px] truncate text-[12.5px] font-medium leading-tight text-zinc-400 transition-colors duration-200 group-hover:text-zinc-200">
          {shortLabel}
        </span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 16 16"
          fill="none"
          className="shrink-0 text-zinc-600 transition-[transform,color] duration-200 ease-[cubic-bezier(0.2,0,0,1)] group-hover:text-zinc-400"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
        >
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div className="my-2.5 w-px bg-zinc-700/50" />

      {open && (
        <div
          role="dialog"
          aria-label="Model and provider"
          className="animate-fade-in-up absolute bottom-[calc(100%+10px)] left-0 z-50 flex max-h-[min(70vh,520px)] w-[min(calc(100vw-1.5rem),340px)] flex-col overflow-hidden rounded-2xl border border-zinc-800/90 bg-zinc-950/98 shadow-soft ring-1 ring-black/40 backdrop-blur-xl"
          style={{ boxShadow: "0 -4px 24px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.04) inset" }}
        >
          <div className="border-b border-zinc-800/80 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
              Provider & model
            </p>
            <p className="mt-1 text-[13px] font-medium leading-snug text-zinc-100 text-pretty">
              {activeModel.label}
            </p>
          </div>

          <div className="stagger flex-1 overflow-y-auto px-2 py-2">
            {authPanel === "copilot" && (
              <div className="animate-fade-in mb-2 rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-3">
                <CopilotSignIn onAuthenticated={handleAuthDone} autoStart />
              </div>
            )}
            {authPanel === "codex" && (
              <div className="animate-fade-in mb-2 rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-3">
                <CodexSignIn onAuthenticated={handleAuthDone} autoStart />
              </div>
            )}
            {authPanel === "claude" && (
              <div className="animate-fade-in mb-2 rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-3">
                <ClaudeSignIn onAuthenticated={handleAuthDone} autoStart />
              </div>
            )}
            {SUBSCRIPTION_PROVIDERS.map((provider) => {
              const title = PROVIDER_TITLE[provider];
              const isConnected = connected.has(provider);
              const models = modelsForProvider(provider);

              return (
                <section
                  key={provider}
                  className="mb-1 rounded-xl border border-transparent px-2 py-1.5 transition-colors duration-200 hover:border-zinc-800/60 hover:bg-zinc-900/35"
                >
                  <div className="flex min-h-10 items-center justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="text-[12.5px] font-semibold text-zinc-200">{title}</h3>
                      <p className="text-[10px] text-zinc-600">
                        {isConnected ? "Connected" : "Not connected"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {!isConnected && provider === "github-copilot" && (
                        <button
                          type="button"
                          onClick={() => setAuthPanel((p) => (p === "copilot" ? null : "copilot"))}
                          className="press focus-ring rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-medium text-zinc-900 transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.2,0,0,1)]"
                        >
                          {authPanel === "copilot" ? "Close" : "Log in"}
                        </button>
                      )}
                      {!isConnected && provider === "openai-codex" && (
                        <button
                          type="button"
                          onClick={() => setAuthPanel((p) => (p === "codex" ? null : "codex"))}
                          className="press focus-ring rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-medium text-zinc-900 transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.2,0,0,1)]"
                        >
                          {authPanel === "codex" ? "Close" : "Log in"}
                        </button>
                      )}
                      {!isConnected && provider === "anthropic" && (
                        <button
                          type="button"
                          onClick={() => setAuthPanel((p) => (p === "claude" ? null : "claude"))}
                          className="press focus-ring rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-medium text-zinc-900 transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.2,0,0,1)]"
                        >
                          {authPanel === "claude" ? "Close" : "Log in"}
                        </button>
                      )}
                      {isConnected && (
                        <button
                          type="button"
                          onClick={() => onLogout(provider)}
                          className="press focus-ring rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-zinc-500 transition-[color,opacity,transform] duration-200 ease-[cubic-bezier(0.2,0,0,1)] hover:text-red-400"
                        >
                          Log out
                        </button>
                      )}
                    </div>
                  </div>

                  {isConnected && models.length > 0 && (
                    <ul className="mt-1.5 space-y-0.5 border-t border-zinc-800/50 pt-1.5">
                      {models.map((m) => {
                        const sel =
                          m.provider === activeModel.provider &&
                          m.modelId === activeModel.modelId;
                        return (
                          <li key={`${m.provider}-${m.modelId}`}>
                            <button
                              type="button"
                              disabled={locked}
                              onClick={async () => {
                                await onSelectModel(m);
                                closeMenu();
                              }}
                              className={`press focus-ring flex min-h-10 w-full items-center rounded-lg px-2.5 py-2 text-left text-[12.5px] transition-[background-color,color,transform] duration-200 ease-[cubic-bezier(0.2,0,0,1)] disabled:opacity-40 ${
                                sel
                                  ? "bg-emerald-600/15 font-medium text-emerald-200 ring-1 ring-emerald-700/40"
                                  : "text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-100"
                              }`}
                            >
                              <span className="line-clamp-2 text-pretty">{m.label}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              );
            })}

            {/* <section className="mb-1 rounded-xl border border-transparent px-2 py-1.5">
              <div className="flex min-h-10 items-center gap-2">
                <div className="min-w-0 flex-1">
                  <h3 className="text-[12.5px] font-semibold text-zinc-500">Claude Pro / Max</h3>
                  <p className="text-[10px] text-zinc-600">Direct Anthropic subscription sign-in</p>
                </div>
                <span className="shrink-0 rounded-full bg-zinc-800/80 px-2 py-0.5 text-[10px] font-medium text-zinc-500">
                  coming very soon
                </span>
              </div>
            </section> */}
          </div>

          <div className="border-t border-zinc-800/70 px-3 py-2">
            <p className="text-center text-[10px] leading-relaxed text-zinc-600 text-pretty">
              Credentials stay in your browser. Log out clears stored tokens for that provider.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
