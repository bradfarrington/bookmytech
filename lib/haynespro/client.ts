// HaynesPro Data Exchange client (Task 16).
//
// Thin fetcher for the REST JSON endpoint:
//   https://www.haynespro-services.com/workshopServices3/rest/jsonendpoint/{operation}?vrid=…&…
//
// Auth model: getAuthenticationVrid(distributorUsername, distributorPassword,
// username) mints a VRID session token, valid 8h since last use. Minting a new
// VRID for the SAME username invalidates all previous ones for that username —
// so a per-instance module cache would make serverless instances invalidate
// each other in a loop. Instead the current VRID is persisted in
// platform_settings (key 'haynespro_vrid') via the service-role client so every
// instance shares one token. On a statusCode-5 reply (bad/expired vrid) we
// re-read the stored token first (another instance may have already refreshed
// it), only minting a fresh one if ours was the stored one, then retry once.
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

const REST_BASE =
  "https://www.haynespro-services.com/workshopServices3/rest/jsonendpoint";

const VRID_SETTINGS_KEY = "haynespro_vrid";
const REQUEST_TIMEOUT_MS = 12_000;

export interface HaynesProConfig {
  distributorUsername: string;
  distributorPassword: string;
  username: string;
}

export function getHaynesProConfig(): HaynesProConfig | null {
  const distributorUsername = process.env.HAYNESPRO_DISTRIBUTOR_USERNAME;
  const distributorPassword = process.env.HAYNESPRO_DISTRIBUTOR_PASSWORD;
  if (!distributorUsername || !distributorPassword) return null;
  return {
    distributorUsername,
    distributorPassword,
    // Any value ≤32 chars works on the demo account; production usernames may
    // be contractually restricted, hence configurable.
    username: process.env.HAYNESPRO_USERNAME || "bookmytech",
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
// Status detection — pure, unit-testable.
// ---------------------------------------------------------------------------

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
// VRID persistence (platform_settings, service-role).
// ---------------------------------------------------------------------------

type DbClient = SupabaseClient;

async function adminDb(): Promise<DbClient> {
  const { createAdminClient } = await import("@/lib/supabase/admin");
  return createAdminClient();
}

async function readStoredVrid(db: DbClient): Promise<string | null> {
  try {
    const { data } = await db
      .from("platform_settings")
      .select("value")
      .eq("key", VRID_SETTINGS_KEY)
      .maybeSingle();
    const raw = data?.value;
    return typeof raw === "string" && raw.length > 0 ? raw : null;
  } catch {
    return null;
  }
}

async function storeVrid(db: DbClient, vrid: string): Promise<void> {
  try {
    await db
      .from("platform_settings")
      .upsert({ key: VRID_SETTINGS_KEY, value: vrid, updated_at: new Date().toISOString() });
  } catch {
    // Non-fatal — worst case the next instance re-authenticates too.
  }
}

async function mintVrid(config: HaynesProConfig): Promise<string | null> {
  try {
    const url = buildUrl("getAuthenticationVrid", {
      distributorUsername: config.distributorUsername,
      distributorPassword: config.distributorPassword,
      username: config.username,
    });
    const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!res.ok) return null;
    const body = (await res.json()) as { vrid?: string; statusCode?: number };
    if (body.statusCode === 0 && body.vrid) return body.vrid;
    console.error("[haynespro] auth failed, statusCode:", body.statusCode);
    return null;
  } catch (err) {
    console.error("[haynespro] auth request failed:", err);
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
 * Call a Data Exchange operation with shared-VRID handling. Returns the parsed
 * JSON payload, or null when HaynesPro is unconfigured / unreachable / denies
 * the call — callers treat null as "no vehicle-specific data available".
 */
export async function haynesProCall<T>(
  operation: string,
  params: HaynesProParams,
): Promise<T | null> {
  const config = getHaynesProConfig();
  if (!config) return null;

  try {
    const db = await adminDb();

    let vrid = await readStoredVrid(db);
    if (!vrid) {
      vrid = await mintVrid(config);
      if (!vrid) return null;
      await storeVrid(db, vrid);
    }

    let payload = await rawCall(operation, { ...params, vrid });
    if (!isAuthFailure(extractStatusCode(payload))) return payload as T;

    // VRID rejected. Another instance may have refreshed it already — re-read
    // before minting so we don't needlessly invalidate their token.
    const latest = await readStoredVrid(db);
    let retryVrid = latest && latest !== vrid ? latest : null;
    if (!retryVrid) {
      retryVrid = await mintVrid(config);
      if (!retryVrid) return null;
      await storeVrid(db, retryVrid);
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
