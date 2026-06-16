import { readFileSync, existsSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

// Reads the test-only outbox that lib/test-outbox.ts writes when TEST_OUTBOX_DIR
// is set. Lets specs assert "an email/SMS was dispatched" without real delivery.

export interface OutboxEntry {
  kind: "email" | "sms";
  at: string;
  to?: string;
  subject?: string;
  body?: string;
}

function outboxFile(): string {
  const dir = process.env.TEST_OUTBOX_DIR;
  if (!dir) throw new Error("TEST_OUTBOX_DIR not set — check playwright.config.ts.");
  return path.join(dir, "outbox.jsonl");
}

/** Wipe the outbox so a test starts from a clean slate. */
export function resetOutbox(): void {
  const dir = process.env.TEST_OUTBOX_DIR;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "outbox.jsonl");
  if (existsSync(file)) rmSync(file);
}

/** All captured messages, newest last. Empty if nothing has been sent. */
export function readOutbox(): OutboxEntry[] {
  const file = outboxFile();
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as OutboxEntry);
}

/**
 * Poll the outbox until an entry matches, or time out. Sends are fire-and-forget
 * in the booking action, so they may land a beat after the page redirects.
 */
export async function waitForOutbox(
  match: (e: OutboxEntry) => boolean,
  timeoutMs = 10_000,
): Promise<OutboxEntry> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const hit = readOutbox().find(match);
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("Timed out waiting for a matching outbox entry.");
}
