import { describe, expect, it } from "vitest";
import {
  DUPLICATE_APPLICATION_MESSAGE,
  isOwnApplicationDocPath,
  normaliseDraftId,
  validateApplication,
  type ApplicationInput,
} from "./validate";

// The one set of rules for a mechanic application, shared by the website's
// wizard and the mechanic app (Task 71). These pin down what the server now
// refuses that it used to take, and that a web application still passes.

const DRAFT = "3f2b8c1e-9a4d-4e6f-8b2a-1c5d7e9f0a3b";
const OTHER_DRAFT = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

const VALID: ApplicationInput = {
  draftId: DRAFT,
  fullName: "Sam Rivera",
  email: "Sam@Example.com ",
  phone: "07700 900123",
  postcode: "se15 4ab",
  yearsExperience: 8,
  businessType: "sole_trader",
  businessName: "Rivera Mobile Mechanics",
  businessNumber: "1234567890",
  vatRegistered: false,
  specialisms: ["full-service", "diagnostic"],
  serviceRadiusMiles: 10,
  docs: { photo_id: `applications/${DRAFT}/photo_id.jpg` },
  bankSortCode: "12-34-56",
  bankAccountNumber: "12345678",
  references: [
    { name: "Jo", relationship: "Former employer", email: "JO@x.com", phone: "0123" },
    { name: "", relationship: "", email: "", phone: "" },
  ],
};

const refusal = (patch: Partial<ApplicationInput>) => {
  const result = validateApplication({ ...VALID, ...patch });
  return result.ok ? null : result;
};

describe("validateApplication — a good application", () => {
  it("passes and comes back normalised", () => {
    const result = validateApplication(VALID);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.application).toMatchObject({
      email: "sam@example.com",
      postcode: "SE15 4AB",
      sortCode: "123456",
      yearsExperience: 8,
      docs: { photo_id: `applications/${DRAFT}/photo_id.jpg` },
    });
    expect(result.application.references[0].email).toBe("jo@x.com");
    expect(result.application.references[1]).toEqual({ name: null, relationship: null, email: null, phone: null });
  });

  it("takes the wizard's string for years, and an empty one as none", () => {
    for (const [sent, stored] of [["8", 8], ["", null], [null, null], [undefined, null], [0, 0], [70, 70]] as const) {
      const result = validateApplication({ ...VALID, yearsExperience: sent });
      expect(result.ok && result.application.yearsExperience).toBe(stored);
    }
  });

  it("allows no documents at all — they can follow under the grace period", () => {
    expect(refusal({ docs: {} })).toBeNull();
    expect(refusal({ docs: undefined })).toBeNull();
    expect(refusal({ docs: { photo_id: "" } })).toBeNull();
  });

  it("accepts an uppercase draft id and matches it to lowercase paths", () => {
    expect(refusal({ draftId: DRAFT.toUpperCase() })).toBeNull();
  });
});

describe("validateApplication — what only the wizard used to stop", () => {
  it("wants a business type, name and number", () => {
    expect(refusal({ businessType: "" })?.error).toBe("Please choose how you operate.");
    expect(refusal({ businessType: "partnership" })?.error).toBe("Please choose how you operate.");
    expect(refusal({ businessName: "  " })?.error).toBe("Please enter your business name.");
    expect(refusal({ businessNumber: "" })?.error).toBe("Please enter your UTR.");
    expect(refusal({ businessType: "limited_company", businessNumber: "" })?.error).toBe(
      "Please enter your company number.",
    );
  });

  it("wants at least one specialism, each from the list", () => {
    expect(refusal({ specialisms: [] })?.error).toBe("Pick at least one thing you work on.");
    expect(refusal({ specialisms: "full-service" })?.error).toBe("Pick at least one thing you work on.");
    expect(refusal({ specialisms: ["full-service", "rocket-repair"] })?.code).toBe("invalid");
  });

  it("wants years of experience as a whole number from 0 to 70", () => {
    for (const bad of [-1, 71, 8.5, "eight", true]) {
      expect(refusal({ yearsExperience: bad })?.error).toMatch(/between 0 and 70/);
    }
  });
});

describe("validateApplication — documents belong to this draft", () => {
  it("refuses a path from another draft", () => {
    expect(refusal({ docs: { photo_id: `applications/${OTHER_DRAFT}/photo_id.jpg` } })?.code).toBe("invalid");
  });

  it("refuses a path filed under the wrong type", () => {
    expect(refusal({ docs: { photo_id: `applications/${DRAFT}/trade_insurance.pdf` } })?.code).toBe("invalid");
  });

  it("refuses a path outside the applications folder, or one that climbs out", () => {
    for (const path of [
      `documents/${DRAFT}/photo_id.jpg`,
      `applications/${DRAFT}/photo_id.jpg/../../${OTHER_DRAFT}/photo_id.jpg`,
      `applications/${DRAFT}/photo_id.exe`,
      42,
    ]) {
      expect(refusal({ docs: { photo_id: path } })?.code).toBe("invalid");
    }
  });

  it("refuses a document type that doesn't exist", () => {
    expect(refusal({ docs: { passport: `applications/${DRAFT}/passport.jpg` } })?.code).toBe("invalid");
  });

  it("takes a VAT document only from someone VAT registered", () => {
    const vat = { vat: `applications/${DRAFT}/vat.pdf` };
    expect(refusal({ docs: vat })?.error).toMatch(/not VAT registered/);
    expect(refusal({ docs: vat, vatRegistered: true })).toBeNull();
  });
});

describe("validateApplication — the rules it always had", () => {
  it("still refuses what it refused before", () => {
    expect(refusal({ fullName: "" })?.error).toBe("Full name is required.");
    expect(refusal({ email: "not-an-email" })?.error).toBe("Enter a valid email address.");
    expect(refusal({ phone: "" })?.error).toBe("Phone number is required.");
    expect(refusal({ postcode: "12345" })?.error).toBe("Enter a valid UK postcode.");
    expect(refusal({ serviceRadiusMiles: 0 })?.error).toMatch(/between 1 and 100/);
    expect(refusal({ serviceRadiusMiles: 101 })?.error).toMatch(/between 1 and 100/);
    expect(refusal({ bankSortCode: "12345" })?.error).toBe("Sort code must be 6 digits.");
    expect(refusal({ bankAccountNumber: "1234567" })?.error).toBe("Account number must be 8 digits.");
  });

  it("refuses a submit with no draft id — its documents couldn't be checked", () => {
    expect(refusal({ draftId: "" })?.code).toBe("invalid");
    expect(refusal({ draftId: "not-a-uuid" })?.code).toBe("invalid");
  });
});

describe("isOwnApplicationDocPath", () => {
  it("accepts each extension we store, and nothing else", () => {
    for (const ext of ["pdf", "jpg", "png", "webp"]) {
      expect(isOwnApplicationDocPath(`applications/${DRAFT}/qualification.${ext}`, DRAFT, "qualification")).toBe(true);
    }
    expect(isOwnApplicationDocPath(`applications/${DRAFT}/qualification.jpeg`, DRAFT, "qualification")).toBe(false);
  });
});

describe("normaliseDraftId", () => {
  it("lowercases a UUID and rejects anything else", () => {
    expect(normaliseDraftId(` ${DRAFT.toUpperCase()} `)).toBe(DRAFT);
    expect(normaliseDraftId("../etc")).toBeNull();
    expect(normaliseDraftId(123)).toBeNull();
  });
});

describe("DUPLICATE_APPLICATION_MESSAGE", () => {
  it("tells the applicant what to do next", () => {
    expect(DUPLICATE_APPLICATION_MESSAGE).toMatch(/already exists/);
    expect(DUPLICATE_APPLICATION_MESSAGE).toMatch(/support@bookmytech\.co\.uk/);
  });
});
