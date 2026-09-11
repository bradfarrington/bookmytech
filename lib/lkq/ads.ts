// ADS Vehicle & Parts — REST catalogue client (Task 42).
//
// Same contract as ecp.ts: NEVER THROWS, unconfigured returns null, failures
// record health and return null.
//
// *** METERED. *** Every lookup that reaches ADS spends one of a finite pool of
// credits, so this module:
//   - checks the cache before the network (ads-cache.ts),
//   - claims a credit from a monthly budget before calling,
//   - makes exactly ONE attempt and never retries.
// A retry loop here would be a bill, not a resilience feature.
//
// TWO HOSTS, TWO AUTH STYLES. Verified 2026-09-11: the parts host rejects
// everything with 403 {"Message":"Invalid API Key"} until the key arrives in an
// `ApiKey` HTTP header; the vehicle host ignores headers and reads the key from
// the UserToken body. Both are sent to both, so neither can be got wrong.

import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

import { getLkqAdsConfig } from "./config";
import {
  ADS_PARTS_TTL_MS,
  ADS_VEHICLE_TTL_MS,
  partsCacheKey,
  readAdsCache,
  spendAdsCredit,
  vehicleCacheKey,
  writeAdsCache,
} from "./ads-cache";
import { recordLkqHealth } from "./health";
import type { AdsAttribute, AdsPartsReply, LkqAdsConfig } from "./types";
import { adsRegKey } from "./vehicle";

// Re-exported for convenience. The implementations are PURE and live in
// fitment.ts, because anything importing this file pulls in the service-role
// Supabase client — which fails the build from a client component.
export { fitmentLabels, fitmentOf } from "./fitment";

const REQUEST_TIMEOUT_MS = 20_000;

/**
 * Field names inside the UserToken. Inferred from the vendor's prose (the
 * Postman collection it describes was never supplied) and ACCEPTED FIRST TIME by
 * the live service on 2026-09-11. This is the one place to correct a spelling if
 * ADS ever rejects the token — do not guess in a loop, each attempt is a credit.
 */
export const TOKEN_KEYS = {
  username: "Username",
  password: "Password",
  applicationId: "ApplicationId",
  apiKey: "ApiKey",
  language: "Language",
  loggedInUser: "LoggedInUser",
  sessionGuid: "SessionGuid",
} as const;

async function adminDb(): Promise<SupabaseClient | null> {
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    return createAdminClient();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Pure helpers — unit-tested.
// ---------------------------------------------------------------------------

export function buildUserToken(
  config: LkqAdsConfig,
  sessionGuid: string,
): Record<string, string> {
  const token: Record<string, string> = {
    [TOKEN_KEYS.username]: config.username,
    [TOKEN_KEYS.password]: config.password,
    [TOKEN_KEYS.applicationId]: config.appId,
    [TOKEN_KEYS.language]: config.language,
    [TOKEN_KEYS.loggedInUser]: config.loggedInUser,
    [TOKEN_KEYS.sessionGuid]: sessionGuid,
  };
  if (config.apiKey) token[TOKEN_KEYS.apiKey] = config.apiKey;
  return token;
}

export function buildAdsHeaders(config: LkqAdsConfig): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json",
  };
  if (config.authHeader && config.apiKey) {
    headers[config.authHeader] = config.authScheme
      ? `${config.authScheme} ${config.apiKey}`
      : config.apiKey;
  }
  return headers;
}

export function adsVehicleBody(
  config: LkqAdsConfig,
  name: "VRM" | "VIN",
  value: string,
  sessionGuid: string,
): unknown {
  return {
    Attributes: [{ Name: name, Value: value }],
    UserToken: buildUserToken(config, sessionGuid),
  };
}

export function adsPartsBody(
  config: LkqAdsConfig,
  attributes: readonly AdsAttribute[],
  sessionGuid: string,
  partsSearchGuid: string,
): unknown {
  const body: Record<string, unknown> = {
    UserToken: buildUserToken(config, sessionGuid),
    // Passed VERBATIM — the list is a multimap and must not be collapsed.
    Attributes: attributes,
    PartsSearchGuid: partsSearchGuid,
  };
  if (config.erpAccount) {
    body.ErpConfig = { Account: config.erpAccount, Branch: config.erpBranch };
  }
  return body;
}

/**
 * Locate the `{Name, Value}` attribute list wherever the envelope puts it. The
 * vendor doc never pins the response shape, so this searches rather than
 * assuming a key.
 */
export function findAttributeList(payload: unknown, depth = 0): AdsAttribute[] | null {
  if (!payload || typeof payload !== "object" || depth > 6) return null;

  if (Array.isArray(payload)) {
    if (
      payload.length > 0 &&
      payload.every((e) => e && typeof e === "object" && "Name" in e && "Value" in e)
    ) {
      return payload as AdsAttribute[];
    }
    for (const entry of payload) {
      const hit = findAttributeList(entry, depth + 1);
      if (hit) return hit;
    }
    return null;
  }

  for (const value of Object.values(payload as Record<string, unknown>)) {
    const hit = findAttributeList(value, depth + 1);
    if (hit) return hit;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Network. One attempt, one credit, no retries.
// ---------------------------------------------------------------------------

async function postAds(
  config: LkqAdsConfig,
  url: string,
  body: unknown,
): Promise<unknown | null> {
  const db = await adminDb();

  let res: Response;
  let text: string;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: buildAdsHeaders(config),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });
    text = await res.text();
  } catch (err) {
    console.error("[lkq-ads] request failed:", err);
    if (db) {
      await recordLkqHealth(db, "ads", {
        state: "unreachable",
        errorCode: null,
        detail: "We couldn't reach the LKQ catalogue (network error or timeout).",
        endpoint: url,
      });
    }
    return null;
  }

  if (!res.ok) {
    console.error(`[lkq-ads] HTTP ${res.status}:`, text.slice(0, 300));
    const authish = res.status === 401 || res.status === 403;
    if (db) {
      await recordLkqHealth(db, "ads", {
        state: authish ? "auth_failed" : "unreachable",
        errorCode: String(res.status),
        detail: authish
          ? "The LKQ catalogue rejected our API key — it must be sent in an `ApiKey` header."
          : `The LKQ catalogue responded HTTP ${res.status}.`,
        endpoint: url,
      });
    }
    return null;
  }

  try {
    const json = text ? JSON.parse(text) : null;
    if (db) {
      await recordLkqHealth(db, "ads", {
        state: "ok",
        errorCode: null,
        detail: "Catalogue answered normally.",
        endpoint: url,
      });
    }
    return json;
  } catch {
    console.error("[lkq-ads] non-JSON reply:", text.slice(0, 300));
    if (db) {
      await recordLkqHealth(db, "ads", {
        state: "unreachable",
        errorCode: null,
        detail: "The LKQ catalogue returned a reply we couldn't read.",
        endpoint: url,
      });
    }
    return null;
  }
}

export interface AdsLookup<T> {
  value: T;
  /** True when this came from cache and cost nothing. */
  cached: boolean;
}

/** Refused because the monthly credit budget is spent. */
export const ADS_BUDGET_EXHAUSTED = "budget_exhausted" as const;

export type AdsResult<T> = AdsLookup<T> | null | typeof ADS_BUDGET_EXHAUSTED;

/**
 * Vehicle attributes for a registration. Cached 30 days — a car's engine code
 * does not change. Costs one credit on a miss.
 */
export async function adsLookupVehicle(reg: string): Promise<AdsResult<AdsAttribute[]>> {
  const config = getLkqAdsConfig();
  if (!config) return null;

  const regKey = adsRegKey(reg);
  if (!regKey) return null;

  const db = await adminDb();
  if (!db) return null;

  const cached = await readAdsCache<AdsAttribute[]>(
    db,
    vehicleCacheKey(regKey),
    ADS_VEHICLE_TTL_MS,
  );
  if (cached) return { value: cached, cached: true };

  const budget = await spendAdsCredit(db);
  if (!budget.allowed) {
    await recordLkqHealth(db, "ads", {
      state: "budget_exhausted",
      errorCode: null,
      detail: `The monthly catalogue-call budget (${budget.cap}) is spent. It resets next month, or raise LKQ_ADS_MONTHLY_CALL_CAP.`,
      endpoint: config.vehicleUrl,
    });
    return ADS_BUDGET_EXHAUSTED;
  }

  const payload = await postAds(
    config,
    config.vehicleUrl,
    adsVehicleBody(config, "VRM", regKey, randomUUID()),
  );
  if (!payload) return null;

  const attributes = findAttributeList(payload);
  if (!attributes || attributes.length === 0) return null;

  await writeAdsCache(db, vehicleCacheKey(regKey), attributes);
  return { value: attributes, cached: false };
}

/**
 * Parts fitting a vehicle for one component. Cached 7 days. Costs one credit on
 * a miss. `attributes` must be the list adsLookupVehicle returned, unaltered.
 */
export async function adsLookupParts(
  reg: string,
  component: string,
  attributes: readonly AdsAttribute[],
  increment = 1,
): Promise<AdsResult<AdsPartsReply>> {
  const config = getLkqAdsConfig();
  if (!config) return null;

  const regKey = adsRegKey(reg);
  const componentKey = String(component ?? "").trim();
  if (!regKey || !componentKey) return null;

  const db = await adminDb();
  if (!db) return null;

  const key = partsCacheKey(regKey, componentKey, increment);
  const cached = await readAdsCache<AdsPartsReply>(db, key, ADS_PARTS_TTL_MS);
  if (cached) return { value: cached, cached: true };

  const budget = await spendAdsCredit(db);
  if (!budget.allowed) {
    await recordLkqHealth(db, "ads", {
      state: "budget_exhausted",
      errorCode: null,
      detail: `The monthly catalogue-call budget (${budget.cap}) is spent. It resets next month, or raise LKQ_ADS_MONTHLY_CALL_CAP.`,
      endpoint: config.partsUrl,
    });
    return ADS_BUDGET_EXHAUSTED;
  }

  const url = `${config.partsUrl}/${encodeURIComponent(componentKey)}/${increment}`;
  const payload = (await postAds(
    config,
    url,
    adsPartsBody(config, attributes, randomUUID(), randomUUID()),
  )) as AdsPartsReply | null;

  if (!payload) return null;

  await writeAdsCache(db, key, payload);
  return { value: payload, cached: false };
}
