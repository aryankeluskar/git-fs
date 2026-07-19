import { useEffect, useState } from "react";
import { ChatMessage } from "./ChatMessage";
import { GithubAuthGate, GithubSignIn } from "./AuthPrompt";
import { getSession } from "../db/sessions";
import { getSessionMessages } from "../db/messages";
import {
  filterLlmMessages,
  messagesToParts,
  type OcMessage,
} from "../hooks/useAgent";

interface ReadOnlySessionViewProps {
  sessionId: number;
  repoLabel: string;
  onAuthenticated: () => void | Promise<void>;
}

/**
 * Transcript-only view for a locally stored session when GitHub isn't
 * connected yet (e.g. seeded example threads). The transcript lives in
 * IndexedDB, so it renders without any GitHub calls; connecting is only
 * needed to continue the conversation. Falls back to the full auth gate
 * when the session doesn't exist or doesn't match the URL target.
 */
export function ReadOnlySessionView({
  sessionId,
  repoLabel,
  onAuthenticated,
}: ReadOnlySessionViewProps) {
  const [messages, setMessages] = useState<OcMessage[] | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const session = await getSession(sessionId);
        const matches =
          session && session.repoUrl === `https://github.com/${repoLabel}`;
        if (!matches) {
          if (!cancelled) setMissing(true);
          return;
        }
        const stored = await getSessionMessages(sessionId);
        if (cancelled) return;
        const parts = messagesToParts(filterLlmMessages(stored));
        if (parts.length === 0) setMissing(true);
        else setMessages(parts);
      } catch {
        if (!cancelled) setMissing(true);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [sessionId, repoLabel]);

  if (missing) {
    return (
      <GithubAuthGate repoLabel={repoLabel} onAuthenticated={onAuthenticated} />
    );
  }
  if (messages === null) return <div className="flex flex-1" />;

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden bg-zinc-950">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-grid" />
      <div className="relative smooth-scroll flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-6 py-6">
          <div className="flex flex-col gap-5">
            {messages.map((msg) => (
              <ChatMessage key={msg.info.id} message={msg} allMessages={messages} />
            ))}
          </div>
        </div>
      </div>

      <div className="relative shrink-0 border-t border-zinc-800/60 bg-zinc-950/80 px-6 py-4 backdrop-blur">
        <div className="mx-auto w-full max-w-xl animate-fade-in">
          <p className="mb-3 text-center text-[12.5px] leading-relaxed text-zinc-500">
            This is an example conversation. Connect GitHub to continue it or
            explore{" "}
            <span className="font-mono text-zinc-400">{repoLabel}</span>{" "}
            yourself — your token stays in this browser only (IndexedDB).
          </p>
          <GithubSignIn onAuthenticated={onAuthenticated} />
        </div>
      </div>
    </div>
  );
}
