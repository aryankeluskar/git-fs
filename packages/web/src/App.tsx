import { useMemo, useState } from "react";
import { RepoInput } from "./components/RepoInput";
import { BranchPicker } from "./components/BranchPicker";
import { ChatView } from "./components/ChatView";
import { SessionSidebar } from "./components/SessionSidebar";
import { SettingsPanel } from "./components/SettingsPanel";
import { Marquee } from "./components/Marquee";
import { useAgent } from "./hooks/useAgent";
import { extractTargetFromPath } from "./lib/urlTarget";

const SUGGESTED_REPOS = [
  { owner: "expressjs", repo: "express", label: "expressjs/express" },
  { owner: "denoland", repo: "deno", label: "denoland/deno" },
  { owner: "vercel", repo: "next.js", label: "vercel/next.js" },
  { owner: "anthropics", repo: "claude-code", label: "anthropics/claude-code" },
  { owner: "openai", repo: "openai", label: "openai" },
  { owner: "linus", repo: "torvalds", label: "torvalds" },
  { owner: "karpathy", repo: "karpathy", label: "karpathy" },
  { owner: "cloudflare", repo: "cloudflare", label: "cloudflare" },
];

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

  const agent = useAgent(agentTarget);

  function handleNewSession() {
    window.history.pushState({}, "", "/");
    window.location.reload();
  }

  const repoLabel =
    urlTarget?.kind === "repo"
      ? `${urlTarget.owner}/${urlTarget.repo}`
      : urlTarget?.kind === "account"
        ? urlTarget.owner
        : "";

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100">
      {/* Mobile overlay */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm md:hidden animate-fade-in"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* Sidebar — always visible on md+, drawer on mobile */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-full flex-col border-r border-zinc-800/60 bg-zinc-900/40 backdrop-blur transition-transform duration-300 ease-smooth md:static md:w-[260px] md:translate-x-0 ${mobileSidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
          }`}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-800/60 px-4">
          <a
            href="/"
            className="text-[15px] font-semibold tracking-tight text-zinc-100"
          >
            <span className="text-emerald-400">git</span> sandbox
          </a>
          <button
            onClick={() => setMobileSidebarOpen(false)}
            className="rounded-md p-1 text-zinc-500 hover:text-zinc-200 md:hidden"
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

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-zinc-800/60 bg-zinc-950/80 px-4 backdrop-blur">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <button
              onClick={() => setMobileSidebarOpen(true)}
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
              <span className="text-[14px] font-medium tracking-tight text-zinc-400">
                {/* Start a new session */}
              </span>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <a
              href="https://github.com/aryankeluskar/gitsandbox"
              target="_blank"
              rel="noopener noreferrer"
              className="press focus-ring grid h-9 w-9 place-items-center rounded-lg text-zinc-500 hover:bg-zinc-800/60 hover:text-zinc-200"
              title="GitHub"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
              </svg>
            </a>
            {/* <button
              onClick={() => setSettingsOpen(true)}
              className="press focus-ring grid h-9 w-9 place-items-center rounded-lg text-zinc-500 hover:bg-zinc-800/60 hover:text-zinc-200"
              title="Settings"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M6.5 1.5h3l.5 2 1.5.8 2-.7 2.1 2.1-.7 2 .8 1.5 2 .5v3l-2 .5-1 1.5.7 2-2.1 2.1-2-.7-1.5.8-.5 2h-3l-.5-2-1.5-.8-2 .7L.4 13.6l.7-2-.8-1.5-2-.5v-3l2-.5.8-1.5-.7-2L2.5 .4l2 .7L6 .3l.5-2z"
                  stroke="currentColor"
                  strokeWidth="1.1"
                />
                <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.1" />
              </svg>
            </button> */}
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          {urlTarget ? (
            <ChatView agent={agent} repoLabel={repoLabel} />
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
      <Marquee className="text-[13.5px]">
        <a
          href={githubUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-zinc-200 transition hover:text-white"
        >
          <span className="text-zinc-500">{owner}</span>
          <span className="text-zinc-600">/</span>
          <span className="font-medium">{repo}</span>
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
      <Marquee className="text-[13.5px]">
        <a
          href={githubUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-zinc-200 transition hover:text-white"
        >
          <span className="font-medium">{owner}</span>
          <span className="ml-1.5 rounded bg-zinc-800/80 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-400">
            account
          </span>
        </a>
      </Marquee>
    </div>
  );
}

function HomePage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6">
      <div className="animate-fade-in w-full max-w-xl">
        <div className="mb-10 text-center">
          <h2 className="mb-3 text-3xl font-semibold tracking-tight text-zinc-50">
            <span className="text-emerald-400 mr-1">git</span>sandbox
          </h2>
          <p className="mx-auto max-w-md text-[14px] leading-relaxed text-zinc-400">
            Replace{" "}
            <code className="rounded bg-zinc-900 px-1.5 py-0.5 text-[13px] text-zinc-300">
              github.com
            </code>{" "}
            with{" "}
            <code className="rounded bg-zinc-900 px-1.5 py-0.5 text-[13px] text-emerald-400">
              github.soy.run
            </code>{" "}
            in any GitHub URL. Use your Claude, Codex or Copilot sub to instantly chat with the repo in your browser.
          </p>
        </div>

        <RepoInput
          onSubmit={(repoUrl) => {
            try {
              const url = new URL(repoUrl);
              const parts = url.pathname.split("/").filter(Boolean);
              if (parts.length >= 2) {
                window.location.href = `/${parts[0]}/${parts[1]}`;
                return;
              }
            } catch {
              /* try as owner/repo */
            }
            const segments = repoUrl.split("/").filter(Boolean);
            if (segments.length >= 2) {
              window.location.href = `/${segments[0]}/${segments[1]}`;
            }
          }}
          disabled={false}
        />

        <div className="mt-10">
          <p className="mb-3 text-center text-[11px] font-medium uppercase tracking-widest text-zinc-600">
            Try a repo or account
          </p>
          <div className="stagger flex flex-wrap justify-center gap-2">
            {SUGGESTED_REPOS.map((r) => (
              <a
                key={r.label}
                href={`/${r.label}`}
                className="press lift focus-ring rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-1.5 text-[13px] text-zinc-400 shadow-inset-hair hover:border-zinc-700 hover:bg-zinc-900 hover:text-zinc-100"
              >
                {r.label}
              </a>
            ))}
          </div>
        </div>

        <p className="mt-12 text-center text-[11px] leading-relaxed text-zinc-600">
          Powered by{" "}
          <a
            href="https://github.com/badlogic/pi-mono"
            target="_blank"
            rel="noopener noreferrer"
            className="text-zinc-500 hover:text-zinc-300"
          >
            pi-agent
          </a>{" "}
          and{" "}
          <a
            href="https://github.com/vercel-labs/just-bash"
            target="_blank"
            rel="noopener noreferrer"
            className="text-zinc-500 hover:text-zinc-300"
          >
            just-bash
          </a>
          {/* . Bring your own Anthropic / OpenAI key — stays in your browser. */}
        </p>
      </div>
    </div>
  );
}
