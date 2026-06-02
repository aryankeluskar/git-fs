import Dexie from "dexie";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { db, type StoredMessage } from "./index";

function serialize(message: AgentMessage): string {
  return JSON.stringify(message);
}

function deserialize(row: StoredMessage): AgentMessage | null {
  try {
    return JSON.parse(row.data) as AgentMessage;
  } catch {
    return null;
  }
}

export async function getSessionMessages(sessionId: number): Promise<AgentMessage[]> {
  const rows = await db.messages
    .where("[sessionId+order]")
    .between([sessionId, Dexie.minKey], [sessionId, Dexie.maxKey])
    .sortBy("order");
  const out: AgentMessage[] = [];
  for (const row of rows) {
    const msg = deserialize(row);
    if (msg) out.push(msg);
  }
  return out;
}

/**
 * Replace the entire transcript for a session. Used after every settle event
 * (`message_end` / `turn_end` / `agent_end`) so that edits and retries that
 * drop or mutate prior messages stay in sync with the persisted copy.
 */
export async function replaceSessionMessages(
  sessionId: number,
  messages: AgentMessage[]
): Promise<void> {
  const now = new Date();
  await db.transaction("rw", db.messages, async () => {
    await db.messages.where("sessionId").equals(sessionId).delete();
    if (messages.length === 0) return;
    await db.messages.bulkAdd(
      messages.map<StoredMessage>((m, idx) => ({
        sessionId,
        order: idx,
        data: serialize(m),
        updatedAt: now,
      }))
    );
  });
}
