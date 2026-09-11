// LKQ Euro Car Parts SOAP helper for one-off verification scripts (Task 41).
//
// Same role as scripts/lib/aag-rest.mjs: plain Node, no "@/" alias, no tsx in
// devDependencies, and it THROWS on any failure because a probe should stop
// loudly rather than degrade the way the app client does.
//
// TWO THINGS THE SUPPLIED DOCS GET WRONG. Both were read off the live WSDL
// (https://apiplus1test.lkqbodyshop.com/ApiPlusPriceSvc.svc?wsdl) and confirmed
// against the service on 2026-09-11:
//
//   1. NAMESPACE. The docx examples use xmlns="http://lkqcoatings.net/PriceService"
//      on the body element. The schema says the PutSession/GetPrice elements
//      live in http://lkqcoatings.net/ApiPriceService. The SOAPAction header is
//      the one that uses .../PriceService/... — they genuinely differ, so do
//      not "fix" one to match the other.
//
//   2. <value> IS A STRING, NOT NESTED XML. The docx prints
//         <PutSession><value><QUERY><SysId>…</SysId></QUERY></value></PutSession>
//      which reads as nested elements. xsd0 declares `value` as xs:string, so
//      the QUERY document has to be XML-ESCAPED INTO the element as text, and
//      the reply comes back as an escaped <REPLY> string inside
//      PutSessionResult. This is a WCF string-in/string-out facade. Sending
//      real nested elements gets you an empty or faulted response.
//
// Transport is SOAP 1.1 (soap:binding transport=.../soap/http), so
// Content-Type is text/xml and SOAPAction is a quoted header.

import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const BODY_NS = "http://lkqcoatings.net/ApiPriceService";
const ACTION_NS = "http://lkqcoatings.net/PriceService/IApiPlusPriceSvc";
const REQUEST_TIMEOUT_MS = 30_000;

/** Error codes from the Pricing/Availability doc §10. 0 = no error. */
export const LKQ_ERROR_CODES = {
  0: "No error",
  100: "Unspecified error",
  101: "Database connection error",
  102: "Invalid request XML",
  103: "Invalid system Identifier",
  104: "Invalid password",
  105: "PC name not found",
  106: "Invalid branch",
  107: "Product not found",
  108: "Database read error",
  109: "Database write error",
  110: "Unable to create XML response",
  111: "System setup error",
  112: "No K8 session found",
  113: "Gateway failure",
  114: "User not in SOP",
  115: "No session found",
  116: "Account not allowed",
  117: "Branch not allowed",
  118: "User not allowed",
  119: "Function not available",
  120: "Incoming data error",
};

/** Quality codes from §9. */
export const LKQ_QUALITY = {
  AMQ: "Aftermarket Quality",
  ICP: "Independently Certified Part",
  OES: "Original Equipment Supplier",
  PQ: "Premium Quality",
  RF: "Refurbished Quality",
  VM: "Vehicle Manufacturer Part",
};

export function requireEnv() {
  const pcId = process.env.LKQ_ECP_PCID;
  const pwd = process.env.LKQ_ECP_PASSWORD;
  const account = process.env.LKQ_ECP_ACCOUNT;
  if (!pcId || !pwd || !account) {
    console.error(
      "Need LKQ_ECP_PCID, LKQ_ECP_PASSWORD and LKQ_ECP_ACCOUNT in .env.local.\n" +
        "LKQ_ECP_SYSID defaults to ADSSYS; LKQ_ECP_BRANCH may stay blank for the home branch.",
    );
    process.exit(2);
  }
  return {
    sysId: process.env.LKQ_ECP_SYSID || "ADSSYS",
    pcId,
    pwd,
    account,
    branch: process.env.LKQ_ECP_BRANCH || "",
    priceUrl: (process.env.LKQ_ECP_PRICE_URL || "https://apiplus1test.lkqbodyshop.com/ApiPlusPriceSvc.svc").replace(/\/+$/, ""),
  };
}

export function xmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function xmlUnescape(value) {
  return String(value ?? "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, "&");
}

/**
 * Minimal XML -> JS parser. Deliberately dependency-free: this is a spike and
 * the replies are shallow. Repeated sibling tags become arrays; a tag with no
 * children becomes its (unescaped) text. Self-closing tags become "".
 * Not general-purpose — it ignores attributes and namespaces entirely.
 */
export function parseXml(xml) {
  const body = String(xml ?? "").replace(/<\?xml[^>]*\?>/g, "").trim();
  const walk = (text) => {
    const out = {};
    // name, self-closing marker, inner text
    const re = /<([A-Za-z_][\w.-]*)(?:\s[^>]*?)?(\/)?>/g;
    let m;
    let found = false;
    while ((m = re.exec(text)) !== null) {
      const [full, name, selfClosing] = m;
      found = true;
      let inner = "";
      if (selfClosing) {
        re.lastIndex = m.index + full.length;
      } else {
        // Find the matching close tag, accounting for nesting of the same name.
        const open = new RegExp(`<${name}(?:\\s[^>]*?)?>`, "g");
        const close = new RegExp(`</${name}\\s*>`, "g");
        let depth = 1;
        let cursor = m.index + full.length;
        let end = -1;
        while (depth > 0) {
          close.lastIndex = cursor;
          const c = close.exec(text);
          if (!c) break;
          open.lastIndex = cursor;
          let o;
          while ((o = open.exec(text)) !== null && o.index < c.index) depth += 1;
          depth -= 1;
          cursor = c.index + c[0].length;
          if (depth === 0) end = c.index;
        }
        if (end === -1) { re.lastIndex = m.index + full.length; continue; }
        inner = text.slice(m.index + full.length, end);
        re.lastIndex = cursor;
      }
      const value = /<[A-Za-z_]/.test(inner) ? walk(inner) : xmlUnescape(inner.trim());
      if (name in out) {
        if (!Array.isArray(out[name])) out[name] = [out[name]];
        out[name].push(value);
      } else {
        out[name] = value;
      }
    }
    return found ? out : xmlUnescape(text.trim());
  };
  return walk(body);
}

/** Always an array, even when the parser saw exactly one sibling. */
export function asArray(value) {
  if (value == null || value === "") return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * POST one SOAP 1.1 operation whose single argument is the escaped-XML string
 * described at the top of this file. Returns the PARSED inner document
 * (the <REPLY> object), plus the raw strings for when a probe wants to dump them.
 */
export async function callLkq(url, operation, queryXml) {
  const envelope =
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body>' +
    `<${operation} xmlns="${BODY_NS}"><value>${xmlEscape(queryXml)}</value></${operation}>` +
    `</s:Body></s:Envelope>`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "text/xml; charset=utf-8",
      soapaction: `"${ACTION_NS}/${operation}"`,
    },
    body: envelope,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const text = await res.text();

  if (res.status < 200 || res.status >= 300) {
    // A SOAP fault still arrives as 500 with a readable body; surface it.
    const fault = /<(?:\w+:)?Fault[\s>][\s\S]*?<\/(?:\w+:)?Fault>/.exec(text);
    throw new Error(
      `LKQ ${operation} responded HTTP ${res.status}: ${(fault ? fault[0] : text).slice(0, 600)}`,
    );
  }

  const result = new RegExp(`<${operation}Result[^>]*>([\\s\\S]*?)</${operation}Result>`).exec(text);
  if (!result) {
    throw new Error(`LKQ ${operation} returned no ${operation}Result element: ${text.slice(0, 600)}`);
  }
  const inner = xmlUnescape(result[1]);
  return { reply: parseXml(inner)?.REPLY ?? parseXml(inner), inner, envelope, raw: text };
}

/** Build the <QUERY> document for PutSession. */
export function sessionQuery(env) {
  return (
    "<QUERY>" +
    `<SysId>${xmlEscape(env.sysId)}</SysId>` +
    `<Pwd>${xmlEscape(env.pwd)}</Pwd>` +
    `<PCId>${xmlEscape(env.pcId)}</PCId>` +
    `<Account>${xmlEscape(env.account)}</Account>` +
    "</QUERY>"
  );
}

/**
 * Validate credentials and mint a token. Per the doc the token is valid for
 * 20 MINUTES — short enough that the real client will need to mint per call
 * or cache with a margin, not hold one for the life of a serverless instance.
 */
export async function putSession(env) {
  const { reply, inner } = await callLkq(env.priceUrl, "PutSession", sessionQuery(env));
  const status = reply?.Status ?? "";
  if (status.toUpperCase() !== "SUCCESS" || !reply?.Token) {
    throw new Error(`LKQ PutSession refused: ${status || "no Status"} — ${inner.slice(0, 400)}`);
  }
  return { token: reply.Token, branch: reply.Branch ?? "", reply };
}

/**
 * GetPrice. Each part is either { supplierPartNo } (ECP 8- or 9-digit) or
 * { type, code } where type is MANUF | OEM | TECHDOC. Quantity is documented
 * as "currently not used" and always sent as 1.
 */
export function priceQuery(env, token, parts) {
  const lines = parts
    .map((p) => {
      const type = p.type ? xmlEscape(p.type) : "";
      const code = p.code ? xmlEscape(p.code) : "";
      const sup = p.supplierPartNo ? xmlEscape(p.supplierPartNo) : "";
      return (
        "<Part>" +
        `<Type>${type}</Type>` +
        `<Code>${code}</Code>` +
        `<SupplierPartNo>${sup}</SupplierPartNo>` +
        `<Quantity>${p.quantity ?? 1}</Quantity>` +
        "</Part>"
      );
    })
    .join("");
  return (
    "<QUERY>" +
    `<SysId>${xmlEscape(env.sysId)}</SysId>` +
    `<Pwd>${xmlEscape(env.pwd)}</Pwd>` +
    `<PCId>${xmlEscape(env.pcId)}</PCId>` +
    `<Token>${xmlEscape(token)}</Token>` +
    `<Customer><Account>${xmlEscape(env.account)}</Account></Customer>` +
    `<Branch><Code>${xmlEscape(env.branch)}</Code></Branch>` +
    `<Parts>${lines}</Parts>` +
    "</QUERY>"
  );
}

export async function getPrice(env, token, parts) {
  const { reply, inner } = await callLkq(env.priceUrl, "GetPrice", priceQuery(env, token, parts));
  // The response table in the Pricing doc §8.2 lists Status/Details/CustPrices/
  // Branch as if they sat at the top of <REPLY>. They are actually inside
  // <Modes>, and the customer/quality/stock/price fields are nested too — see
  // flattenPart. Verified against the test service 2026-09-11.
  const status = String(reply?.Modes?.Status ?? reply?.Status ?? "");
  // §10: "0" is success. Anything else is one of the documented codes.
  if (status !== "0" && status.toUpperCase() !== "SUCCESS") {
    const known = LKQ_ERROR_CODES[Number(status)];
    throw new Error(`LKQ GetPrice error ${status}${known ? ` (${known})` : ""} — ${inner.slice(0, 400)}`);
  }
  return { reply, inner };
}

/**
 * Flatten one <Part> into the shape the docs imply, reading the real nesting:
 *   Quality/QualityDesc  <- QualityDetails
 *   *Free                <- Stock
 *   ShowPrice/CustSur    <- Price, where the doc's <Retail> is RetailPrice
 *                           and its <Net1> is Net1Price.
 *
 * An EMPTY stock figure is "no number given", NOT zero — 101690288 comes back
 * with every level blank while 333330020 reports NDCFree 195. Do not coerce
 * blank to 0 and present it as "out of stock".
 */
export function flattenPart(part) {
  const price = part?.Price ?? {};
  const stock = part?.Stock ?? {};
  const quality = part?.QualityDetails ?? {};
  const num = (v) => (v === "" || v == null ? null : Number(v));
  return {
    supplierPartNo: part?.SupplierPartNo ?? "",
    shortCode: part?.ShortCode ?? "",
    fullDesc: part?.FullDesc ?? "",
    brand: part?.Brand ?? "",
    quality: quality.Quality ?? "",
    qualityDesc: quality.QualityDesc ?? "",
    showPrice: num(price.ShowPrice),
    retailPrice: num(price.RetailPrice ?? price.Retail),
    net1Price: num(price.Net1Price ?? price.Net1),
    custSur: num(price.CustSur),
    branchFree: num(stock.BranchFree),
    buddyFree: num(stock.BuddyFree),
    rdcFree: num(stock.RDCFree),
    ndcFree: num(stock.NDCFree),
    companyFree: num(stock.CompanyFree),
  };
}

/**
 * TRAP: an unknown part number is NOT an error. The service answers Status 0
 * with a row whose description is blank, ShowPrice "0.00" and Retail/Net1
 * empty — the documented code 107 "Product not found" never appears. Verified
 * with SupplierPartNo 000000000 on 2026-09-11.
 *
 * Anything that prices a job MUST call this first, or a part LKQ has never
 * heard of silently becomes a £0.00 line.
 */
export function isNotFound(flat) {
  return !flat.fullDesc && !flat.retailPrice && !flat.net1Price;
}

/** Pad/truncate for the quick tables the probes print. */
export function col(value, width) {
  const s = value == null ? "" : String(value);
  return s.length > width ? `${s.slice(0, width - 1)}…` : s.padEnd(width);
}

/**
 * HelloFromLkq — an unauthenticated ping the supplied docs never mention; it
 * exists in the WSDL and returns the service version and server time. Takes no
 * arguments, so its body element is empty rather than the <value> string the
 * other two use. Use it to separate "can we reach LKQ at all" from "are our
 * credentials right" — the distinction that cost Task 40 a day on AAG.
 */
export async function helloFromLkq(url) {
  const envelope =
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body>' +
    `<HelloFromLkq xmlns="${BODY_NS}"/>` +
    "</s:Body></s:Envelope>";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "text/xml; charset=utf-8",
      soapaction: `"${ACTION_NS}/HelloFromLkq"`,
    },
    body: envelope,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const text = await res.text();
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`LKQ HelloFromLkq responded HTTP ${res.status}: ${text.slice(0, 600)}`);
  }
  const m = /<HelloFromLkqResult[^>]*>([\s\S]*?)<\/HelloFromLkqResult>/.exec(text);
  if (!m) throw new Error(`LKQ HelloFromLkq returned no result: ${text.slice(0, 600)}`);
  return m[1].trim();
}
