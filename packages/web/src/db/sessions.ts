import { db, type Session } from "./index";

export async function createSession(
  fields: Pick<Session, "repoUrl" | "agent" | "sandboxId"> & {
    provider: string;
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

export async function listSessions(): Promise<Session[]> {
  return db.sessions.orderBy("lastActiveAt").reverse().toArray();
}

export async function getSession(id: number): Promise<Session | undefined> {
  return db.sessions.get(id);
}

export async function touchSession(id: number): Promise<void> {
  await db.sessions.update(id, { lastActiveAt: new Date() });
}

export async function deleteSession(id: number): Promise<void> {
  await db.sessions.delete(id);
  await db.messages.where("sessionId").equals(id).delete();
  await db.usage.where("sessionId").equals(id).delete();
}
