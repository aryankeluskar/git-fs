import { useEffect, useRef } from "react";
import { ChatMessage } from "./ChatMessage";
import { ChatComposer } from "./ChatComposer";
import { StatusShimmer } from "./Shimmer";
import { AuthPrompt } from "./AuthPrompt";
import type { UseAgentReturn } from "../hooks/useAgent";

interface ChatViewProps {
  agent: UseAgentReturn;
  repoLabel: string;
}

export function ChatView({ agent, repoLabel }: ChatViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const {
    messages,
    status,
    error,
    sendMessage,
    abort,
    refreshProviders,
    ready,
  } = agent;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  const isEmpty =
    messages.length === 0 && (status === "idle" || status === "needs_auth");
  const showLoadingRepo = !ready && status === "loading";

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-zinc-950">
      <div
        ref={scrollRef}
        className="smooth-scroll flex-1 overflow-y-auto"
      >
        <div className="mx-auto w-full max-w-3xl px-6 py-6">
          {isEmpty && (
            <div className="flex min-h-[35vh] flex-col items-center justify-center text-center animate-fade-in">
              <div className="mb-6 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
                <svg
                  width="36"
                  height="36"
                  viewBox="0 0 16 16"
                  fill="none"
                  className="text-emerald-500/80"
                >
                  <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" stroke="currentColor" strokeWidth="1" />
                  <path d="M4 8h3M4 6h5M4 10h4" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" />
                </svg>
              </div>
              <h3 className="mb-2 text-xl font-semibold tracking-tight text-zinc-100">
                {repoLabel}
              </h3>
              <p className="max-w-md text-[13.5px] leading-relaxed text-zinc-500">
                Ask anything about this codebase. The agent uses a custom VFS built on top of GitHub API to read files and answer questions.
              </p>
            </div>
          )}

          <div className="flex flex-col gap-5">
            {messages.map((msg) => (
              <ChatMessage key={msg.info.id} message={msg} allMessages={messages} />
            ))}
          </div>

          {showLoadingRepo && (
            <div className="mt-4 animate-fade-in-up">
              <StatusShimmer>Indexing repository...</StatusShimmer>
            </div>
          )}

          {status === "streaming" && (
            <div className="mt-4 animate-fade-in-up">
              <StatusShimmer>Thinking...</StatusShimmer>
            </div>
          )}

          {status === "needs_auth" && (
            <div className="mt-4 animate-fade-in-up">
              <AuthPrompt onAuthenticated={refreshProviders} />
            </div>
          )}

          {error && (
            <div className="mt-4 animate-fade-in-up">
              <div className="rounded-lg border border-red-900/50 bg-red-950/30 px-3.5 py-2.5 text-[13px] text-red-300">
                {error}
              </div>
            </div>
          )}
        </div>
      </div>

      <ChatComposer
        onSend={sendMessage}
        onAbort={abort}
        status={status}
        disabled={!ready || status === "needs_auth"}
      />
    </div>
  );
}
