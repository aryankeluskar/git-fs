import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type Session } from "../db";
import { deleteSession } from "../db/sessions";
import { buildSessionHref } from "../lib/urlTarget";

interface SessionSidebarProps {
  activeSessionId?: number;
  onSelect: (sessionId: number) => void;
  onNewSession: () => void;
}

type GroupKey = "today" | "yesterday" | "last7" | "last30" | "older";

const GROUP_LABEL: Record<GroupKey, string> = {
  today: "Today",
  yesterday: "Yesterday",
  last7: "Last 7 days",
  last30: "Last 30 days",
  older: "Older",
};

const GROUP_ORDER: GroupKey[] = ["today", "yesterday", "last7", "last30", "older"];

function startOfDay(d: Date): Date {
  const n = new Date(d);
  n.setHours(0, 0, 0, 0);
  return n;
}

function groupOf(session: Session): GroupKey {
  const now = new Date();
  const today = startOfDay(now).getTime();
  const yesterday = today - 24 * 60 * 60 * 1000;
  const last7 = today - 7 * 24 * 60 * 60 * 1000;
  const last30 = today - 30 * 24 * 60 * 60 * 1000;
  const t = startOfDay(session.lastActiveAt).getTime();
  if (t >= today) return "today";
  if (t >= yesterday) return "yesterday";
  if (t >= last7) return "last7";
  if (t >= last30) return "last30";
  return "older";
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

interface RepoMeta {
  owner: string;
  repo?: string;
  path: string;
  label: string;
}

function repoMeta(repoUrl: string): RepoMeta {
  try {
    const url = new URL(repoUrl);
    const path = url.pathname || "/";
    const parts = path.replace(/^\//, "").replace(/\/$/, "").split("/").filter(Boolean);
    const owner = parts[0] ?? "";
    const repo = parts[1];
    const label = repo ? `${owner}/${repo}` : owner;
    return { owner, repo, path, label };
  } catch {
    return { owner: repoUrl, path: "/", label: repoUrl };
  }
}

export function SessionSidebar({
  activeSessionId,
  onSelect,
  onNewSession,
}: SessionSidebarProps) {
  const [modifierHeld, setModifierHeld] = useState(false);

  useEffect(() => {
    function updateModifierState(event: KeyboardEvent) {
      setModifierHeld(event.metaKey || event.ctrlKey);
    }

    function clearModifierState() {
      setModifierHeld(false);
    }

    window.addEventListener("keydown", updateModifierState);
    window.addEventListener("keyup", updateModifierState);
    window.addEventListener("blur", clearModifierState);

    return () => {
      window.removeEventListener("keydown", updateModifierState);
      window.removeEventListener("keyup", updateModifierState);
      window.removeEventListener("blur", clearModifierState);
    };
  }, []);

  const sessions = useLiveQuery(
    () => db.sessions.orderBy("lastActiveAt").reverse().toArray(),
    []
  );

  const grouped = useMemo(() => {
    const result: Record<GroupKey, Session[]> = {
      today: [],
      yesterday: [],
      last7: [],
      last30: [],
      older: [],
    };
    for (const s of sessions ?? []) {
      result[groupOf(s)].push(s);
    }
    return result;
  }, [sessions]);

  const hasSessions = (sessions?.length ?? 0) > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="p-3">
        <button
          onClick={onNewSession}
          className="press focus-ring group flex w-full items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2.5 text-[13px] font-medium text-zinc-200 shadow-inset-hair transition-[color,background-color,border-color] hover:border-emerald-700/50 hover:bg-emerald-500/10 hover:text-emerald-300"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            className="transition-transform duration-200 group-hover:rotate-90"
          >
            <path d="M8 3v10M3 8h10" />
          </svg>
          <span className="flex-1 text-left">New session</span>
          <kbd
            className={`ml-auto hidden rounded bg-zinc-900 px-1.5 py-0.5 font-mono text-[12px] transition-transform duration-150 ease-[cubic-bezier(0.2,0,0,1)] group-hover:text-emerald-400/80 sm:inline-block ${modifierHeld ? "scale-105 text-emerald-400/80" : "scale-100 text-zinc-500"
              }`}
          >
            ⌘ + K
          </kbd>
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {hasSessions ? (
          <div className="flex flex-col gap-4">
            {GROUP_ORDER.map((group) => {
              const items = grouped[group];
              if (items.length === 0) return null;
              return (
                <div key={group}>
                  <h2 className="px-2 pb-1.5 pt-1 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">
                    {GROUP_LABEL[group]}
                  </h2>
                  <div className="stagger flex flex-col gap-0.5">
                    {items.map((s) => (
                      <SessionRow
                        key={s.id}
                        session={s}
                        active={s.id === activeSessionId}
                        onSelect={() => s.id !== undefined && onSelect(s.id)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState />
        )}
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-zinc-800/60 p-3">
        <p className="px-2 py-1 text-[12px] text-zinc-600">
          Built with{" "}
          <span className="text-emerald-500">♥</span> by{" "}
          <a
            href="https://aryankeluskar.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-zinc-500 underline-offset-2 transition hover:text-emerald-300 hover:underline"
          >
            Aryan
          </a>
        </p>
        <div className="flex items-center gap-0.5">
          <a
            href="https://github.com/aryankeluskar"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub"
            title="GitHub"
            className="press focus-ring grid h-9 w-9 place-items-center rounded-lg text-zinc-600 transition hover:bg-zinc-800/60 hover:text-zinc-200"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
          </a>
          <a
            href="https://x.com/soydotrun"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="X (Twitter)"
            title="X"
            className="press focus-ring grid h-9 w-9 place-items-center rounded-lg text-zinc-600 transition hover:bg-zinc-800/60 hover:text-zinc-200"
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
              <path d="M12.6.75h2.454l-5.36 6.142L16 15.25h-4.937l-3.867-5.07-4.425 5.07H.316l5.733-6.57L0 .75h5.063l3.495 4.633L12.601.75Zm-.86 13.028h1.36L4.323 2.145H2.865l8.875 11.633Z" />
            </svg>
          </a>
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mt-6 flex flex-col items-center justify-center gap-2 px-4 text-center">
      <p className="font-display text-[12.5px] font-semibold text-zinc-400">
        No sessions yet
      </p>
      <p className="text-[11.5px] leading-relaxed text-zinc-600">
        Open a repo from the home page to start.
      </p>
    </div>
  );
}

function SessionRow({
  session,
  active,
  onSelect,
}: {
  session: Session;
  active: boolean;
  onSelect: () => void;
}) {
  const meta = repoMeta(session.repoUrl);
  const displayTitle = session.title?.trim() || meta.label;
  const [avatarFailed, setAvatarFailed] = useState(false);
  const href =
    session.id !== undefined
      ? buildSessionHref({
          sessionId: session.id,
          owner: meta.owner,
          repo: meta.repo,
          branch: session.branch,
        })
      : meta.path;

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (session.id === undefined) return;
    await deleteSession(session.id);
    if (active) {
      // Navigate back to the bare repo/account URL so the active view resets
      // into an empty "new chat" state.
      window.location.href = meta.path;
    }
  }

  return (
    <a
      href={href}
      onClick={(e) => {
        if (active) {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`press group relative flex items-start gap-2 rounded-lg px-2 py-2 text-left transition-[color,background-color,box-shadow] ${active
        ? "bg-zinc-800/80 text-zinc-50 shadow-inset-hair"
        : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-100"
        }`}
    >
      <div className="relative mt-0.5 h-5 w-5 shrink-0 overflow-hidden rounded-md bg-zinc-800 ring-1 ring-zinc-800/80" aria-hidden>
        {avatarFailed ? (
          <div className="flex h-full w-full items-center justify-center text-zinc-600">
            <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
          </div>
        ) : (
          <img
            src={`https://github.com/${meta.owner}.png?size=40`}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
            decoding="async"
            onError={() => setAvatarFailed(true)}
            data-no-outline="true"
          />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium leading-tight">
          {displayTitle}
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-[10.5px] text-zinc-600">
          <span className="max-w-[110px] truncate font-mono text-[10px] text-zinc-500">
            {meta.label}
          </span>
          <span className="text-zinc-700">·</span>
          <span className="ml-auto tabular-nums text-zinc-600">
            {timeAgo(session.lastActiveAt)}
          </span>
        </div>
      </div>

      <button
        onClick={handleDelete}
        className="press focus-ring absolute right-1.5 top-1.5 hidden h-6 w-6 items-center justify-center rounded-md text-zinc-500 opacity-0 transition-[opacity,color,background-color] hover:text-red-300 group-hover:flex group-hover:opacity-100"
        aria-label="Delete session"
        title="Delete session"
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M4 4l8 8M12 4l-8 8" />
        </svg>
      </button>
    </a>
  );
}
