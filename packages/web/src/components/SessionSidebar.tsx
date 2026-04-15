import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";

interface SessionSidebarProps {
  activeSessionId?: number;
  onSelect: (sessionId: number) => void;
  onNewSession: () => void;
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function repoLabel(repoUrl: string): string {
  try {
    const url = new URL(repoUrl);
    return url.pathname.replace(/^\//, "").replace(/\/$/, "");
  } catch {
    return repoUrl;
  }
}

function repoPath(repoUrl: string): string {
  try {
    const url = new URL(repoUrl);
    return url.pathname;
  } catch {
    return "/";
  }
}

export function SessionSidebar({
  activeSessionId,
  onSelect,
  onNewSession,
}: SessionSidebarProps) {
  const sessions = useLiveQuery(
    () => db.sessions.orderBy("lastActiveAt").reverse().toArray(),
    []
  );

  return (
    <div className="flex h-full flex-col">
      <div className="p-3">
        <button
          onClick={onNewSession}
          className="press focus-ring flex w-full items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2.5 text-sm font-medium text-zinc-200 shadow-inset-hair hover:border-emerald-700/60 hover:bg-emerald-600/10 hover:text-emerald-300"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M8 3v10M3 8h10" />
          </svg>
          New Session
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2">
        {sessions?.length ? (
          <>
            <h2 className="px-2 pb-2 pt-3 text-[11px] font-semibold uppercase tracking-widest text-zinc-600">
              Sessions
            </h2>
            <div className="stagger flex flex-col gap-0.5">
              {sessions.map((s) => (
                <a
                  key={s.id}
                  href={repoPath(s.repoUrl)}
                  onClick={(e) => {
                    if (s.id === activeSessionId) {
                      e.preventDefault();
                      onSelect(s.id!);
                    }
                  }}
                  className={`press group block rounded-lg px-3 py-2 text-left ${
                    s.id === activeSessionId
                      ? "bg-zinc-800 text-zinc-50 ring-1 ring-zinc-700/80"
                      : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-100"
                  }`}
                >
                  <div className="truncate text-[13px] font-medium">
                    {repoLabel(s.repoUrl)}
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-[11px] text-zinc-600">
                    <span className="rounded bg-zinc-800/80 px-1.5 py-0.5 font-mono text-[10px] uppercase">
                      {s.agent}
                    </span>
                    <span className="tabular-nums">{timeAgo(s.lastActiveAt)}</span>
                  </div>
                </a>
              ))}
            </div>
          </>
        ) : (
          <div className="px-3 pt-6 text-center text-[13px] text-zinc-600">
            No local sessions yet
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-zinc-800/60 p-3">
        <p className="px-2 py-1.5 text-[13px] text-zinc-600">
          Built with 💚 by{" "}
          <a
            href="https://aryankeluskar.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-zinc-500 underline-offset-2 transition hover:text-emerald-300 hover:underline"
          >
            Aryan
          </a>
        </p>
        <div className="flex items-center gap-1.5">
          <a
            href="https://github.com/aryankeluskar"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub"
            title="GitHub"
            className="press focus-ring flex h-9 w-9 items-center justify-center rounded-lg text-zinc-600 transition hover:bg-zinc-800/60 hover:text-zinc-200"
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
          </a>
          <a
            href="https://x.com/soydotrun"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="X (Twitter)"
            title="X"
            className="press focus-ring flex h-9 w-9 items-center justify-center rounded-lg text-zinc-600 transition hover:bg-zinc-800/60 hover:text-zinc-200"
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
              <path d="M12.6.75h2.454l-5.36 6.142L16 15.25h-4.937l-3.867-5.07-4.425 5.07H.316l5.733-6.57L0 .75h5.063l3.495 4.633L12.601.75Zm-.86 13.028h1.36L4.323 2.145H2.865l8.875 11.633Z" />
            </svg>
          </a>
        </div>
      </div>
      
    </div>
  );
}
