// The LKQ ECP session token (Task 42).
//
// PutSession returns a token documented as valid for 20 MINUTES. That is short
// enough that how it is cached actually matters.
//
// WHY IT IS PERSISTED IN platform_settings RATHER THAN A MODULE-LEVEL CACHE:
// on Fluid Compute there are many instances. A per-instance cache means every
// instance mints its own token, which at best wastes calls and at worst — if
// PutSession invalidates prior tokens for the same PCId, which is UNVERIFIED —
// makes instances knock each other out in a loop. That is exactly the failure
// lib/haynespro/client.ts was written to avoid for its VRID, so this copies its
// shape: one shared token row, read-before-mint on rejection, retry once.
//
// The pure half (fingerprint, staleness) is exported and unit-tested; the I/O
// half imports the service-role client dynamically so tests need no Supabase.

import type { SupabaseClient } from "@supabase/supabase-js";

import type { LkqEcpConfig } from "./types";

export const LKQ_SESSION_KEY = "lkq_ecp_session";

/** LKQ documents 20 minutes. */
export const LKQ_TOKEN_TTL_MS = 20 * 60 * 1000;

/**
 * Treat a token as stale 5 minutes early. A request that starts at 19m59s would
 * otherwise expire mid-flight and surface as a confusing "no session" error.
 */
export const LKQ_TOKEN_MARGIN_MS = 5 * 60 * 1000;

export interface StoredLkqSession {
  token: string;
  branch: string;
  /** ISO timestamp of the mint. */
  mintedAt: string;
  /** Identifies the credentials the token belongs to — see sessionFingerprint. */
  fingerprint: string;
}

/**
 * A token minted for one account/PCID is useless for another. If the env changes
 * between deploys, the stored token must not be reused — the fingerprint makes
 * that automatic rather than something someone has to remember.
 */
export function sessionFingerprint(config: LkqEcpConfig): string {
  let host = config.priceUrl;
  try {
    host = new URL(config.priceUrl).host;
  } catch {
    // Keep the raw string; it still discriminates.
  }
  return [config.sysId, config.pcId, config.account, config.branch, host].join("|");
}

/** Usable = right credentials, and minted recently enough to survive the call. */
export function isSessionUsable(
  session: StoredLkqSession | null | undefined,
  fingerprint: string,
  now: number = Date.now(),
): boolean {
  if (!session || typeof session.token !== "string" || !session.token) return false;
  if (session.fingerprint !== fingerprint) return false;

  const minted = Date.parse(session.mintedAt);
  if (!Number.isFinite(minted)) return false;

  return now - minted < LKQ_TOKEN_TTL_MS - LKQ_TOKEN_MARGIN_MS;
}

export async function readStoredSession(
  db: SupabaseClient,
): Promise<StoredLkqSession | null> {
  try {
    const { data } = await db
      .from("platform_settings")
      .select("value")
      .eq("key", LKQ_SESSION_KEY)
      .maybeSingle();

    const raw = data?.value as Partial<StoredLkqSession> | null | undefined;
    if (!raw || typeof raw.token !== "string" || !raw.token) return null;

    return {
      token: raw.token,
      branch: typeof raw.branch === "string" ? raw.branch : "",
      mintedAt: typeof raw.mintedAt === "string" ? raw.mintedAt : new Date(0).toISOString(),
      fingerprint: typeof raw.fingerprint === "string" ? raw.fingerprint : "",
    };
  } catch {
    return null;
  }
}

export async function storeSession(
  db: SupabaseClient,
  session: StoredLkqSession,
): Promise<void> {
  try {
    await db
      .from("platform_settings")
      .upsert({ key: LKQ_SESSION_KEY, value: session, updated_at: new Date().toISOString() });
  } catch {
    // Non-fatal — worst case the next instance mints its own.
  }
}
