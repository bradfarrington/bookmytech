import { describe, it, expect } from "vitest";
import {
  SMS_TEMPLATE_DEFS,
  SMS_TEMPLATE_BY_KEY,
  gsmFriendly,
  interpolateTemplate,
} from "./templates";

describe("interpolateTemplate", () => {
  it("fills tokens, tolerating inner spaces", () => {
    expect(interpolateTemplate("Hi {{name}}, ref {{ ref }}.", { name: "Alex", ref: "00123" })).toBe(
      "Hi Alex, ref 00123.",
    );
  });

  it("renders a missing, null or undefined token as nothing rather than leaving it visible", () => {
    expect(interpolateTemplate("a{{x}}b{{y}}c", { x: null, y: undefined })).toBe("abc");
    expect(interpolateTemplate("a{{unknown}}b", {})).toBe("ab");
  });

  it("stringifies numbers", () => {
    expect(interpolateTemplate("{{n}} credits", { n: 5 })).toBe("5 credits");
  });
});

describe("gsmFriendly", () => {
  it("turns the slot label's dash and middle dot into GSM-7 characters", () => {
    expect(gsmFriendly("Wed 3 Sep · 8am–10am")).toBe("Wed 3 Sep, 8am-10am");
  });

  it("turns em dashes, curly quotes and ellipses into their plain forms", () => {
    expect(gsmFriendly("Good news — it’s “done”…")).toBe("Good news - it's \"done\"...");
  });

  it("leaves plain text and the pound sign alone", () => {
    expect(gsmFriendly("Total charged: £89.00. Thanks!")).toBe("Total charged: £89.00. Thanks!");
  });
});

describe("registry", () => {
  it("has unique keys and an audience on every template", () => {
    const keys = SMS_TEMPLATE_DEFS.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const t of SMS_TEMPLATE_DEFS) expect(["customer", "mechanic"]).toContain(t.audience);
  });

  it("every token a default body uses is a declared variable", () => {
    for (const t of SMS_TEMPLATE_DEFS) {
      const declared = new Set(t.variables.map((v) => v.name));
      const used = [...t.defaultBody.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)].map((m) => m[1]);
      for (const token of used) expect(declared, `${t.key} uses {{${token}}}`).toContain(token);
    }
  });

  it("indexes by key", () => {
    expect(SMS_TEMPLATE_BY_KEY.mechanic_confirmed?.audience).toBe("customer");
    expect(SMS_TEMPLATE_BY_KEY.mech_job_cancelled?.audience).toBe("mechanic");
  });
});
