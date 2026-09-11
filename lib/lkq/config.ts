// Environment wiring for the two LKQ APIs (Task 42).
//
// They are separate products with separate credentials and separate failure
// modes, so they get INDEPENDENT gates: pricing can work while the catalogue is
// unconfigured, and the status banner has to be able to say which is missing.
//
// Missing env = the feature is simply off. Nothing here throws.

import type { LkqAdsConfig, LkqEcpConfig } from "./types";

const DEFAULT_PRICE_URL = "https://apiplus1test.lkqbodyshop.com/ApiPlusPriceSvc.svc";
const DEFAULT_VEHICLE_URL = "https://live.vdslookup.co.uk/vehiclesearch.v4.0/api/v5/GB/details";
const DEFAULT_PARTS_URL = "https://partsearch.adsapplications.co.uk/APIv1.0/api/v2/GB/search";

const trimSlashes = (url: string) => url.replace(/\/+$/, "");

/** Null unless the three secrets are present. SysId defaults to the documented ADSSYS. */
export function getLkqEcpConfig(): LkqEcpConfig | null {
  const pcId = process.env.LKQ_ECP_PCID;
  const password = process.env.LKQ_ECP_PASSWORD;
  const account = process.env.LKQ_ECP_ACCOUNT;
  if (!pcId || !password || !account) return null;

  return {
    sysId: process.env.LKQ_ECP_SYSID || "ADSSYS",
    pcId,
    password,
    account,
    branch: process.env.LKQ_ECP_BRANCH || "",
    priceUrl: trimSlashes(process.env.LKQ_ECP_PRICE_URL || DEFAULT_PRICE_URL),
  };
}

export function isLkqEcpConfigured(): boolean {
  return getLkqEcpConfig() !== null;
}

/** Null unless username, password and app id are present. */
export function getLkqAdsConfig(): LkqAdsConfig | null {
  const username = process.env.LKQ_ADS_USERNAME;
  const password = process.env.LKQ_ADS_PASSWORD;
  const appId = process.env.LKQ_ADS_APP_ID;
  if (!username || !password || !appId) return null;

  return {
    username,
    password,
    appId,
    apiKey: process.env.LKQ_ADS_API_KEY || "",
    language: process.env.LKQ_ADS_LANGUAGE || "en-GB",
    loggedInUser: process.env.LKQ_ADS_LOGGED_IN_USER || username,
    vehicleUrl: trimSlashes(process.env.LKQ_ADS_VEHICLE_URL || DEFAULT_VEHICLE_URL),
    partsUrl: trimSlashes(process.env.LKQ_ADS_PARTS_URL || DEFAULT_PARTS_URL),
    // Verified 2026-09-11: the parts host answers 403 {"Message":"Invalid API Key"}
    // until the key arrives in an "ApiKey" header. Not Authorization, not
    // Ocp-Apim-Subscription-Key, not a query parameter.
    authHeader: process.env.LKQ_ADS_AUTH_HEADER || "ApiKey",
    authScheme: process.env.LKQ_ADS_AUTH_SCHEME || "",
    erpAccount: process.env.LKQ_ADS_ERP_ACCOUNT || process.env.LKQ_ECP_ACCOUNT || "",
    erpBranch: process.env.LKQ_ADS_ERP_BRANCH || process.env.LKQ_ECP_BRANCH || "",
  };
}

export function isLkqAdsConfigured(): boolean {
  return getLkqAdsConfig() !== null;
}

/** Names of the env vars each half needs, for the "not configured" banner. */
export function missingLkqEnv(): { ecp: string[]; ads: string[] } {
  const ecp: string[] = [];
  if (!process.env.LKQ_ECP_PCID) ecp.push("LKQ_ECP_PCID");
  if (!process.env.LKQ_ECP_PASSWORD) ecp.push("LKQ_ECP_PASSWORD");
  if (!process.env.LKQ_ECP_ACCOUNT) ecp.push("LKQ_ECP_ACCOUNT");

  const ads: string[] = [];
  if (!process.env.LKQ_ADS_USERNAME) ads.push("LKQ_ADS_USERNAME");
  if (!process.env.LKQ_ADS_PASSWORD) ads.push("LKQ_ADS_PASSWORD");
  if (!process.env.LKQ_ADS_APP_ID) ads.push("LKQ_ADS_APP_ID");
  if (!process.env.LKQ_ADS_API_KEY) ads.push("LKQ_ADS_API_KEY");

  return { ecp, ads };
}

/**
 * Monthly ceiling on metered ADS calls. The test account was issued 500 credits;
 * the default leaves headroom so an afternoon of clicking cannot exhaust them.
 */
export function adsMonthlyCallCap(): number {
  const raw = Number(process.env.LKQ_ADS_MONTHLY_CALL_CAP);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 350;
}
