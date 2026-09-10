// AAG Sales API v2 client (Task 40 — sandbox spike).
//
// Thin POST-JSON fetcher for Alliance Automotive Group's parts API:
//   {AAG_BASE_URL}/api/quote · /api/quote/classic · /api/product/info
// Read-only methods only. Enquiry and the three order methods exist in the
// manual and are deliberately NOT wrapped here — nothing in this task may
// place an order.
//
// Three things about this API that shape the code:
//
//  1. **The HTTP status is inverted.** The manual documents 201 for success
//     and 200 for an error. So `parseAagEnvelope` reads `Header.SuccessFlag`
//     and `Header.ErrorCode` from the body and ignores the status entirely;
//     only a non-2xx (the gateway, a firewall, an allowlist) is treated as
//     "unreachable".
//  2. **Auth is three headers, and the manual never names the first.** An API
//     key ("authorisation type API Key" — header name unstated), `customer_id`
//     (the account number) and an optional `verification_id`. The header name
//     and an optional scheme prefix are therefore configurable
//     (`AAG_AUTH_HEADER`, `AAG_AUTH_SCHEME`) so the sandbox can be probed
//     without a code change. Once AAG confirms, pin the default.
//  3. **The sandbox is the default.** `AAG_BASE_URL` unset means UAT; live
//     must be opted into explicitly per environment.
//
// Everything degrades silently, as lib/haynespro/client.ts does: unconfigured,
// unreachable or refused → null, logged, health recorded for the admin page.
// The booking funnel does not depend on this yet; when it does, it must never
// block on it.
//
// NB: the service-role Supabase client is imported dynamically inside the
// functions (never at module top) so the pure helpers stay importable in unit
// tests without pulling in "server-only" — same pattern as lib/haynespro.

import type { SupabaseClient } from "@supabase/supabase-js";

import { recordAagHealth } from "./health";
import type {
  AagEnvelope,
  AagProductInfoBody,
  AagQuoteBody,
  AagQuoteClassicBody,
} from "./types";

export const AAG_UAT_BASE_URL = "https://aag-sapi-uat1.aaguklabs.co.uk";
export const AAG_LIVE_BASE_URL = "https://sales.allianceautomotiveapis.co.uk";

const REQUEST_TIMEOUT_MS = 12_000;
/** Don't upsert an "ok" health row on every successful call — once per interval is plenty. */
const OK_HEALTH_INTERVAL_MS = 5 * 60 * 1000;

export interface AagConfig {
  apiKey: string;
  customerId: string;
  verificationId: string | null;
  /** No trailing slash. */
  baseUrl: string;
  /** The request header that carries the API key. */
  authHeader: string;
  /** Optional prefix inside that header ("ApiKey", "Bearer"); "" for none. */
  authScheme: string;
}

export function getAagConfig(): AagConfig | null {
  const apiKey = process.env.AAG_API_KEY;
  const customerId = process.env.AAG_CUSTOMER_ID;
  if (!apiKey || !customerId) return null;
  return {
    apiKey,
    customerId,
    verificationId: process.env.AAG_VERIFICATION_ID || null,
    baseUrl: (process.env.AAG_BASE_URL || AAG_UAT_BASE_URL).replace(/\/+$/, ""),
    authHeader: process.env.AAG_AUTH_HEADER || "x-api-key",
    authScheme: process.env.AAG_AUTH_SCHEME || "",
  };
}

export function isAagConfigured(): boolean {
  return getAagConfig() !== null;
}

/** True unless the environment has explicitly pointed at AAG's live host. */
export function isAagSandbox(config: Pick<AagConfig, "baseUrl"> | null = getAagConfig()): boolean {
  return config == null || config.baseUrl !== AAG_LIVE_BASE_URL;
}

// ---------------------------------------------------------------------------
// Pure helpers — unit-tested.
// ---------------------------------------------------------------------------

/** The request headers for a config. `customer_id` / `verification_id` are AAG's exact names. */
export function buildAagHeaders(config: AagConfig): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json",
    customer_id: config.customerId,
    [config.authHeader]: config.authScheme ? `${config.authScheme} ${config.apiKey}` : config.apiKey,
  };
  if (config.verificationId) headers.verification_id = config.verificationId;
  return headers;
}

/**
 * A registration in the form AAG's examples use — uppercase, no spaces or
 * punctuation ("FN60KYP"). The same shape as lib/haynespro/vehicle.ts
 * cacheRegKey; kept local so this module pulls in nothing from HaynesPro.
 */
export function aagRegKey(reg: string): string {
  return reg.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export type ParsedAagEnvelope<T> =
  | { ok: true; body: T; message: string | null }
  | { ok: false; errorCode: string | null; message: string };

/**
 * Read AAG's envelope. `Header.SuccessFlag` decides, never the HTTP status.
 * A reply with no Header block (the classic quote documents its header
 * fields as "not yet available") is taken as success when it has a body.
 */
export function parseAagEnvelope<T>(raw: unknown): ParsedAagEnvelope<T> {
  if (raw == null || typeof raw !== "object") {
    return { ok: false, errorCode: null, message: "AAG returned an empty reply." };
  }
  const env = raw as AagEnvelope<T> & Record<string, unknown>;
  const header = env.Header;
  if (header && typeof header === "object") {
    if (header.SuccessFlag === true) {
      return { ok: true, body: (env.Body ?? ({} as T)) as T, message: header.Message ?? null };
    }
    const errorCode = typeof header.ErrorCode === "string" && header.ErrorCode ? header.ErrorCode : null;
    return {
      ok: false,
      errorCode,
      message: header.Message?.trim() || describeAagError(errorCode),
    };
  }
  // No Header: the payload is either {Body: …} or the body itself.
  const body = (env.Body != null ? env.Body : env) as T;
  return { ok: true, body, message: null };
}

/** Error codes that mean the account, not the request, is the problem. */
export function isAagAuthFailure(errorCode: string | null): boolean {
  return errorCode === "ISE0034" || errorCode === "ISE0101";
}

/**
 * Plain-English reading of an AAG error code (manual v1.07, "Error codes"),
 * written for the admin page — never shown to a customer.
 */
export function describeAagError(code: string | null): string {
  switch (code) {
    case "ISE0034":
      return "AAG doesn't recognise our API key or account number.";
    case "ISE0101":
      return "AAG rejected our verification ID.";
    case "ISE0005":
      return "AAG couldn't identify a vehicle from that registration.";
    case "ISE0006":
    case "ISE0011":
      return "AAG has no parts for that vehicle in this product group.";
    case "ISE0023":
      return "No product group was sent.";
    case "ISE0024":
      return "No registration was sent.";
    case "ISE0002":
      return "AAG couldn't find one or more of those part numbers.";
    case "ISE0035":
      return "AAG's server reported an internal error.";
    case "ISE0047":
      return "AAG couldn't create the quote — try again.";
    case "ISE0053":
      return "AAG couldn't look up product info — try again.";
    case null:
      return "AAG refused the request without an error code.";
    default:
      return `AAG refused the request (${code}).`;
  }
}

// ---------------------------------------------------------------------------
// Fetcher.
// ---------------------------------------------------------------------------

type DbClient = SupabaseClient;

async function adminDb(): Promise<DbClient | null> {
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    return createAdminClient();
  } catch {
    return null;
  }
}

let lastOkHealthAt = 0;

async function noteOk(config: AagConfig): Promise<void> {
  if (Date.now() - lastOkHealthAt < OK_HEALTH_INTERVAL_MS) return;
  lastOkHealthAt = Date.now();
  const db = await adminDb();
  if (db) {
    await recordAagHealth(db, {
      state: "ok",
      errorCode: null,
      detail: "Last call succeeded.",
      baseUrl: config.baseUrl,
    });
  }
}

async function noteFailure(
  config: AagConfig,
  state: "auth_failed" | "unreachable",
  errorCode: string | null,
  detail: string,
): Promise<void> {
  lastOkHealthAt = 0;
  const db = await adminDb();
  if (db) await recordAagHealth(db, { state, errorCode, detail, baseUrl: config.baseUrl });
}

/**
 * POST one AAG method. Returns the parsed Body, or null when AAG is
 * unconfigured / unreachable / refuses the call. Never throws.
 */
export async function aagCall<T>(path: string, body: unknown): Promise<T | null> {
  const config = getAagConfig();
  if (!config) return null;

  let raw: unknown;
  try {
    const res = await fetch(`${config.baseUrl}${path}`, {
      method: "POST",
      headers: buildAagHeaders(config),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      // Prices and stock are live; never let Next cache a reply.
      cache: "no-store",
    });
    const text = await res.text();
    if (res.status < 200 || res.status >= 300) {
      // Outside 2xx is the gateway, not the API: a wrong auth header name, or
      // AAG's IP allowlist, both land here as 401/403.
      console.error(`[aag] ${path} responded HTTP ${res.status}: ${text.slice(0, 200)}`);
      await noteFailure(
        config,
        res.status === 401 || res.status === 403 ? "auth_failed" : "unreachable",
        null,
        res.status === 401 || res.status === 403
          ? `AAG's gateway refused us with HTTP ${res.status} — a wrong API-key header, or our address isn't on their allowlist.`
          : `AAG responded HTTP ${res.status}.`,
      );
      return null;
    }
    raw = text ? (JSON.parse(text) as unknown) : null;
  } catch (err) {
    console.error(`[aag] ${path} failed:`, err);
    await noteFailure(config, "unreachable", null, "We couldn't reach AAG at all (network error or timeout).");
    return null;
  }

  const parsed = parseAagEnvelope<T>(raw);
  if (!parsed.ok) {
    console.error(`[aag] ${path} refused: ${parsed.errorCode ?? "?"} ${parsed.message}`);
    if (isAagAuthFailure(parsed.errorCode)) {
      await noteFailure(config, "auth_failed", parsed.errorCode, describeAagError(parsed.errorCode));
    }
    return null;
  }
  await noteOk(config);
  return parsed.body;
}

// ---------------------------------------------------------------------------
// Typed read-only methods.
// ---------------------------------------------------------------------------

/** Parts in one GenArt product group that fit a registration, with live stock. */
export async function aagQuote(
  reg: string,
  genart: string | number,
  options: { includeVehicleDetails?: boolean } = {},
): Promise<AagQuoteBody | null> {
  const vrm = aagRegKey(reg);
  if (!vrm) return null;
  return aagCall<AagQuoteBody>("/api/quote", {
    CustomerProductGroup: String(genart),
    VRM: vrm,
    IncludeVehicleDetails: options.includeVehicleDetails ?? true,
  });
}

/** The older flat quote: several GenArts at once (slower, per the manual). */
export async function aagQuoteClassic(
  reg: string,
  genarts: ReadonlyArray<string | number>,
  options: { includeVehicleDetails?: boolean } = {},
): Promise<AagQuoteClassicBody | null> {
  const vrm = aagRegKey(reg);
  if (!vrm || genarts.length === 0) return null;
  return aagCall<AagQuoteClassicBody>("/api/quote/classic", {
    ProductGroupCodes: genarts.map(String),
    VRM: vrm,
    IncludeVehicleDetails: options.includeVehicleDetails ?? true,
  });
}

/** Price and details for known AAG part numbers. */
export async function aagProductInfo(productIds: readonly string[]): Promise<AagProductInfoBody | null> {
  const ids = [...new Set(productIds.map((s) => s.trim()).filter(Boolean))];
  if (ids.length === 0) return null;
  return aagCall<AagProductInfoBody>("/api/product/info", {
    Products: ids.map((ProductId) => ({ ProductId })),
  });
}
