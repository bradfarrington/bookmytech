import "server-only";
import { appendFileSync } from "node:fs";
import path from "node:path";

// Test-only outbox hook.
//
// When TEST_OUTBOX_DIR is set, every outbound email/SMS is appended as one JSON
// line to `<dir>/outbox.jsonl` instead of being delivered, so e2e tests can
// assert that a message was *dispatched* without actually sending real mail or
// texts (the "assert senders" strategy). This env var is ONLY ever set by the
// Playwright run (see playwright.config.ts) — in dev and production it is unset
// and this function is a no-op, so there is no behaviour change off the test path.
export function recordTestOutbox(
  kind: "email" | "sms",
  payload: Record<string, unknown>,
): boolean {
  const dir = process.env.TEST_OUTBOX_DIR;
  if (!dir) return false;
  try {
    appendFileSync(
      path.join(dir, "outbox.jsonl"),
      JSON.stringify({ kind, at: new Date().toISOString(), ...payload }) + "\n",
    );
  } catch (err) {
    console.error("[test-outbox] write failed", err);
  }
  return true;
}
