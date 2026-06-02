import { useState, useEffect } from "react";
import {
  getAllCredentials,
  setCredential,
  deleteCredential,
} from "../db/credentials";

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

const CREDENTIAL_KEYS = [
  { key: "GITHUB_TOKEN", label: "GitHub Token", placeholder: "ghp_..." },
];

export function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const [creds, setCreds] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (open) {
      getAllCredentials().then((c) => {
        setCreds(c);
        setDrafts(c);
      });
    }
  }, [open]);

  if (!open) return null;

  async function saveCred(key: string) {
    const val = drafts[key] ?? "";
    if (val) {
      await setCredential(key, val);
      setCreds((prev) => ({ ...prev, [key]: val }));
    } else {
      await deleteCredential(key);
      setCreds((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
    setSaved((prev) => ({ ...prev, [key]: true }));
    setTimeout(() => setSaved((prev) => ({ ...prev, [key]: false })), 1500);
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="animate-slide-in-right fixed inset-y-0 right-0 z-50 w-full max-w-md border-l border-zinc-800 bg-zinc-950 shadow-2xl">
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-zinc-800/60 px-6 py-4">
            <h2 className="text-[15px] font-semibold text-zinc-100">
              Settings
            </h2>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300"
            >
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                <path
                  d="M15 5L5 15M5 5l10 10"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            <div>
              <h3 className="mb-1 text-[12px] font-semibold uppercase tracking-widest text-zinc-500">
                Tokens
              </h3>
              <p className="mb-4 text-[12px] text-zinc-600">
                Stored only in this browser (IndexedDB). Never sent to our
                servers.
              </p>
              <div className="space-y-3">
                {CREDENTIAL_KEYS.map(({ key, label, placeholder }) => (
                  <div key={key}>
                    <label className="mb-1.5 block text-[12px] font-medium text-zinc-400">
                      {label}
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="password"
                        value={drafts[key] ?? ""}
                        onChange={(e) =>
                          setDrafts((d) => ({ ...d, [key]: e.target.value }))
                        }
                        placeholder={creds[key] ? "••••••••" : placeholder}
                        className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-[13px] text-zinc-100 placeholder-zinc-700 outline-none transition focus:border-zinc-700"
                      />
                      <button
                        onClick={() => saveCred(key)}
                        className={`rounded-lg px-3 py-2 text-[12px] font-medium transition ${
                          saved[key]
                            ? "bg-green-900/30 text-green-400"
                            : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
                        }`}
                      >
                        {saved[key] ? "Saved" : "Save"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="border-t border-zinc-800/60 px-6 py-4">
            <button
              onClick={onClose}
              className="w-full rounded-lg bg-zinc-800 py-2.5 text-[13px] font-medium text-zinc-300 transition hover:bg-zinc-700"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
