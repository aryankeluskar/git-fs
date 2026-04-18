import { useState, useRef, useCallback, type ReactNode } from "react";
import type { ChatStatus } from "../hooks/useAgent";

interface ChatComposerProps {
  onSend: (text: string) => void;
  onAbort: () => void;
  status: ChatStatus;
  disabled?: boolean;
  /** Shown inside the input shell on the left (e.g. model / provider picker). */
  leadingControl?: ReactNode;
}

export function ChatComposer({
  onSend,
  onAbort,
  status,
  disabled,
  leadingControl,
}: ChatComposerProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isStreaming = status === "streaming" || status === "loading";

  const handleSubmit = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;

    if (isStreaming) {
      onAbort();
      return;
    }

    onSend(trimmed);
    setText("");

    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    });
  }, [text, disabled, isStreaming, onSend, onAbort]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  const handleInput = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, []);

  const inputRadius = leadingControl
    ? "rounded-none rounded-br-[20px] rounded-tr-[20px]"
    : "rounded-[20px]";

  return (
    <div className="border-t border-zinc-800/60 bg-zinc-950/90 backdrop-blur-md px-4 py-4">
      <div className="mx-auto flex max-w-3xl items-stretch gap-2">
        <div className="flex min-h-[52px] flex-1 rounded-[20px] bg-zinc-900/70 shadow-soft shadow-inset-hair ring-1 ring-zinc-800 transition-shadow duration-200 ease-[cubic-bezier(0.2,0,0,1)] focus-within:ring-emerald-600/40">
          {leadingControl}
          <div className="relative min-w-0 flex-1">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                handleInput();
              }}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything"
              disabled={disabled}
              rows={1}
              className={`w-full resize-none bg-transparent px-4 py-3 pr-14 text-[14.5px] leading-relaxed text-zinc-100 placeholder-zinc-600 outline-none disabled:opacity-40 ${inputRadius}`}
            />
            <button
              onClick={handleSubmit}
              disabled={disabled || (!text.trim() && !isStreaming)}
              className="press focus-ring absolute bottom-2 right-2 grid h-9 w-9 place-items-center rounded-[14px] bg-zinc-800 text-zinc-200 transition-[background-color,color,transform] duration-200 ease-[cubic-bezier(0.2,0,0,1)] hover:bg-emerald-600 hover:text-white disabled:opacity-30 disabled:hover:bg-zinc-800 disabled:hover:text-zinc-200"
              aria-label={isStreaming ? "Stop" : "Send"}
            >
              <span className="relative block h-[18px] w-[18px]">
              <span
                className="absolute inset-0 grid place-items-center transition-[opacity,transform,filter] duration-300"
                style={{
                  transitionTimingFunction: "cubic-bezier(0.2, 0, 0, 1)",
                  opacity: isStreaming ? 0 : 1,
                  transform: isStreaming ? "scale(0.25)" : "scale(1)",
                  filter: isStreaming ? "blur(4px)" : "blur(0)",
                }}
              >
                <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M8 14V2m0 0L3 7m5-5l5 5"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <span
                className="absolute inset-0 grid place-items-center transition-[opacity,transform,filter] duration-300"
                style={{
                  transitionTimingFunction: "cubic-bezier(0.2, 0, 0, 1)",
                  opacity: isStreaming ? 1 : 0,
                  transform: isStreaming ? "scale(1)" : "scale(0.25)",
                  filter: isStreaming ? "blur(0)" : "blur(4px)",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <rect x="3" y="3" width="10" height="10" rx="1.5" />
                </svg>
              </span>
              </span>
            </button>
          </div>
        </div>
      </div>

      {isStreaming && (
        <p className="mt-2 text-center text-[11px] text-zinc-500 animate-fade-in">
          Agent is working...{" "}
          <button onClick={onAbort} className="text-emerald-400 underline underline-offset-2 hover:text-emerald-300">
            Stop
          </button>
        </p>
      )}
    </div>
  );
}
