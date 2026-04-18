import { useEffect, useRef } from "react";
import { ChatMessage, messageToText } from "./ChatMessage";
import { ChatComposer } from "./ChatComposer";
import { ModelProviderPicker } from "./ModelProviderPicker";
import { StatusShimmer } from "./Shimmer";
import { AuthPrompt } from "./AuthPrompt";
import { CopyButton } from "./CopyButton";
import type { UseAgentReturn, OcMessage } from "../hooks/useAgent";

function transcriptText(messages: OcMessage[]): string {
  return messages
    .filter((m) => m.info.role === "user" || m.info.role === "assistant")
    .map((m) => {
      const text = messageToText(m);
      if (!text) return "";
      const speaker = m.info.role === "user" ? "User" : "Assistant";
      return `${speaker}:\n${text}`;
    })
    .filter(Boolean)
    .join("\n\n---\n\n");
}

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
    activeModel,
    selectModel,
    logoutProvider,
    connectedProviders,
  } = agent;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  const isEmpty =
    messages.length === 0 && (status === "idle" || status === "needs_auth");
  const showLoadingRepo = !ready && status === "loading";
  const isAccount = repoLabel.length > 0 && !repoLabel.includes("/");
  const loadingMessage = isAccount
    ? "Spinning up sandbox for this account..."
    : "Spinning up sandbox for this repository...";
  const emptyDescription = isAccount
    ? "Ask anything about this account's repositories. The agent sees a manifest of all repos with metadata. To dive into a specific repo's source, open github.soy.run/" +
      repoLabel +
      "/<repo-name>."
    : "Ask anything about this codebase. The agent uses a custom VFS built on top of GitHub API to read files and answer questions.";

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden bg-zinc-950">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-grid" />
      <div
        ref={scrollRef}
        className="relative smooth-scroll flex-1 overflow-y-auto"
      >
        <div className="mx-auto w-full max-w-3xl px-6 py-6">
          {messages.length > 0 && (
            <div className="mb-3 flex justify-end">
              <CopyButton
                getText={() => transcriptText(messages)}
                label="Copy Full Transcript"
                text="Copy Full Transcript"
              />
            </div>
          )}
          {isEmpty && (
            <div className="flex min-h-[35vh] flex-col items-center justify-center text-center animate-fade-in">
              <div className="mb-6 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-3">
                  <img
                    src={`https://github.com/${repoLabel.split("/")[0]}.png?size=72`}
                    alt={repoLabel.split("/")[0]}
                    className="h-12 w-12 rounded-lg"
                  />
              </div>
              <h3 className="mb-2 text-xl font-semibold tracking-tight text-zinc-100">
                {repoLabel}
              </h3>
              <p className="max-w-md text-[13.5px] leading-relaxed text-zinc-500">
                {emptyDescription}
              </p>
            </div>
          )}

          <div className="flex flex-col gap-5">
            {messages.map((msg, idx) => (
              <ChatMessage
                key={msg.info.id}
                message={msg}
                allMessages={messages}
                extraActions={
                  idx === messages.length - 1 ? (
                    <CopyButton
                      getText={() => transcriptText(messages)}
                      label="Copy Full Transcript"
                      text="Copy Full Transcript"
                    />
                  ) : undefined
                }
              />
            ))}
          </div>

          {showLoadingRepo && (
            <div className="mt-4 animate-fade-in-up">
              <StatusShimmer>{loadingMessage}</StatusShimmer>
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
        leadingControl={
          <ModelProviderPicker
            activeModel={activeModel}
            connectedProviders={connectedProviders}
            onSelectModel={selectModel}
            onLogout={logoutProvider}
            onAuthSuccess={refreshProviders}
            locked={!ready}
          />
        }
        onSend={sendMessage}
        onAbort={abort}
        status={status}
        disabled={!ready || status === "needs_auth"}
      />
    </div>
  );
}
