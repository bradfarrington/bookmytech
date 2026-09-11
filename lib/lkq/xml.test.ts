import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  asArray,
  buildSoapEnvelope,
  extractSoapFault,
  extractSoapResult,
  LKQ_ACTION_NS,
  LKQ_BODY_NS,
  parseXml,
  soapActionFor,
  textAt,
  xmlEscape,
  xmlUnescape,
} from "./xml";

describe("xmlEscape / xmlUnescape", () => {
  it("round-trips the characters that matter", () => {
    const raw = `Brake Disc & Pad <set> "front" 'left'`;
    expect(xmlUnescape(xmlEscape(raw))).toBe(raw);
  });

  it("unescapes &amp; LAST so double-escaped markup is not invented", () => {
    // "&amp;lt;" is a literal "&lt;", NOT a "<". Unescaping & first would produce
    // markup the service never sent.
    expect(xmlUnescape("&amp;lt;REPLY&amp;gt;")).toBe("&lt;REPLY&gt;");
  });

  it("decodes numeric entities and ignores out-of-range ones", () => {
    expect(xmlUnescape("caf&#233;")).toBe("café");
    expect(xmlUnescape("&#99999999;")).toBe("");
  });
});

describe("parseXml", () => {
  it("reads a flat reply, with self-closing tags as empty strings", () => {
    const node = parseXml(
      "<REPLY><Status>SUCCESS</Status><Branch /><Account>L0000013</Account></REPLY>",
    );
    expect(textAt(node, "REPLY.Status")).toBe("SUCCESS");
    expect(textAt(node, "REPLY.Branch")).toBe("");
    expect(textAt(node, "REPLY.Account")).toBe("L0000013");
  });

  it("keeps a base64 token intact through / + and = ", () => {
    const token = "GriJ7Lo1p/uXPWE5+Ji38zgsmSFvFifp8TQlJc9P7pJJoQb+SZUp1YqJ3JG5Oq2B==";
    expect(textAt(parseXml(`<REPLY><Token>${token}</Token></REPLY>`), "REPLY.Token")).toBe(token);
  });

  it("turns repeated siblings into an array", () => {
    const node = parseXml("<Parts><Part><X>1</X></Part><Part><X>2</X></Part></Parts>");
    const parts = asArray((node as never as { Parts: { Part: unknown } }).Parts.Part);
    expect(parts).toHaveLength(2);
    expect(textAt(parts[1] as never, "X")).toBe("2");
  });

  it("does not close early on nested tags of the same name", () => {
    const node = parseXml("<a><a><v>inner</v></a><v>outer</v></a>");
    expect(textAt(node, "a.a.v")).toBe("inner");
    expect(textAt(node, "a.v")).toBe("outer");
  });

  it("unescapes entities in leaf text", () => {
    expect(textAt(parseXml("<D>Brake Disc &amp; Pad</D>"), "D")).toBe("Brake Disc & Pad");
  });

  it("never throws on malformed or hostile input", () => {
    expect(() => parseXml("<unclosed><a>1</a>")).not.toThrow();
    expect(() => parseXml("not xml at all")).not.toThrow();
    expect(() => parseXml("")).not.toThrow();
    // Oversized input is refused rather than walked.
    expect(parseXml(`<a>${"x".repeat(2_000_001)}</a>`)).toEqual({});
  });
});

describe("asArray", () => {
  it("coerces a single sibling, and treats empty/missing as none", () => {
    expect(asArray({ X: "1" })).toHaveLength(1);
    expect(asArray([{ X: "1" }, { X: "2" }])).toHaveLength(2);
    expect(asArray(undefined)).toEqual([]);
    expect(asArray("")).toEqual([]);
  });
});

describe("textAt", () => {
  it("returns '' rather than undefined for anything missing", () => {
    const node = parseXml("<REPLY><Modes><Status>0</Status></Modes></REPLY>");
    expect(textAt(node, "REPLY.Modes.Status")).toBe("0");
    expect(textAt(node, "REPLY.Nope.Deeper")).toBe("");
    expect(textAt(null, "a.b")).toBe("");
  });
});

describe("SOAP envelope", () => {
  it("puts the body element in ApiPriceService and the action in PriceService", () => {
    // These genuinely differ — see the note at the top of xml.ts. If someone
    // "fixes" one to match the other, the service stops matching the operation.
    expect(LKQ_BODY_NS).toBe("http://lkqcoatings.net/ApiPriceService");
    expect(LKQ_ACTION_NS).toBe("http://lkqcoatings.net/PriceService/IApiPlusPriceSvc");
    expect(soapActionFor("GetPrice")).toBe(
      '"http://lkqcoatings.net/PriceService/IApiPlusPriceSvc/GetPrice"',
    );
  });

  it("escapes the QUERY document INTO <value> rather than nesting it", () => {
    const envelope = buildSoapEnvelope("GetPrice", "<QUERY><SysId>ADSSYS</SysId></QUERY>");
    expect(envelope).toContain("<value>&lt;QUERY&gt;&lt;SysId&gt;ADSSYS&lt;/SysId&gt;&lt;/QUERY&gt;</value>");
    // The escaped form must NOT appear as real nested elements.
    expect(envelope).not.toContain("<value><QUERY>");
  });

  it("emits an empty body element for an argument-less operation", () => {
    const envelope = buildSoapEnvelope("HelloFromLkq", null);
    expect(envelope).toContain(`<HelloFromLkq xmlns="${LKQ_BODY_NS}"/>`);
    expect(envelope).not.toContain("<value>");
  });
});

describe("extractSoapResult / extractSoapFault", () => {
  it("returns null when the result element is absent", () => {
    expect(extractSoapResult("GetPrice", "<s:Envelope><s:Body/></s:Envelope>")).toBeNull();
  });

  it("finds a fault block for logging", () => {
    const raw = "<s:Envelope><s:Body><s:Fault><faultstring>boom</faultstring></s:Fault></s:Body></s:Envelope>";
    expect(extractSoapFault(raw)).toContain("boom");
    expect(extractSoapFault("<s:Envelope/>")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Against the REAL captured envelopes (2026-09-11, live test service).
// ---------------------------------------------------------------------------

const ladderPath = join(__dirname, "__fixtures__", "ecp-getprice-ladder.xml");

describe.skipIf(!existsSync(ladderPath))("a real GetPrice envelope", () => {
  const raw = readFileSync(ladderPath, "utf8");

  it("unwraps the escaped <REPLY> out of GetPriceResult", () => {
    const inner = extractSoapResult("GetPrice", raw);
    expect(inner).not.toBeNull();
    expect(inner as string).toContain("<REPLY>");
    // Proof the facade is string-in/string-out: the RAW envelope carries the
    // reply escaped, and only unescaping reveals real markup.
    expect(raw).toContain("&lt;REPLY&gt;");
  });

  it("parses the real nesting the docs flatten", () => {
    const reply = parseXml(extractSoapResult("GetPrice", raw) as string);
    expect(textAt(reply, "REPLY.Modes.Status")).toBe("0");
    expect(textAt(reply, "REPLY.Customer.Currency")).toBe("UKL");
    expect(textAt(reply, "REPLY.Customer.Account")).toBeTruthy();
  });
});
