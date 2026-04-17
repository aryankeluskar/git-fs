import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { RepoInput } from "./components/RepoInput";
import { BranchPicker } from "./components/BranchPicker";
import { ChatView } from "./components/ChatView";
import { SessionSidebar } from "./components/SessionSidebar";
import { SettingsPanel } from "./components/SettingsPanel";
import { Marquee } from "./components/Marquee";
import { GithubRepoCard } from "./components/GithubRepoCard";
import { useAgent } from "./hooks/useAgent";
import { extractTargetFromPath } from "./lib/urlTarget";
import { hasGithubAuth } from "./lib/githubAuth";
import { GithubAuthGate } from "./components/AuthPrompt";
import { db } from "./db";

interface SuggestedRepo {
  owner: string;
  repo?: string;
  label: string;
}

const SUGGESTED_REPOS: ReadonlyArray<SuggestedRepo> = [
  { owner: "oven-sh", repo: "bun", label: "oven-sh/bun" },
  { owner: "karpathy", label: "karpathy" },
  { owner: "cloudflare", label: "cloudflare" },
  { owner: "vercel", repo: "next.js", label: "vercel/next.js" },
  { owner: "denoland", repo: "deno", label: "denoland/deno" },
  { owner: "anthropics", repo: "claude-code", label: "anthropics/claude-code" },
  { owner: "expressjs", repo: "express", label: "expressjs/express" },
  { owner: "rust-lang", repo: "rust", label: "rust-lang/rust" },
];

type LandingTab = "recent" | "suggested";

export default function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const urlTarget = useMemo(
    () => extractTargetFromPath(window.location.pathname),
    []
  );

  const agentTarget = useMemo(() => {
    if (!urlTarget) return null;
    if (urlTarget.kind === "account") {
      return { kind: "account" as const, owner: urlTarget.owner };
    }
    return {
      kind: "repo" as const,
      owner: urlTarget.owner,
      repo: urlTarget.repo,
      branch: urlTarget.branch,
    };
  }, [urlTarget]);

  // Gate: direct-loaded repo/account URLs require a GitHub token before any
  // API calls run. We resolve this asynchronously on mount and whenever the
  // target changes. Null = unknown (still checking). The landing page never
  // trips this gate because it's only consulted when `urlTarget` is set.
  const [githubAuthed, setGithubAuthed] = useState<boolean | null>(null);
  useEffect(() => {
    if (!urlTarget) {
      setGithubAuthed(null);
      return;
    }
    let cancelled = false;
    setGithubAuthed(null);
    hasGithubAuth().then((ok) => {
      if (!cancelled) setGithubAuthed(ok);
    });
    return () => {
      cancelled = true;
    };
  }, [urlTarget?.kind, urlTarget?.owner, urlTarget?.kind === "repo" ? urlTarget.repo : ""]);

  // Only instantiate the agent (which fires network calls) once GitHub auth
  // is present. Otherwise pass null so the agent hook stays dormant.
  const agent = useAgent(githubAuthed === true ? agentTarget : null);

  function handleNewSession() {
    // Strip the session id from the URL and reload. Staying on the current
    // repo (if any) is the right default - users usually want a fresh chat
    // in the same context, not a jump back to the landing page.
    const url = new URL(window.location.href);
    url.searchParams.delete("s");
    window.location.href = url.pathname + url.search + url.hash;
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k") {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      handleNewSession();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const repoLabel =
    urlTarget?.kind === "repo"
      ? `${urlTarget.owner}/${urlTarget.repo}`
      : urlTarget?.kind === "account"
        ? urlTarget.owner
        : "";

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100">
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm md:hidden animate-fade-in"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-full flex-col border-r border-zinc-800/60 bg-zinc-900/40 backdrop-blur transition-transform duration-300 ease-smooth md:static md:w-[272px] md:translate-x-0 ${mobileSidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
          }`}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-800/60 px-4">
          <a
            href="/"
            className="group flex items-center gap-2 font-display text-[15px] font-bold tracking-tight text-zinc-100 focus-ring rounded-sm"
          >
            <span className="text-emerald-400">git</span>
            <span>sandbox</span>
          </a>
          <button
            onClick={() => setMobileSidebarOpen(false)}
            className="press focus-ring grid h-9 w-9 place-items-center rounded-md text-zinc-500 hover:bg-zinc-800/60 hover:text-zinc-200 md:hidden"
            aria-label="Close sidebar"
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M15 5L5 15M5 5l10 10" />
            </svg>
          </button>
        </div>
        <SessionSidebar
          activeSessionId={agent.sessionId}
          onSelect={() => {
            setMobileSidebarOpen(false);
          }}
          onNewSession={handleNewSession}
        />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader
          urlTarget={urlTarget}
          onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
        />

        <div className="flex min-h-0 flex-1">
          {urlTarget ? (
            githubAuthed === false ? (
              <GithubAuthGate
                repoLabel={repoLabel}
                onAuthenticated={async () => {
                  setGithubAuthed(await hasGithubAuth());
                }}
              />
            ) : githubAuthed === true ? (
              <ChatView agent={agent} repoLabel={repoLabel} />
            ) : (
              <div className="flex flex-1" />
            )
          ) : (
            <HomePage />
          )}
        </div>
      </div>

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}

interface AppHeaderProps {
  urlTarget: ReturnType<typeof extractTargetFromPath>;
  onOpenMobileSidebar: () => void;
  onOpenSettings: () => void;
}

function AppHeader({ urlTarget, onOpenMobileSidebar, onOpenSettings }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b border-zinc-800/60 bg-zinc-950/80 px-3 backdrop-blur-md">
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <button
          onClick={onOpenMobileSidebar}
          className="press focus-ring grid h-9 w-9 place-items-center rounded-md text-zinc-500 hover:bg-zinc-800/60 hover:text-zinc-200 md:hidden"
          aria-label="Open sidebar"
        >
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
            <path d="M2 4h12M2 8h12M2 12h12" />
          </svg>
        </button>

        {urlTarget?.kind === "repo" ? (
          <RepoBreadcrumb
            owner={urlTarget.owner}
            repo={urlTarget.repo}
            branch={urlTarget.branch ?? "main"}
          />
        ) : urlTarget?.kind === "account" ? (
          <AccountBreadcrumb owner={urlTarget.owner} />
        ) : (
          <div className="hidden items-center gap-2 md:flex">
            <span className="font-display text-[12.5px] text-zinc-500">
              {/* <span className="text-zinc-600">~/</span>
              <span className="text-zinc-400">home</span> */}
            </span>
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        <HeaderDivider />
        <HeaderIconLink
          href="https://github.com/aryankeluskar/gitsandbox"
          label="Star on GitHub"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
        </HeaderIconLink>
        <HeaderIconLink
          href="https://x.com/soydotrun"
          label="Follow on X"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M12.6.75h2.454l-5.36 6.142L16 15.25h-4.937l-3.867-5.07-4.425 5.07H.316l5.733-6.57L0 .75h5.063l3.495 4.633L12.601.75Zm-.86 13.028h1.36L4.323 2.145H2.865l8.875 11.633Z" />
          </svg>
        </HeaderIconLink>
        <HeaderIconButton label="Settings" onClick={onOpenSettings}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </HeaderIconButton>
      </div>
    </header>
  );
}

function HeaderDivider() {
  return <span aria-hidden className="mx-1 hidden h-5 w-px bg-zinc-800 md:block" />;
}

function HeaderIconLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="press focus-ring relative grid h-10 w-10 place-items-center rounded-lg text-zinc-500 transition-[color,background-color] hover:bg-zinc-800/60 hover:text-zinc-100"
      aria-label={label}
      title={label}
    >
      {children}
    </a>
  );
}

function HeaderIconButton({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="press focus-ring grid h-10 w-10 place-items-center rounded-lg text-zinc-500 transition-[color,background-color] hover:bg-zinc-800/60 hover:text-zinc-100"
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}

function RepoBreadcrumb({
  owner,
  repo,
  branch,
}: {
  owner: string;
  repo: string;
  branch: string;
}) {
  const githubUrl = `https://github.com/${owner}/${repo}`;
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <img
        src={`https://github.com/${owner}.png?size=32`}
        alt=""
        className="h-6 w-6 shrink-0 rounded-md bg-zinc-800 ring-1 ring-zinc-800"
      />
      <Marquee className="font-display text-[13.5px]">
        <a
          href={githubUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-zinc-200 transition hover:text-white"
        >
          <span className="text-zinc-500">{owner}</span>
          <span className="text-zinc-700">/</span>
          <span className="font-semibold">{repo}</span>
        </a>
      </Marquee>
      <BranchPicker owner={owner} repo={repo} branch={branch} />
    </div>
  );
}

function AccountBreadcrumb({ owner }: { owner: string }) {
  const githubUrl = `https://github.com/${owner}`;
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <img
        src={`https://github.com/${owner}.png?size=32`}
        alt=""
        className="h-6 w-6 shrink-0 rounded-md bg-zinc-800 ring-1 ring-zinc-800"
      />
      <Marquee className="font-display text-[13.5px]">
        <a
          href={githubUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-zinc-200 transition hover:text-white"
        >
          <span className="font-semibold">{owner}</span>
          <span className="ml-1.5 rounded border border-zinc-800 bg-zinc-900/60 px-1.5 py-0.5 font-sans text-[10px] font-medium uppercase tracking-wider text-zinc-500">
            account
          </span>
        </a>
      </Marquee>
    </div>
  );
}

function HomePage() {
  const sessions = useLiveQuery(
    () => db.sessions.orderBy("lastActiveAt").reverse().limit(4).toArray(),
    []
  );
  const hasRecent = Boolean(sessions && sessions.length > 0);
  const [tab, setTab] = useState<LandingTab>(hasRecent ? "recent" : "suggested");

  // Auto-switch when sessions finish loading.
  const resolvedTab = sessions === undefined
    ? "suggested"
    : hasRecent
      ? tab
      : "suggested";

  const recentCards = useMemo(() => {
    if (!sessions) return [];
    return sessions.map((s) => {
      const path = (() => {
        try {
          return new URL(s.repoUrl).pathname || "/";
        } catch {
          return "/";
        }
      })();
      const parts = path.replace(/^\//, "").split("/").filter(Boolean);
      const [owner, repo] = parts;
      return { key: s.id, owner, repo, path };
    });
  }, [sessions]);

  return (
    <div className="relative flex flex-1 flex-col overflow-y-auto">
      {/* Background decoration */}
      <div aria-hidden className="pointer-events-none absolute inset-0 hero-glow" />
      <div aria-hidden className="pointer-events-none absolute inset-0 hero-grid" />

      <div className="relative flex flex-1 flex-col items-center justify-start px-6 pt-16 pb-20 md:pt-[10vh]">
        <div className="stagger-hero w-full max-w-xl">
          {/* Hero */}
          <div className="mb-10 text-center">
            <h1 className="font-display text-5xl font-bold tracking-tight text-zinc-100 leading-none sm:text-6xl md:text-7xl">
              <span className="text-emerald-400 mr-2">git</span>
              <span>sandbox</span>
              {/* <span className="cursor-blink ml-1 -mb-1 bg-emerald-400 align-baseline" aria-hidden /> */}
            </h1>
            <p className="mx-auto mt-10 max-w-lg text-[14px] leading-relaxed text-zinc-400">
              Replace{" "}
              <code className="rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 font-mono text-[12.5px] text-zinc-300">
                github.com
              </code>{" "}
              with{" "}
              <code className="rounded border border-emerald-900/60 bg-emerald-950/30 px-1.5 py-0.5 font-mono text-[12.5px] text-emerald-300">
                github.soy.run
              </code>{" "}
              on any GitHub URL. Use your Claude, Codex or Copilot sub to instantly chat with any repo in your browser.
            </p>
          </div>

          {/* Input */}
          <RepoInput
            onSubmit={({ path }) => {
              window.location.href = path;
            }}
            disabled={false}
          />

          {/* Tabs */}
          <div className="mt-10">
            <div className="mb-4 flex items-center justify-center gap-1 rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-1 mx-auto w-fit shadow-inset-hair">
              <TabButton
                active={resolvedTab === "recent"}
                disabled={!hasRecent}
                onClick={() => setTab("recent")}
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="8" cy="8" r="6" />
                  <path d="M8 5v3l2 1.5" />
                </svg>
                Recent
              </TabButton>
              <TabButton
                active={resolvedTab === "suggested"}
                onClick={() => setTab("suggested")}
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 1.5l1.8 4 4.4.5-3.3 3 .9 4.4L8 11.3l-3.8 2.1.9-4.4-3.3-3 4.4-.5L8 1.5z" />
                </svg>
                Suggested
              </TabButton>
            </div>

            {resolvedTab === "recent" && hasRecent ? (
              <ul className="stagger flex flex-col gap-2">
                {recentCards.map((r) => (
                  <li key={r.key}>
                    <GithubRepoCard
                      owner={r.owner}
                      repo={r.repo}
                      href={r.path}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="stagger flex flex-col gap-2">
                {SUGGESTED_REPOS.map((r) => (
                  <li key={r.label}>
                    <GithubRepoCard
                      owner={r.owner}
                      repo={r.repo}
                      href={`/${r.label}`}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Footer */}
          <p className="mt-14 text-center text-[11.5px] leading-relaxed text-zinc-600">
            Powered by{" "}
            <a
              href="https://github.com/badlogic/pi-mono"
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-zinc-500 transition-colors hover:text-emerald-300"
            >
              pi-agent
            </a>{" "}
            ·{" "}
            <a
              href="https://github.com/vercel-labs/just-bash"
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-zinc-500 transition-colors hover:text-emerald-300"
            >
              just-bash
            </a>{" "}
          </p>
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`press focus-ring relative flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[12.5px] font-medium transition-[color,background-color] duration-200 disabled:cursor-not-allowed disabled:opacity-40 ${active
        ? "bg-zinc-800 text-zinc-100 shadow-inset-hair"
        : "text-zinc-500 hover:text-zinc-200"
        }`}
    >
      {children}
    </button>
  );
}
