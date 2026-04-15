import Dexie, { type EntityTable } from "dexie";

export interface Session {
  id?: number;
  repoUrl: string;
  agent: string;
  /** LLM provider (e.g. anthropic, openai, github-copilot). */
  provider?: string;
  sandboxId: string;
  createdAt: Date;
  lastActiveAt: Date;
}

export interface Message {
  id?: number;
  sessionId: number;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
}

export interface Setting {
  key: string;
  value: string;
}

export interface Credential {
  key: string;
  value: string;
}

export interface UsageEntry {
  id?: number;
  sessionId: number;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  timestamp: Date;
}

export const db = new Dexie("gitsandbox") as Dexie & {
  sessions: EntityTable<Session, "id">;
  messages: EntityTable<Message, "id">;
  settings: EntityTable<Setting, "key">;
  credentials: EntityTable<Credential, "key">;
  usage: EntityTable<UsageEntry, "id">;
};

db.version(1).stores({
  sessions: "++id, repoUrl, agent, createdAt, lastActiveAt",
  messages: "++id, sessionId, role, timestamp",
  settings: "key",
  credentials: "key",
  usage: "++id, sessionId, provider, model, timestamp",
});

db.version(2).stores({
  sessions: "++id, repoUrl, agent, provider, createdAt, lastActiveAt",
  messages: "++id, sessionId, role, timestamp",
  settings: "key",
  credentials: "key",
  usage: "++id, sessionId, provider, model, timestamp",
});
