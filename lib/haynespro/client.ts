// HaynesPro Data Exchange client (Task 16; production accounts Task 44).
//
// Thin fetcher for the REST JSON endpoint:
//   https://www.haynespro-services.com/workshopServices3/rest/jsonendpoint/{operation}?vrid=…&…
//
// TWO ACCOUNTS. HaynesPro's production licence (2026-09-14) splits the API:
//   - DX ID      — identification only: reg/VIN/make-model lookups and the
//                  identification tree. Not invoiced.
//   - DX Content — everything once the HaynesPro car type is known: repair
//                  times, manuals, adjustments, capacities.
// Every call names its session (`HaynesProSession`), which picks the account.
// An operation sent to the wrong account is refused with statusCode 6 (no
// rights) — verified live: getRepairtimeTypesV2 on DX ID.
//
// SESSION RULES. These are HaynesPro's, contractual — do not relax them:
//   - a VRID is vehicle- and user-specific; a different vehicle needs a new one;
//   - content session usernames must be `<prefix>_<vehicle identifier>`; we use
//     the car type id (`bmt_619023786`);
//   - caching tokens is prohibited, EXCEPT reusing a token on the same day, by
//     the username that minted it, for that same vehicle.
// So there is no app-wide token. Each (account, username) has its own row in
// platform_settings (`haynespro_session:<account>:<username>`), reused only on
// the same Europe/London calendar day.
//
// Why persist at all rather than mint per call: minting a VRID for a username
// invalidates every earlier VRID for that username. On Fluid Compute two
// instances pricing the same car would knock each other out in a loop. So: read
// the row; on statusCode 5 (bad/expired vrid) re-read it first (another
// instance may have re-minted), mint only if ours was the stored one, retry
// once. Within one instance, concurrent mints for the same session are
// collapsed into one — the catalogue search fans out 8 calls at a time for one
// vehicle, and 8 parallel mints would invalidate each other. Rows older than a
// day are deleted whenever a new session is minted.
//
// Everything degrades silently: if the env vars are missing or any call fails,
// callers get null/thrown-and-caught and the pricing ladder falls through to
// the service-default duration. The booking funnel must NEVER block on
// HaynesPro (Task 16 acceptance criterion).
//
// NB: the service-role Supabase client is imported dynamically inside the
// functions (never at module top) so pure helpers stay importable in unit
// tests without pulling in "server-only" — same pattern as lib/pricing.

import type { SupabaseClient } from "@supabase/supabase-js";

import { describeAuthStatus, recordHaynesProHealth } from "./health";

const REST_BASE =
  "https://www.haynespro-services.com/workshopServices3/rest/jsonendpoint";

const SESSION_KEY_PREFIX = "haynespro_session:";
/** Rows are only ever reused on the day they were minted; anything older is dead weight. */
const SESSION_ROW_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 12_000;

export const DEFAULT_USERNAME_PREFIX = "bmt";
/** HaynesPro's limit on a session username. */
export const MAX_USERNAME_LENGTH = 32;

export type HaynesProAccount = "id" | "content";

/**
 * Which account a call runs on, and for what. Identification names whatever it
 * is identifying (a reg, a car type id, or "browse" for the make/model tree);
 * content always names the car type.
 */
export type HaynesProSession =
  | { account: "id"; identifier: string | number }
  | { account: "content"; carTypeId: number };

export interface HaynesProAccountCredentials {
  distributorUsername: string;
  distributorPassword: string;
}

export interface HaynesProConfig {
  id: HaynesProAccountCredentials;
  content: HaynesProAccountCredentials;
  usernamePrefix: string;
}

const ACCOUNT_NAMES: Record<HaynesProAccount, string> = {
  id: "DX ID account",
  content: "DX Content account",
};

/** Both accounts are required: without DX ID nothing can be identified, without DX Content nothing priced. */
export function getHaynesProConfig(): HaynesProConfig | null {
  const idUser = process.env.HAYNESPRO_ID_DISTRIBUTOR_USERNAME;
  const idPass = process.env.HAYNESPRO_ID_DISTRIBUTOR_PASSWORD;
  const contentUser = process.env.HAYNESPRO_CONTENT_DISTRIBUTOR_USERNAME;
  const contentPass = process.env.HAYNESPRO_CONTENT_DISTRIBUTOR_PASSWORD;
  if (!idUser || !idPass || !contentUser || !contentPass) return null;
  return {
    id: { distributorUsername: idUser, distributorPassword: idPass },
    content: { distributorUsername: contentUser, distributorPassword: contentPass },
    usernamePrefix: alphanumeric(process.env.HAYNESPRO_USERNAME_PREFIX ?? "") || DEFAULT_USERNAME_PREFIX,
  };
}

export function isHaynesProConfigured(): boolean {
  return getHaynesProConfig() !== null;
}

/** Values accepted as query params. Arrays repeat the key (genArtNumbers=1&genArtNumbers=2). */
export type HaynesProParams = Record<
  string,
  string | number | boolean | Array<string | number> | null | undefined
>;

// ---------------------------------------------------------------------------
// Pure helpers — unit-tested.
// ---------------------------------------------------------------------------

function alphanumeric(value: string | number): string {
  return String(value).replace(/[^A-Za-z0-9]/g, "");
}

/** The session username HaynesPro requires: `<prefix>_<identifier>`, ≤32 chars. */
export function sessionUsername(prefix: string, session: HaynesProSession): string {
  const p = alphanumeric(prefix) || DEFAULT_USERNAME_PREFIX;
  const identifier =
    alphanumeric(session.account === "content" ? session.carTypeId : session.identifier) || "unknown";
  return `${p}_${identifier}`.slice(0, MAX_USERNAME_LENGTH);
}

/** The platform_settings key a session is stored under. Accounts never share a row. */
export function sessionSettingsKey(account: HaynesProAccount, username: string): string {
  return `${SESSION_KEY_PREFIX}${account}:${username}`;
}

/** "Same day" in HaynesPro's rule is the UK calendar day: YYYY-MM-DD, Europe/London. */
export function sessionDay(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export interface StoredHaynesProSession {
  vrid: string;
  username: string;
  /** sessionDay() when it was minted. */
  day: string;
}

export function parseStoredSession(raw: unknown): StoredHaynesProSession | null {
  if (raw == null || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  if (typeof rec.vrid !== "string" || !rec.vrid) return null;
  if (typeof rec.username !== "string" || typeof rec.day !== "string") return null;
  return { vrid: rec.vrid, username: rec.username, day: rec.day };
}

/** Reusable only by the username that minted it, on the day it was minted. */
export function isSessionReusable(
  stored: StoredHaynesProSession | null,
  username: string,
  day: string,
): stored is StoredHaynesProSession {
  return stored != null && stored.username === username && stored.day === day;
}

/**
 * Extract a HaynesPro status code from a parsed REST reply. The envelope
 * varies by operation: auth returns {statusCode}, data ops return arrays whose
 * items carry {status: {statusCode}} (verified live: a bad vrid yields HTTP
 * 200 + [{…, status: {statusCode: 5}}]). Returns null when no status found
 * (which means OK — many ops omit status entirely on success).
 */
export function extractStatusCode(payload: unknown): number | null {
  const fromObject = (obj: unknown): number | null => {
    if (obj == null || typeof obj !== "object") return null;
    const rec = obj as Record<string, unknown>;
    if (typeof rec.statusCode === "number") return rec.statusCode;
    const status = rec.status as Record<string, unknown> | undefined;
    if (status && typeof status.statusCode === "number") {
      return status.statusCode;
    }
    return null;
  };
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const code = fromObject(item);
      if (code != null && code !== 0) return code;
    }
    return null;
  }
  return fromObject(payload);
}

/** Status codes that mean "the vrid is no good — re-authenticate". */
export function isAuthFailure(code: number | null): boolean {
  return code === 5;
}

// ---------------------------------------------------------------------------
// Session persistence (platform_settings, service-role).
// ---------------------------------------------------------------------------

type DbClient = SupabaseClient;

async function adminDb(): Promise<DbClient> {
  const { createAdminClient } = await import("@/lib/supabase/admin");
  return createAdminClient();
}

async function readSessionVrid(db: DbClient, key: string, username: string): Promise<string | null> {
  try {
    const { data } = await db
      .from("platform_settings")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    const stored = parseStoredSession(data?.value);
    return isSessionReusable(stored, username, sessionDay()) ? stored.vrid : null;
  } catch {
    return null;
  }
}

async function storeSession(db: DbClient, key: string, session: StoredHaynesProSession): Promise<void> {
  try {
    await db
      .from("platform_settings")
      .upsert({ key, value: session, updated_at: new Date().toISOString() });
    // Sessions are per vehicle, so rows accumulate; none is reusable after its day.
    await db
      .from("platform_settings")
      .delete()
      .like("key", `${SESSION_KEY_PREFIX}%`)
      .lt("updated_at", new Date(Date.now() - SESSION_ROW_MAX_AGE_MS).toISOString());
  } catch {
    // Non-fatal — worst case the next instance mints its own.
  }
}

/** In-flight mints per session key, so concurrent calls in one instance mint once. Never holds a token after the mint settles. */
const inflightMints = new Map<string, Promise<string | null>>();

function mintOnce(key: string, mint: () => Promise<string | null>): Promise<string | null> {
  const pending = inflightMints.get(key);
  if (pending) return pending;
  const minting = mint().finally(() => inflightMints.delete(key));
  inflightMints.set(key, minting);
  return minting;
}

async function mintVrid(
  credentials: HaynesProAccountCredentials,
  account: HaynesProAccount,
  username: string,
  db: DbClient,
): Promise<string | null> {
  const accountName = ACCOUNT_NAMES[account];
  try {
    const url = buildUrl("getAuthenticationVrid", {
      distributorUsername: credentials.distributorUsername,
      distributorPassword: credentials.distributorPassword,
      username,
    });
    const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), cache: "no-store" });
    if (!res.ok) {
      await recordHaynesProHealth(db, {
        state: "unreachable",
        statusCode: null,
        detail: `HaynesPro's auth endpoint responded ${res.status} (${accountName}).`,
      });
      return null;
    }
    const body = (await res.json()) as { vrid?: string; statusCode?: number };
    if (body.statusCode === 0 && body.vrid) {
      await recordHaynesProHealth(db, {
        state: "ok",
        statusCode: 0,
        detail: `Authenticated successfully (${accountName}).`,
      });
      return body.vrid;
    }
    // A rejection here is an account problem, not a vehicle problem — the whole
    // catalogue is down for every customer until someone acts on it. Record it
    // so /admin/vehicles can say so, instead of it living only in a server log.
    const statusCode = body.statusCode ?? null;
    console.error(`[haynespro] ${accountName} auth failed, statusCode:`, statusCode);
    await recordHaynesProHealth(db, {
      state: "auth_failed",
      statusCode,
      detail: `${accountName}: ${describeAuthStatus(statusCode)}`,
    });
    return null;
  } catch (err) {
    console.error(`[haynespro] ${accountName} auth request failed:`, err);
    await recordHaynesProHealth(db, {
      state: "unreachable",
      statusCode: null,
      detail: `We couldn't reach HaynesPro at all (network error or timeout, ${accountName}).`,
    });
    return null;
  }
}

// ---------------------------------------------------------------------------
// Fetcher.
// ---------------------------------------------------------------------------

function buildUrl(operation: string, params: HaynesProParams): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      for (const v of value) qs.append(key, String(v));
    } else {
      qs.set(key, String(value));
    }
  }
  return `${REST_BASE}/${operation}?${qs.toString()}`;
}

async function rawCall(operation: string, params: HaynesProParams): Promise<unknown> {
  const res = await fetch(buildUrl(operation, params), {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    // Vehicle data changes quarterly; never let Next cache API replies — the
    // app has its own DB-level cache with an explicit TTL.
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`HaynesPro ${operation} responded ${res.status}`);
  }
  const text = await res.text();
  if (!text) return null; // some ops return an empty body for "no results"
  return JSON.parse(text) as unknown;
}

/**
 * Call a Data Exchange operation on the session's account. Returns the parsed
 * JSON payload, or null when HaynesPro is unconfigured / unreachable / denies
 * the call — callers treat null as "no vehicle-specific data available".
 */
export async function haynesProCall<T>(
  operation: string,
  params: HaynesProParams,
  session: HaynesProSession,
): Promise<T | null> {
  const config = getHaynesProConfig();
  if (!config) return null;

  const username = sessionUsername(config.usernamePrefix, session);
  const key = sessionSettingsKey(session.account, username);

  try {
    const db = await adminDb();
    // Stored before the promise settles, so a caller that finds no in-flight
    // mint finds the new row instead.
    const mint = () =>
      mintOnce(key, async () => {
        const vrid = await mintVrid(config[session.account], session.account, username, db);
        if (vrid) await storeSession(db, key, { vrid, username, day: sessionDay() });
        return vrid;
      });

    let vrid = await readSessionVrid(db, key, username);
    if (!vrid) {
      vrid = await mint();
      if (!vrid) return null;
    }

    let payload = await rawCall(operation, { ...params, vrid });
    if (!isAuthFailure(extractStatusCode(payload))) return payload as T;

    // VRID rejected. Another instance may have re-minted already — re-read
    // before minting so we don't needlessly invalidate their token.
    const latest = await readSessionVrid(db, key, username);
    let retryVrid = latest && latest !== vrid ? latest : null;
    if (!retryVrid) {
      retryVrid = await mint();
      if (!retryVrid) return null;
    }

    payload = await rawCall(operation, { ...params, vrid: retryVrid });
    if (isAuthFailure(extractStatusCode(payload))) {
      console.error(`[haynespro] ${operation} still rejected after re-auth`);
      return null;
    }
    return payload as T;
  } catch (err) {
    console.error(`[haynespro] ${operation} failed:`, err);
    return null;
  }
}
