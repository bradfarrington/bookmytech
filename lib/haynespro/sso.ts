// HaynesPro Portal-to-Portal SSO (Task 16 Stage F).
//
// Mints a ONE-TIME redirect URL into WorkshopData Touch (HaynesPro's end-user
// app) with the vehicle and a landing subject pre-selected, via the SOAP-only
// RegistrationV2 service (there is no REST equivalent). Links are single-use
// and Touch sessions idle out after 8h — mint fresh on every click.
//
// Verified live 2026-07-09: code 0 + redirectUrl for the demo SSO account
// (userType=demo, interface=TOUCH, carTypeId=t_<id>, subject=repairmanuals).

import "server-only";

const SSO_ENDPOINT = "https://www.haynespro-services.com/reg/services/RegistrationV2";
const REQUEST_TIMEOUT_MS = 12_000;

/** Landing subjects offered on the mechanic job card. */
export const SSO_SUBJECTS = {
  repairmanuals: "Repair manuals",
  maintenance: "Service data",
  electronics: "Wiring & electronics",
} as const;

export type SsoSubject = keyof typeof SSO_SUBJECTS;

export function isHaynesProSsoConfigured(): boolean {
  return Boolean(
    process.env.HAYNESPRO_SSO_COMPANY_ID && process.env.HAYNESPRO_SSO_PASSWORD,
  );
}

export interface MintTouchUrlOptions {
  /** Per-mechanic username (≤32 chars) — gives each mechanic their own session. */
  username: string;
  /** HaynesPro car type — pre-selects the booking vehicle when known. */
  carTypeId?: number | null;
  subject?: SsoSubject | null;
}

/** Mint a one-time WorkshopData Touch URL, or null on any failure. */
export async function mintTouchUrl(opts: MintTouchUrlOptions): Promise<string | null> {
  if (!isHaynesProSsoConfigured()) return null;

  const properties: Array<[string, string]> = [
    // Required for our account type (demo now, swapped by env in production).
    ["userType", process.env.HAYNESPRO_SSO_USERTYPE ?? "demo"],
    ["interface", "TOUCH"],
    ["languageCode", "en"],
  ];
  if (opts.carTypeId != null) properties.push(["carTypeId", `t_${opts.carTypeId}`]);
  if (opts.subject) properties.push(["subject", opts.subject]);

  const items = properties
    .map(
      ([key, value]) =>
        `<v2:item xmlns:ap="http://xml.apache.org/xml-soap"><ap:key>${escapeXml(key)}</ap:key><ap:value>${escapeXml(value)}</ap:value></v2:item>`,
    )
    .join("");

  // NB: "companyIdentificaton" (sic) — the typo is in HaynesPro's WSDL.
  const envelope = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope">
  <soap:Body>
    <v2:registerVisitByDistributor xmlns:v2="http://registration.webservice.vivid.nl/v2">
      <v2:companyIdentificaton>${escapeXml(process.env.HAYNESPRO_SSO_COMPANY_ID ?? "")}</v2:companyIdentificaton>
      <v2:distributorPassword>${escapeXml(process.env.HAYNESPRO_SSO_PASSWORD ?? "")}</v2:distributorPassword>
      <v2:username>${escapeXml(opts.username.slice(0, 32))}</v2:username>
      <v2:properties>${items}</v2:properties>
    </v2:registerVisitByDistributor>
  </soap:Body>
</soap:Envelope>`;

  try {
    const res = await fetch(SSO_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/soap+xml; charset=utf-8" },
      body: envelope,
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const text = await res.text();
    const code = /<code>(-?\d+)<\/code>/.exec(text)?.[1];
    const url = /<redirectUrl>([^<]+)<\/redirectUrl>/.exec(text)?.[1];
    if (code !== "0" || !url) {
      console.error("[haynespro] SSO mint failed:", code, text.slice(0, 300));
      return null;
    }
    return decodeXmlEntities(url);
  } catch (err) {
    console.error("[haynespro] SSO request failed:", err);
    return null;
  }
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function decodeXmlEntities(value: string): string {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}
