// ADS (LKQ) Vehicle & Parts REST helper for verification scripts (Task 41).
//
// Two endpoints, per "LKQ Vehicle and Parts API.docx":
//   vehicle: POST {LKQ_ADS_VEHICLE_URL}            VRM or VIN -> vehicle attributes
//   parts:   POST {LKQ_ADS_PARTS_URL}/{group}/{inc} attributes -> applicable parts
//
// *** METERED. *** The test account was issued with a fixed credit allowance
// (500 on the signed-off request). Every call spends one. Probes here make
// exactly ONE call per run and print the payload they sent.
//
// *** FIELD NAMES ARE INFERRED. *** The docx is commentary on a Postman
// collection that was not supplied with it, so it names the UserToken's parts
// (Username, Password, ApplicationId, Language, LoggedInUser, session GUID)
// without giving the JSON. The shapes below are a best reading of the prose.
// Every probe prints its request body so a rejection can be diffed against
// whatever the service actually wants, and TOKEN_KEYS is the one place to
// correct the spelling. Do not spend credits looping over guesses.
//
// The docx also never says where the separate API Key goes. LKQ_ADS_AUTH_HEADER
// / LKQ_ADS_AUTH_SCHEME let a run try a header variant without a code edit;
// left blank, the key is sent only inside the UserToken.

import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const REQUEST_TIMEOUT_MS = 30_000;

/** Correct these first if the service rejects the token — see the note above. */
export const TOKEN_KEYS = {
  username: "Username",
  password: "Password",
  applicationId: "ApplicationId",
  apiKey: "ApiKey",
  language: "Language",
  loggedInUser: "LoggedInUser",
  sessionGuid: "SessionGuid",
};

export function requireEnv() {
  const username = process.env.LKQ_ADS_USERNAME;
  const password = process.env.LKQ_ADS_PASSWORD;
  const appId = process.env.LKQ_ADS_APP_ID;
  if (!username || !password || !appId) {
    console.error(
      "Need LKQ_ADS_USERNAME, LKQ_ADS_PASSWORD and LKQ_ADS_APP_ID in .env.local (LKQ_ADS_API_KEY too if issued).",
    );
    process.exit(2);
  }
  return {
    username,
    password,
    appId,
    apiKey: process.env.LKQ_ADS_API_KEY || "",
    language: process.env.LKQ_ADS_LANGUAGE || "en-GB",
    loggedInUser: process.env.LKQ_ADS_LOGGED_IN_USER || username,
    vehicleUrl: (process.env.LKQ_ADS_VEHICLE_URL || "https://live.vdslookup.co.uk/vehiclesearch.v4.0/api/v5/GB/details").replace(/\/+$/, ""),
    partsUrl: (process.env.LKQ_ADS_PARTS_URL || "https://partsearch.adsapplications.co.uk/APIv1.0/api/v2/GB/search").replace(/\/+$/, ""),
    // Verified 2026-09-11: the parts host rejects everything with 403
    // {"Message":"Invalid API Key"} until the key arrives in an "ApiKey"
    // header. The vehicle host ignores the header and reads the key from the
    // UserToken body instead, so both are sent on both.
    authHeader: process.env.LKQ_ADS_AUTH_HEADER || "ApiKey",
    authScheme: process.env.LKQ_ADS_AUTH_SCHEME || "",
    erpAccount: process.env.LKQ_ADS_ERP_ACCOUNT || process.env.LKQ_ECP_ACCOUNT || "",
    erpBranch: process.env.LKQ_ADS_ERP_BRANCH || process.env.LKQ_ECP_BRANCH || "",
  };
}

export function buildUserToken(env, sessionGuid) {
  const k = TOKEN_KEYS;
  const token = {
    [k.username]: env.username,
    [k.password]: env.password,
    [k.applicationId]: env.appId,
    [k.language]: env.language,
    [k.loggedInUser]: env.loggedInUser,
    [k.sessionGuid]: sessionGuid,
  };
  if (env.apiKey) token[k.apiKey] = env.apiKey;
  return token;
}

export function buildHeaders(env) {
  const headers = { "content-type": "application/json", accept: "application/json" };
  if (env.authHeader && env.apiKey) {
    headers[env.authHeader] = env.authScheme ? `${env.authScheme} ${env.apiKey}` : env.apiKey;
  }
  return headers;
}

/** Uppercase, no punctuation — matches lib/haynespro/vehicle.ts cacheRegKey. */
export function regKey(reg) {
  return (reg ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Redact secrets before a payload is printed to a terminal or pasted into a doc. */
export function redact(payload) {
  const clone = structuredClone(payload);
  const walk = (node) => {
    if (!node || typeof node !== "object") return;
    for (const key of Object.keys(node)) {
      if (/password|apikey|api_key/i.test(key) && typeof node[key] === "string") {
        node[key] = "<redacted>";
      } else walk(node[key]);
    }
  };
  walk(clone);
  return clone;
}

/** One POST. Spends one credit. Throws loudly; never retries. */
export async function post(env, url, body, { dump = false } = {}) {
  if (dump) {
    console.log(`POST ${url}`);
    console.log(JSON.stringify(redact(body), null, 2));
    console.log("");
  }
  const res = await fetch(url, {
    method: "POST",
    headers: buildHeaders(env),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`ADS ${url} responded ${res.status} with a non-JSON body:\n${text.slice(0, 800)}`);
  }
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`ADS ${url} responded HTTP ${res.status}:\n${JSON.stringify(json, null, 2).slice(0, 800)}`);
  }
  return { status: res.status, json };
}

export function vehicleBody(env, name, value, sessionGuid) {
  return {
    Attributes: [{ Name: name, Value: value }],
    UserToken: buildUserToken(env, sessionGuid),
  };
}

export function partsBody(env, attributes, sessionGuid, partsSearchGuid, components) {
  const body = {
    UserToken: buildUserToken(env, sessionGuid),
    Attributes: attributes,
    PartsSearchGuid: partsSearchGuid,
  };
  if (components?.length) body.Components = components;
  if (env.erpAccount) body.ErpConfig = { Account: env.erpAccount, Branch: env.erpBranch };
  return body;
}

export function col(value, width) {
  const s = value == null ? "" : String(value);
  return s.length > width ? `${s.slice(0, width - 1)}…` : s.padEnd(width);
}
