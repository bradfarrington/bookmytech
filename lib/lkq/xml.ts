// SOAP/XML plumbing for the LKQ Euro Car Parts API Plus service (Task 42).
//
// A TypeScript port of the parser proven in scripts/lib/lkq-soap.mjs, which was
// verified against the live test service on 2026-09-11. Nothing here touches the
// network or Supabase, so it stays importable by vitest without "server-only".
//
// TWO THINGS THE SUPPLIED DOCS GET WRONG. Both were read off the live WSDL and
// confirmed against the service. Do not "fix" either to match the other:
//
//   1. NAMESPACE. The docx examples put the body element in
//      http://lkqcoatings.net/PriceService. The schema says the PutSession /
//      GetPrice elements live in http://lkqcoatings.net/ApiPriceService. The
//      SOAPAction header genuinely does use .../PriceService/... They differ.
//
//   2. <value> IS A STRING, NOT NESTED XML. The docx prints
//         <PutSession><value><QUERY><SysId>…</SysId></QUERY></value></PutSession>
//      which reads as nested elements. xsd0 declares `value` as xs:string, so the
//      QUERY document has to be XML-ESCAPED INTO the element as text, and the
//      reply comes back as an escaped <REPLY> string inside PutSessionResult.
//      This is a WCF string-in/string-out facade. Sending real nested elements
//      gets you an empty or faulted response.
//
// Transport is SOAP 1.1 (soap:binding transport=.../soap/http), so Content-Type
// is text/xml and SOAPAction is a quoted header.
//
// EVERYTHING HERE IS TOTAL. The client's contract is "never throws", so a
// malformed or hostile document must return an empty result rather than raise.

/** Namespace for the PutSession / GetPrice body elements. NOT the SOAPAction one. */
export const LKQ_BODY_NS = "http://lkqcoatings.net/ApiPriceService";

/** Prefix for the SOAPAction header. NOT the body namespace. */
export const LKQ_ACTION_NS = "http://lkqcoatings.net/PriceService/IApiPlusPriceSvc";

/**
 * Refuse absurd documents rather than letting the hand-rolled parser walk them.
 * A 16-part GetPrice reply with ~8 variants each is ~50 KB; 2 MB is far beyond
 * anything the service has produced.
 */
const MAX_XML_BYTES = 2_000_000;

export function xmlEscape(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Reverse of xmlEscape. `&amp;` MUST be unescaped last: doing it first turns
 * "&amp;lt;" into "&lt;" and then into "<", inventing markup that was never sent.
 */
export function xmlUnescape(value: unknown): string {
  return String(value ?? "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => {
      const code = Number(d);
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
    })
    .replace(/&amp;/g, "&");
}

/** A parsed node: leaf text, or a map of tag → child (or children when repeated). */
export type XmlNode = string | { [tag: string]: XmlNode | XmlNode[] };

/**
 * Minimal XML → JS parser. Deliberately dependency-free: the replies are shallow
 * and adding a parser dependency for one integration is not warranted yet.
 * Repeated sibling tags become arrays; a tag with no element children becomes its
 * (unescaped) text; self-closing tags become "". Attributes and namespaces are
 * ignored entirely — nothing in these replies carries meaning in an attribute.
 *
 * Not general-purpose, and never throws.
 */
export function parseXml(xml: string): XmlNode {
  const input = String(xml ?? "");
  if (input.length > MAX_XML_BYTES) return {};

  const body = input.replace(/<\?xml[^>]*\?>/g, "").trim();

  const walk = (text: string): XmlNode => {
    const out: { [tag: string]: XmlNode | XmlNode[] } = {};
    const re = /<([A-Za-z_][\w.-]*)(?:\s[^>]*?)?(\/)?>/g;
    let m: RegExpExecArray | null;
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
          let o: RegExpExecArray | null;
          while ((o = open.exec(text)) !== null && o.index < c.index) depth += 1;
          depth -= 1;
          cursor = c.index + c[0].length;
          if (depth === 0) end = c.index;
        }

        if (end === -1) {
          // Unclosed tag: skip it rather than consuming the rest of the document.
          re.lastIndex = m.index + full.length;
          continue;
        }

        inner = text.slice(m.index + full.length, end);
        re.lastIndex = cursor;
      }

      const value: XmlNode = /<[A-Za-z_]/.test(inner) ? walk(inner) : xmlUnescape(inner.trim());
      const existing = out[name];
      if (existing !== undefined) {
        if (Array.isArray(existing)) existing.push(value);
        else out[name] = [existing, value];
      } else {
        out[name] = value;
      }
    }

    return found ? out : xmlUnescape(text.trim());
  };

  try {
    return walk(body);
  } catch {
    return {};
  }
}

/** Always an array, even when the parser saw exactly one sibling (or none). */
export function asArray<T = XmlNode>(value: T | T[] | null | undefined): T[] {
  if (value == null || (value as unknown) === "") return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Read a dotted path off a parsed node, e.g. textAt(reply, "Modes.Status").
 * Returns "" for anything missing or non-leaf, so callers never see undefined.
 * When a path segment repeats, the first occurrence wins.
 */
export function textAt(node: XmlNode | null | undefined, path: string): string {
  let cursor: XmlNode | XmlNode[] | undefined = node ?? undefined;
  for (const segment of path.split(".")) {
    if (Array.isArray(cursor)) cursor = cursor[0];
    if (cursor == null || typeof cursor !== "object") return "";
    cursor = (cursor as { [tag: string]: XmlNode | XmlNode[] })[segment];
  }
  if (Array.isArray(cursor)) cursor = cursor[0];
  return typeof cursor === "string" ? cursor : "";
}

/**
 * Build a SOAP 1.1 envelope for an operation whose single argument is the
 * escaped-XML string described at the top of this file. `queryXml` of null
 * produces an empty body element (HelloFromLkq takes no arguments).
 */
export function buildSoapEnvelope(operation: string, queryXml: string | null): string {
  const inner =
    queryXml === null
      ? `<${operation} xmlns="${LKQ_BODY_NS}"/>`
      : `<${operation} xmlns="${LKQ_BODY_NS}"><value>${xmlEscape(queryXml)}</value></${operation}>`;

  return (
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body>' +
    inner +
    "</s:Body></s:Envelope>"
  );
}

/** The quoted SOAPAction header value for an operation. */
export function soapActionFor(operation: string): string {
  return `"${LKQ_ACTION_NS}/${operation}"`;
}

/**
 * Pull the inner document out of `<{operation}Result>…</{operation}Result>` and
 * unescape it. Returns null when the element is absent — which is what a fault
 * or an unexpected shape looks like.
 */
export function extractSoapResult(operation: string, raw: string): string | null {
  const text = String(raw ?? "");
  if (text.length > MAX_XML_BYTES) return null;
  const match = new RegExp(`<${operation}Result[^>]*>([\\s\\S]*?)</${operation}Result>`).exec(text);
  if (!match) return null;
  return xmlUnescape(match[1]);
}

/** The `<Fault>` block from an error envelope, for logging. Null when absent. */
export function extractSoapFault(raw: string): string | null {
  const match = /<(?:\w+:)?Fault[\s>][\s\S]*?<\/(?:\w+:)?Fault>/.exec(String(raw ?? ""));
  return match ? match[0] : null;
}
