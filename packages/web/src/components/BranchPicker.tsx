import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Marquee } from "./Marquee";

interface BranchPickerProps {
  owner: string;
  repo: string;
  branch: string;
}

interface GhBranch {
  name: string;
  protected?: boolean;
}

const CACHE = new Map<string, { at: number; branches: string[] }>();
const CACHE_TTL = 60_000;

export function BranchPicker({ owner, repo, branch }: BranchPickerProps) {
  const [open, setOpen] = useState(false);
  const [branches, setBranches] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const cacheKey = `${owner}/${repo}`;

  useEffect(() => {
    if (!open) return;

    function onDocClick(e: MouseEvent) {
      const t = e.target as Node;
      if (
        rootRef.current &&
        !rootRef.current.contains(t) &&
        popupRef.current &&
        !popupRef.current.contains(t)
      ) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => inputRef.current?.focus());

    const cached = CACHE.get(cacheKey);
    if (cached && Date.now() - cached.at < CACHE_TTL) {
      setBranches(cached.branches);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const collected: string[] = [];
        for (let page = 1; page <= 3; page++) {
          const res = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/branches?per_page=100&page=${page}`
          );
          if (!res.ok) throw new Error(`GitHub ${res.status}`);
          const data = (await res.json()) as GhBranch[];
          collected.push(...data.map((b) => b.name));
          if (data.length < 100) break;
        }
        if (cancelled) return;
        const sorted = dedupeAndSort(collected, branch);
        CACHE.set(cacheKey, { at: Date.now(), branches: sorted });
        setBranches(sorted);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, cacheKey, owner, repo, branch]);

  const filtered = useMemo(() => {
    if (!branches) return [];
    const q = query.trim().toLowerCase();
    if (!q) return branches;
    return branches.filter((b) => b.toLowerCase().includes(q));
  }, [branches, query]);

  useEffect(() => {
    setActiveIdx(0);
  }, [query, open]);

  function handleSelect(name: string) {
    setOpen(false);
    if (name === branch) return;
    const path =
      name === "main" || name === "master"
        ? `/${owner}/${repo}`
        : `/${owner}/${repo}/tree/${name}`;
    window.location.href = path;
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const sel = filtered[activeIdx];
      if (sel) handleSelect(sel);
    }
  }

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-idx="${activeIdx}"]`
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  useLayoutEffect(() => {
    if (!open) return;

    function update() {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPos({ top: rect.bottom + 6, left: rect.left });
    }
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="press focus-ring group flex min-w-0 max-w-[8rem] items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 font-mono text-[10.5px] text-zinc-400 transition hover:border-zinc-700 hover:bg-zinc-800/80 hover:text-zinc-200 sm:max-w-[12rem]"
        title="Switch branch"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <Marquee className="min-w-0 flex-1">{branch}</Marquee>
        <svg
          width="10"
          height="10"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          className={`opacity-60 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        >
          <path d="M4 6l4 4 4-4" />
        </svg>
      </button>

      {open && pos && createPortal(
        <div
          ref={popupRef}
          role="listbox"
          className="animate-fade-in fixed w-72 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/95 shadow-soft shadow-inset-hair backdrop-blur"
          style={{
            top: pos.top,
            left: pos.left,
            transformOrigin: "top left",
            zIndex: 2147483000,
          }}
          onWheel={(e) => e.stopPropagation()}
        >
          <div className="border-b border-zinc-800/80 p-2">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Find a branch…"
              className="w-full rounded-md bg-zinc-950/60 px-2.5 py-1.5 text-[13px] text-zinc-100 placeholder-zinc-600 outline-none ring-1 ring-zinc-800 transition focus:ring-emerald-500/30"
            />
          </div>

          <div ref={listRef} className="max-h-72 overflow-y-auto overscroll-contain py-1">
            {loading && !branches && (
              <div className="stagger px-2 py-1">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="my-1 h-5 rounded bg-zinc-800/60"
                    style={{ width: `${50 + ((i * 37) % 40)}%` }}
                  />
                ))}
              </div>
            )}

            {error && !loading && (
              <div className="px-3 py-3 text-[12.5px] text-red-400">
                {error}
              </div>
            )}

            {!loading && !error && filtered.length === 0 && (
              <div className="px-3 py-4 text-center text-[12.5px] text-zinc-500">
                No branches match “{query}”
              </div>
            )}

            {!error &&
              filtered.map((name, idx) => {
                const isCurrent = name === branch;
                const isActive = idx === activeIdx;
                return (
                  <button
                    key={name}
                    data-idx={idx}
                    role="option"
                    aria-selected={isCurrent}
                    onMouseEnter={() => setActiveIdx(idx)}
                    onClick={() => handleSelect(name)}
                    className={`flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left font-mono text-[12.5px] transition-colors ${
                      isActive
                        ? "bg-zinc-800/80 text-zinc-100"
                        : "text-zinc-300 hover:bg-zinc-800/50"
                    }`}
                  >
                    <span className="truncate">{name}</span>
                    {isCurrent && (
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="shrink-0 text-emerald-400"
                      >
                        <path d="M3 8l3.5 3.5L13 5" />
                      </svg>
                    )}
                  </button>
                );
              })}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function dedupeAndSort(names: string[], current: string): string[] {
  const unique = Array.from(new Set(names));
  unique.sort((a, b) => {
    const pri = (n: string) =>
      n === current ? 0 : n === "main" ? 1 : n === "master" ? 2 : 3;
    const pa = pri(a);
    const pb = pri(b);
    if (pa !== pb) return pa - pb;
    return a.localeCompare(b);
  });
  return unique;
}
