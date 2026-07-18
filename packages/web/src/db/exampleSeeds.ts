import { db, type Session, type StoredMessage } from "./index";
import seeds from "./exampleSessions.json";

/**
 * Example threads shown to brand-new users instead of an empty sidebar.
 * The transcripts are real recorded agent sessions (see exampleSessions.json);
 * they are seeded exactly once, behave like normal sessions afterwards
 * (openable, continuable, deletable), and are never re-created.
 */

interface ExampleSeed {
  session: Pick<
    Session,
    "repoUrl" | "agent" | "provider" | "title" | "branch" | "sandboxId"
  >;
  /** Parsed AgentMessage objects in transcript order. */
  messages: unknown[];
}

const SEEDED_FLAG = "exampleSessionsSeeded";

function isValidSeed(value: unknown): value is ExampleSeed {
  if (typeof value !== "object" || value === null) return false;
  const seed = value as Partial<ExampleSeed>;
  return (
    typeof seed.session === "object" &&
    seed.session !== null &&
    typeof seed.session.repoUrl === "string" &&
    typeof seed.session.sandboxId === "string" &&
    Array.isArray(seed.messages) &&
    seed.messages.length > 0
  );
}

export async function seedExampleSessionsOnce(): Promise<void> {
  const validSeeds = (seeds as unknown[]).filter(isValidSeed);
  if (validSeeds.length === 0) return;

  const already = await db.settings.get(SEEDED_FLAG);
  if (already) return;

  // Existing users keep their real history untouched; mark as handled so a
  // later wipe of all sessions doesn't resurrect the examples.
  const sessionCount = await db.sessions.count();
  if (sessionCount > 0) {
    await db.settings.put({ key: SEEDED_FLAG, value: "skipped" });
    return;
  }

  const now = Date.now();
  await db.transaction(
    "rw",
    db.sessions,
    db.messages,
    db.settings,
    async () => {
      for (const [i, seed] of validSeeds.entries()) {
        // Stagger timestamps so sidebar ordering matches the seed order.
        const ts = new Date(now - (i + 1) * 60_000);
        const sessionId = (await db.sessions.add({
          repoUrl: seed.session.repoUrl,
          agent: seed.session.agent,
          provider: seed.session.provider,
          title: seed.session.title,
          branch: seed.session.branch ?? undefined,
          sandboxId: seed.session.sandboxId,
          createdAt: ts,
          lastActiveAt: ts,
        })) as number;
        await db.messages.bulkAdd(
          seed.messages.map<StoredMessage>((m, order) => ({
            sessionId,
            order,
            data: JSON.stringify(m),
            updatedAt: ts,
          }))
        );
      }
      await db.settings.put({ key: SEEDED_FLAG, value: "seeded" });
    }
  );
}
