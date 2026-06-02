import { db, type Session } from "./index";

export async function createSession(
  fields: Pick<Session, "repoUrl" | "agent" | "sandboxId"> & {
    provider: string;
    branch?: string;
  }
): Promise<Session> {
  const now = new Date();
  const id = await db.sessions.add({
    ...fields,
    createdAt: now,
    lastActiveAt: now,
  });
  return db.sessions.get(id) as Promise<Session>;
}

export async function getSession(id: number): Promise<Session | undefined> {
  return db.sessions.get(id);
}

export async function touchSession(id: number): Promise<void> {
  await db.sessions.update(id, { lastActiveAt: new Date() });
}

export async function setSessionTitle(id: number, title: string): Promise<void> {
  await db.sessions.update(id, { title });
}

export async function deleteSession(id: number): Promise<void> {
  await db.sessions.delete(id);
  await db.messages.where("sessionId").equals(id).delete();
  await db.usage.where("sessionId").equals(id).delete();
}

const MAX_TITLE_LEN = 72;

export function deriveSessionTitle(firstUserMessage: string): string {
  const cleaned = firstUserMessage
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]*`/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";
  if (cleaned.length <= MAX_TITLE_LEN) return cleaned;
  const snippet = cleaned.slice(0, MAX_TITLE_LEN);
  const lastSpace = snippet.lastIndexOf(" ");
  const base = lastSpace > MAX_TITLE_LEN * 0.6 ? snippet.slice(0, lastSpace) : snippet;
  return `${base.trimEnd()}…`;
}
