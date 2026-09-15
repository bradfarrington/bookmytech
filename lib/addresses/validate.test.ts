import { describe, expect, it } from "vitest";

import { addressOneLine, isFullUkPostcode, normaliseUkPostcode, validateAddressInput } from "./validate";

describe("normaliseUkPostcode", () => {
  it("uppercases and puts the space before the inward code", () => {
    expect(normaliseUkPostcode("ng127gg")).toBe("NG12 7GG");
    expect(normaliseUkPostcode(" b77  1aa ")).toBe("B77 1AA");
    expect(normaliseUkPostcode("SW1A1AA")).toBe("SW1A 1AA");
  });

  it("leaves a district on its own for the shape check to refuse", () => {
    expect(normaliseUkPostcode("ng12")).toBe("NG12");
    expect(isFullUkPostcode("ng12")).toBe(false);
  });
});

describe("validateAddressInput", () => {
  const valid = {
    label: " Home ",
    kind: "home",
    note: "",
    addressLine1: "12 Acacia Avenue",
    addressLine2: "",
    postcode: "ng127gg",
    parkingType: "driveway",
    specialInstructions: "  ",
  };

  it("tidies a valid address", () => {
    expect(validateAddressInput(valid)).toEqual({
      ok: true,
      value: {
        label: "Home",
        kind: "home",
        note: null,
        addressLine1: "12 Acacia Avenue",
        addressLine2: null,
        postcode: "NG12 7GG",
        parkingType: "driveway",
        specialInstructions: null,
      },
    });
  });

  it("refuses a missing name, line or postcode with a sentence", () => {
    expect(validateAddressInput({ ...valid, label: "" })).toMatchObject({ ok: false });
    expect(validateAddressInput({ ...valid, addressLine1: " " })).toEqual({
      ok: false,
      error: "Enter the first line of the address.",
    });
    expect(validateAddressInput({ ...valid, postcode: "NG12" })).toEqual({
      ok: false,
      error: "Enter a full UK postcode, like NG12 7GG.",
    });
  });

  it("refuses a parking value the table doesn't allow, and allows none", () => {
    expect(validateAddressInput({ ...valid, parkingType: "garage" })).toMatchObject({ ok: false });
    expect(validateAddressInput({ ...valid, parkingType: "" })).toMatchObject({
      ok: true,
      value: { parkingType: null },
    });
  });

  it("files an unknown kind under other", () => {
    expect(validateAddressInput({ ...valid, kind: "castle" })).toMatchObject({ ok: true, value: { kind: "other" } });
  });

  it("holds the same length limits as the table", () => {
    expect(validateAddressInput({ ...valid, label: "x".repeat(41) })).toMatchObject({ ok: false });
    expect(validateAddressInput({ ...valid, note: "x".repeat(81) })).toMatchObject({ ok: false });
    expect(validateAddressInput({ ...valid, specialInstructions: "x".repeat(501) })).toMatchObject({ ok: false });
  });
});

describe("addressOneLine", () => {
  it("skips an empty second line", () => {
    expect(addressOneLine({ addressLine1: "12 Acacia Avenue", addressLine2: null, postcode: "NG12 7GG" })).toBe(
      "12 Acacia Avenue, NG12 7GG",
    );
  });
});
