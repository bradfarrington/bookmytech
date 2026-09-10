// AAG Sales API v2 REST helper for one-off verification scripts (Task 40).
//
// Mirrors lib/aag/client.ts — same base URL, same headers, same "read the
// body, not the HTTP status" rule (AAG answers 201 for success and 200 for an
// error; see Data Contract Customer.pdf). It exists because the app client
// cannot be imported from plain Node: it relies on the "@/" alias and there is
// no tsx/ts-node in devDependencies. Same reasoning as haynespro-rest.mjs.
//
// Unlike the app client this THROWS on any failure — a script should stop
// loudly, not fall through the way the funnel does.
//
// Only used by scripts/probe-aag-*.mjs. Nothing in the app imports this.

import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

export const UAT_BASE_URL = "https://aag-sapi-uat1.aaguklabs.co.uk";
export const LIVE_BASE_URL = "https://sales.allianceautomotiveapis.co.uk";
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Read the AAG env. The manual never names the API-key header, so the header
 * and an optional scheme prefix are configurable — the first probe run tries
 * variants without a code edit:
 *
 *   AAG_AUTH_HEADER=x-api-key                  (default)
 *   AAG_AUTH_HEADER=Authorization AAG_AUTH_SCHEME=ApiKey
 *   AAG_AUTH_HEADER=Authorization AAG_AUTH_SCHEME=Bearer
 */
export function requireEnv() {
  const apiKey = process.env.AAG_API_KEY;
  const customerId = process.env.AAG_CUSTOMER_ID;
  if (!apiKey || !customerId) {
    console.error("Need AAG_API_KEY and AAG_CUSTOMER_ID in .env.local (AAG_VERIFICATION_ID if AAG issued one).");
    process.exit(2);
  }
  return {
    apiKey,
    customerId,
    verificationId: process.env.AAG_VERIFICATION_ID || null,
    baseUrl: (process.env.AAG_BASE_URL || UAT_BASE_URL).replace(/\/+$/, ""),
    authHeader: process.env.AAG_AUTH_HEADER || "x-api-key",
    authScheme: process.env.AAG_AUTH_SCHEME || "",
  };
}

/** Same header assembly as lib/aag/client.ts buildHeaders. */
export function buildHeaders(env) {
  const headers = {
    "content-type": "application/json",
    accept: "application/json",
    customer_id: env.customerId,
    [env.authHeader]: env.authScheme ? `${env.authScheme} ${env.apiKey}` : env.apiKey,
  };
  if (env.verificationId) headers.verification_id = env.verificationId;
  return headers;
}

/** Uppercase, no spaces — the shape lib/haynespro/vehicle.ts cacheRegKey uses. */
export function regKey(reg) {
  return (reg ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * A REST client for the sandbox (or live, when AAG_BASE_URL says so).
 * `post(path, body)` returns `{ status, header, body, raw }` where `header` is
 * AAG's own envelope ({SuccessFlag, Message, ErrorCode}) and `body` is the
 * payload under it. Throws when the envelope says the call failed.
 */
export function createAagRest() {
  const env = requireEnv();
  const headers = buildHeaders(env);

  async function post(path, body) {
    const url = `${env.baseUrl}${path}`;
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const text = await res.text();
    let raw = null;
    try {
      raw = text ? JSON.parse(text) : null;
    } catch {
      throw new Error(`AAG ${path} responded ${res.status} with a non-JSON body: ${text.slice(0, 300)}`);
    }
    // Anything outside 2xx is the gateway/firewall, not the API: a 401/403
    // here is the IP-allowlist or a wrong auth header, a 5xx is them.
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`AAG ${path} responded HTTP ${res.status}: ${text.slice(0, 300)}`);
    }
    const header = raw?.Header ?? null;
    const ok = header ? header.SuccessFlag === true : raw != null;
    if (!ok) {
      throw new Error(
        `AAG ${path} refused (HTTP ${res.status}) ${header?.ErrorCode ?? "?"}: ${header?.Message ?? JSON.stringify(raw).slice(0, 300)}`,
      );
    }
    return { status: res.status, header, body: raw?.Body ?? raw, raw };
  }

  return {
    env,
    post,
    quote: (vrm, genart, includeVehicleDetails = true) =>
      post("/api/quote", {
        CustomerProductGroup: String(genart),
        VRM: regKey(vrm),
        IncludeVehicleDetails: includeVehicleDetails,
      }),
    quoteClassic: (vrm, genarts, includeVehicleDetails = true) =>
      post("/api/quote/classic", {
        ProductGroupCodes: genarts.map(String),
        VRM: regKey(vrm),
        IncludeVehicleDetails: includeVehicleDetails,
      }),
    productInfo: (productIds) =>
      post("/api/product/info", { Products: productIds.map((id) => ({ ProductId: id })) }),
  };
}

/** Pad/truncate for the quick tables the probes print. */
export function col(value, width) {
  const s = value == null ? "" : String(value);
  return s.length > width ? `${s.slice(0, width - 1)}…` : s.padEnd(width);
}
