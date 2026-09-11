// LKQECP API Plus — SOAP pricing and stock client (Task 42).
//
// Contract, matching lib/aag/client.ts: this NEVER THROWS. Unconfigured returns
// null silently; anything else logs, records health, and returns null. The
// admin page degrades to a banner, never to an error boundary.
//
// THE RULE THIS FILE EXISTS TO ENFORCE: an unknown part number is not an error
// to LKQ — it answers Status 0 with a blank row and ShowPrice "0.00", and the
// documented code 107 never appears. getLkqPrices() separates those into
// `notFound` HERE, so a £0.00 phantom physically cannot reach a caller. Leaving
// that to callers would make it a convention; doing it here makes it a fact.
//
// The service-role Supabase client is imported dynamically inside the functions
// (never at module top) so price.ts and xml.ts stay importable by vitest without
// pulling in "server-only" — same pattern as lib/aag/client.ts and lib/pricing.

import type { SupabaseClient } from "@supabase/supabase-js";

import { getLkqEcpConfig } from "./config";
import { recordLkqHealth } from "./health";
import { splitParts } from "./price";
import {
  isSessionUsable,
  readStoredSession,
  sessionFingerprint,
  storeSession,
  type StoredLkqSession,
} from "./session";
import {
  LKQ_AUTH_ERROR_CODES,
  LKQ_ERROR_CODES,
  LKQ_SESSION_ERROR_CODES,
  type LkqEcpConfig,
  type LkqPartRef,
  type LkqPriceResult,
} from "./types";
import {
  buildSoapEnvelope,
  extractSoapFault,
  extractSoapResult,
  parseXml,
  soapActionFor,
  textAt,
  xmlEscape,
  type XmlNode,
} from "./xml";

const REQUEST_TIMEOUT_MS = 15_000;
const OK_HEALTH_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Parts per GetPrice call. Each 8-digit catalogue number expands to ~8 variants,
 * so 20 refs is already ~160 rows; chunking keeps the hand-rolled parser away
 * from documents far larger than anything observed.
 */
const MAX_PARTS_PER_CALL = 20;

let lastOkHealthAt = 0;

async function adminDb(): Promise<SupabaseClient | null> {
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    return createAdminClient();
  } catch {
    return null;
  }
}

async function noteOk(config: LkqEcpConfig): Promise<void> {
  const now = Date.now();
  if (now - lastOkHealthAt < OK_HEALTH_INTERVAL_MS) return;
  lastOkHealthAt = now;
  const db = await adminDb();
  if (!db) return;
  await recordLkqHealth(db, "ecp", {
    state: "ok",
    errorCode: null,
    detail: "Pricing answered normally.",
    endpoint: config.priceUrl,
  });
}

async function noteFailure(
  config: LkqEcpConfig,
  state: "auth_failed" | "unreachable",
  errorCode: string | null,
  detail: string,
): Promise<void> {
  lastOkHealthAt = 0;
  const db = await adminDb();
  if (!db) return;
  await recordLkqHealth(db, "ecp", { state, errorCode, detail, endpoint: config.priceUrl });
}

// ---------------------------------------------------------------------------
// Pure helpers — unit-tested.
// ---------------------------------------------------------------------------

export function sessionQueryXml(config: LkqEcpConfig): string {
  return (
    "<QUERY>" +
    `<SysId>${xmlEscape(config.sysId)}</SysId>` +
    `<Pwd>${xmlEscape(config.password)}</Pwd>` +
    `<PCId>${xmlEscape(config.pcId)}</PCId>` +
    `<Account>${xmlEscape(config.account)}</Account>` +
    "</QUERY>"
  );
}

export function priceQueryXml(
  config: LkqEcpConfig,
  token: string,
  parts: readonly LkqPartRef[],
): string {
  const lines = parts
    .map((p) => {
      const type = "type" in p && p.type ? xmlEscape(p.type) : "";
      const code = "code" in p && p.code ? xmlEscape(p.code) : "";
      const supplierPartNo =
        "supplierPartNo" in p && p.supplierPartNo ? xmlEscape(p.supplierPartNo) : "";
      return (
        "<Part>" +
        `<Type>${type}</Type>` +
        `<Code>${code}</Code>` +
        `<SupplierPartNo>${supplierPartNo}</SupplierPartNo>` +
        // Documented as "currently not used"; always 1.
        "<Quantity>1</Quantity>" +
        "</Part>"
      );
    })
    .join("");

  return (
    "<QUERY>" +
    `<SysId>${xmlEscape(config.sysId)}</SysId>` +
    `<Pwd>${xmlEscape(config.password)}</Pwd>` +
    `<PCId>${xmlEscape(config.pcId)}</PCId>` +
    `<Token>${xmlEscape(token)}</Token>` +
    `<Customer><Account>${xmlEscape(config.account)}</Account></Customer>` +
    `<Branch><Code>${xmlEscape(config.branch)}</Code></Branch>` +
    `<Parts>${lines}</Parts>` +
    "</QUERY>"
  );
}

/**
 * Read the reply status. The docs put Status at the top of <REPLY>; the service
 * nests it under <Modes>. Both are read, nested first.
 */
export function readReplyStatus(reply: XmlNode): { code: number; label: string } {
  const raw = textAt(reply, "Modes.Status") || textAt(reply, "Status");
  const code = Number(raw);
  if (!Number.isFinite(code)) {
    return { code: -1, label: raw ? `Unrecognised status "${raw}"` : "No status returned" };
  }
  return { code, label: LKQ_ERROR_CODES[code] ?? `Unknown error code ${code}` };
}

/** Does this status mean our credentials/account are wrong, rather than LKQ being down? */
export function isAuthErrorCode(code: number): boolean {
  return LKQ_AUTH_ERROR_CODES.includes(code);
}

/** Does this status mean the token went stale and one re-mint is worth trying? */
export function isSessionErrorCode(code: number): boolean {
  return LKQ_SESSION_ERROR_CODES.includes(code);
}

/** Split a list of part refs into call-sized chunks. */
export function chunkParts(
  parts: readonly LkqPartRef[],
  size: number = MAX_PARTS_PER_CALL,
): LkqPartRef[][] {
  const chunks: LkqPartRef[][] = [];
  for (let i = 0; i < parts.length; i += size) chunks.push(parts.slice(i, i + size));
  return chunks;
}

// ---------------------------------------------------------------------------
// Network.
// ---------------------------------------------------------------------------

/**
 * POST one SOAP operation. Returns the PARSED inner <REPLY>, or null.
 * Never throws.
 */
async function callEcp(
  config: LkqEcpConfig,
  operation: string,
  queryXml: string | null,
): Promise<XmlNode | null> {
  let res: Response;
  let text: string;

  try {
    res = await fetch(config.priceUrl, {
      method: "POST",
      headers: {
        "content-type": "text/xml; charset=utf-8",
        soapaction: soapActionFor(operation),
      },
      body: buildSoapEnvelope(operation, queryXml),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      // Prices and stock are live; never let Next cache a reply.
      cache: "no-store",
    });
    text = await res.text();
  } catch (err) {
    console.error(`[lkq] ${operation} failed to reach LKQ:`, err);
    await noteFailure(
      config,
      "unreachable",
      null,
      "We couldn't reach LKQ at all (network error or timeout).",
    );
    return null;
  }

  if (!res.ok) {
    const fault = extractSoapFault(text);
    console.error(`[lkq] ${operation} HTTP ${res.status}:`, (fault ?? text).slice(0, 300));
    await noteFailure(
      config,
      res.status === 401 || res.status === 403 ? "auth_failed" : "unreachable",
      String(res.status),
      res.status === 401 || res.status === 403
        ? "LKQ refused the request before it reached their API — check the credentials and the IP allowlist."
        : `LKQ's pricing service responded HTTP ${res.status}.`,
    );
    return null;
  }

  const inner = extractSoapResult(operation, text);
  if (inner === null) {
    console.error(`[lkq] ${operation} returned no ${operation}Result:`, text.slice(0, 300));
    await noteFailure(config, "unreachable", null, "LKQ returned a reply we couldn't read.");
    return null;
  }

  const parsed = parseXml(inner) as { REPLY?: XmlNode };
  return parsed?.REPLY ?? (parsed as XmlNode);
}

/**
 * HelloFromLkq — an unauthenticated ping the supplied docs never mention. It
 * returns the service version and server time, and is the cleanest way to tell
 * "LKQ is down" apart from "our credentials are wrong". Task 40 lost a day to
 * exactly that ambiguity on AAG.
 */
export async function helloFromLkq(): Promise<string | null> {
  const config = getLkqEcpConfig();
  const priceUrl =
    config?.priceUrl ??
    (process.env.LKQ_ECP_PRICE_URL || "https://apiplus1test.lkqbodyshop.com/ApiPlusPriceSvc.svc").replace(
      /\/+$/,
      "",
    );

  try {
    const res = await fetch(priceUrl, {
      method: "POST",
      headers: {
        "content-type": "text/xml; charset=utf-8",
        soapaction: soapActionFor("HelloFromLkq"),
      },
      body: buildSoapEnvelope("HelloFromLkq", null),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const text = await res.text();
    const match = /<HelloFromLkqResult[^>]*>([\s\S]*?)<\/HelloFromLkqResult>/.exec(text);
    return match ? match[1].trim() : null;
  } catch {
    return null;
  }
}

/** Mint a fresh session token. Null on any failure, health already recorded. */
async function mintSession(
  config: LkqEcpConfig,
  db: SupabaseClient,
): Promise<StoredLkqSession | null> {
  const reply = await callEcp(config, "PutSession", sessionQueryXml(config));
  if (!reply) return null;

  const status = textAt(reply, "Status");
  const token = textAt(reply, "Token");

  if (status.toUpperCase() !== "SUCCESS" || !token) {
    console.error("[lkq] PutSession refused:", status || "(no status)");
    await noteFailure(
      config,
      "auth_failed",
      status || null,
      status.toUpperCase() === "INVALID CREDENTIALS"
        ? "LKQ rejected the pricing credentials — check LKQ_ECP_PCID, LKQ_ECP_PASSWORD and LKQ_ECP_ACCOUNT."
        : "LKQ wouldn't open a pricing session.",
    );
    return null;
  }

  const session: StoredLkqSession = {
    token,
    branch: textAt(reply, "Branch"),
    mintedAt: new Date().toISOString(),
    fingerprint: sessionFingerprint(config),
  };
  await storeSession(db, session);
  return session;
}

/** A usable token: the shared one when fresh, otherwise a newly minted one. */
async function getToken(
  config: LkqEcpConfig,
  db: SupabaseClient,
  forceMint = false,
): Promise<string | null> {
  const fingerprint = sessionFingerprint(config);

  if (!forceMint) {
    const stored = await readStoredSession(db);
    if (isSessionUsable(stored, fingerprint)) return (stored as StoredLkqSession).token;
  }

  const minted = await mintSession(config, db);
  return minted?.token ?? null;
}

/**
 * Price one chunk. Returns the parsed reply, or null. Retries ONCE with a fresh
 * token when LKQ says the session is gone — re-reading the stored row first, in
 * case another instance has already replaced it.
 */
async function priceChunk(
  config: LkqEcpConfig,
  db: SupabaseClient,
  parts: readonly LkqPartRef[],
  token: string,
): Promise<{ reply: XmlNode; token: string } | null> {
  let currentToken = token;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const reply = await callEcp(config, "GetPrice", priceQueryXml(config, currentToken, parts));
    if (!reply) return null;

    const { code, label } = readReplyStatus(reply);
    if (code === 0) {
      await noteOk(config);
      return { reply, token: currentToken };
    }

    if (isSessionErrorCode(code) && attempt === 0) {
      // Another instance may already have refreshed it — prefer theirs over minting.
      const stored = await readStoredSession(db);
      const fingerprint = sessionFingerprint(config);
      if (isSessionUsable(stored, fingerprint) && stored!.token !== currentToken) {
        currentToken = stored!.token;
      } else {
        const minted = await mintSession(config, db);
        if (!minted) return null;
        currentToken = minted.token;
      }
      continue;
    }

    console.error(`[lkq] GetPrice error ${code}: ${label}`);
    await noteFailure(
      config,
      isAuthErrorCode(code) ? "auth_failed" : "unreachable",
      String(code),
      isAuthErrorCode(code)
        ? `LKQ refused the pricing request: ${label}.`
        : `LKQ's pricing service returned an error: ${label}.`,
    );
    return null;
  }

  return null;
}

/**
 * Price a set of parts. Returns null when LKQ could not be asked at all;
 * otherwise a result whose `rows` are REAL parts and whose `notFound` lists the
 * numbers LKQ answered £0.00 for.
 */
export async function getLkqPrices(
  parts: readonly LkqPartRef[],
): Promise<LkqPriceResult | null> {
  const config = getLkqEcpConfig();
  if (!config) return null;
  if (parts.length === 0) {
    return { rows: [], notFound: [], account: null, branch: null };
  }

  const db = await adminDb();
  if (!db) return null;

  let token = await getToken(config, db);
  if (!token) return null;

  const result: LkqPriceResult = { rows: [], notFound: [], account: null, branch: null };

  for (const chunk of chunkParts(parts)) {
    const priced = await priceChunk(config, db, chunk, token);
    if (!priced) return null;
    token = priced.token;

    const { rows, notFound } = splitParts(priced.reply);
    result.rows.push(...rows);
    result.notFound.push(...notFound);

    if (!result.account) {
      const number = textAt(priced.reply, "Customer.Account");
      if (number) {
        result.account = {
          number,
          name: textAt(priced.reply, "Customer.Name"),
          currency: textAt(priced.reply, "Customer.Currency"),
        };
      }
    }
    if (!result.branch) result.branch = textAt(priced.reply, "Modes.Branch") || null;
  }

  return result;
}
