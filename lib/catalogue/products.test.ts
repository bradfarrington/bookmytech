import { describe, expect, it } from "vitest";
import {
  composeTopLevel,
  fuelFamilyOf,
  isProductCategoryId,
  isProductId,
  oilQuoteFor,
  oneProductPerName,
  parseInfoSheet,
  productCategoryOf,
  productId,
  productUuid,
  productsForFuel,
  resolveProducts,
  toProductNode,
  toQuotableProduct,
  type CatalogueProductRow,
} from "./products";

const RATE = 6000;

const diagnostic: CatalogueProductRow = {
  id: "d1",
  category: "diagnostics",
  name: "Plug-in diagnostic",
  summary: "Fault codes read",
  description: null,
  price_pence: 5999,
  labour_hours: null,
  duration_hours: "1.00",
  includes_engine_oil: false,
  display_order: 2,
  is_active: true,
};
const fullService: CatalogueProductRow = {
  ...diagnostic,
  id: "s1",
  category: "servicing",
  name: "Full service",
  price_pence: 14900,
  duration_hours: "2.50",
  includes_engine_oil: true,
  display_order: 1,
};
const hourlyService: CatalogueProductRow = {
  ...fullService,
  id: "s2",
  name: "Interim service",
  price_pence: null,
  labour_hours: "0.75",
  display_order: 0,
};
const inactive: CatalogueProductRow = { ...diagnostic, id: "x1", name: "Old", is_active: false };

describe("product ids", () => {
  it("round-trips and classifies ids", () => {
    expect(productId("abc")).toBe("p:abc");
    expect(productUuid("p:abc")).toBe("abc");
    expect(isProductId("p:abc")).toBe(true);
    expect(isProductId("1M01510000WV0")).toBe(false);
    expect(isProductCategoryId("c:servicing")).toBe(true);
    expect(isProductCategoryId("c:unknown")).toBe(false);
    expect(productCategoryOf("c:inspection")).toBe("inspection");
    expect(productCategoryOf("root")).toBeNull();
  });
});

describe("composeTopLevel", () => {
  it("lists Repairs first, then only the categories with active products, in a fixed order", () => {
    const nodes = composeTopLevel([fullService, diagnostic, inactive]);
    expect(nodes.map((n) => n.id)).toEqual(["root", "c:diagnostics", "c:servicing"]);
    expect(nodes[0]).toMatchObject({ description: "Repairs", kind: "group" });
    expect(nodes[2]).toMatchObject({ description: "Servicing", productCategory: "servicing" });
  });

  it("is just Repairs when there are no products", () => {
    expect(composeTopLevel([]).map((n) => n.id)).toEqual(["root"]);
  });
});

describe("toProductNode", () => {
  it("prices a fixed product at its price and reports the visit length as hours", () => {
    const node = toProductNode(toQuotableProduct(diagnostic), RATE, null);
    expect(node).toMatchObject({
      id: "p:d1",
      kind: "repair",
      pricePence: 5999,
      billedHours: 1,
      fixedPrice: true,
      productId: "d1",
      productCategory: "diagnostics",
      durationHours: 1,
      oil: null,
    });
  });

  it("adds the oil line only to a product that includes oil", () => {
    const oil = oilQuoteFor(4.3, 1500, "haynespro", "Engine sump, including filter");
    expect(oil.pence).toBe(6450);
    expect(toProductNode(toQuotableProduct(fullService), RATE, oil)?.pricePence).toBe(14900 + 6450);
    expect(toProductNode(toQuotableProduct(diagnostic), RATE, oil)?.pricePence).toBe(5999);
    expect(toProductNode(toQuotableProduct(fullService), RATE, oil)?.oil).toEqual(oil);
  });

  it("prices an hourly product with the one-hour floor and keeps the oil", () => {
    const oil = oilQuoteFor(4, 1500, "default", null);
    const node = toProductNode(toQuotableProduct(hourlyService), RATE, oil);
    expect(node?.billedHours).toBe(1);
    expect(node?.pricePence).toBe(6000 + 6000);
    expect(node?.fixedPrice).toBeUndefined();
  });

  it("drops the oil line when the vehicle has none (EV)", () => {
    const none = oilQuoteFor(0, 1500, "haynespro", null);
    expect(toProductNode(toQuotableProduct(fullService), RATE, none)?.pricePence).toBe(14900);
  });
});

describe("resolveProducts", () => {
  const rows = [diagnostic, fullService, inactive];
  it("resolves active products in the chosen order", () => {
    const products = resolveProducts(["p:s1", "p:d1"], rows);
    expect(products?.map((p) => p.name)).toEqual(["Full service", "Plug-in diagnostic"]);
  });
  it("refuses an unknown, inactive or non-product id", () => {
    expect(resolveProducts(["p:nope"], rows)).toBeNull();
    expect(resolveProducts(["p:x1"], rows)).toBeNull();
    expect(resolveProducts(["1M01510000WV0"], rows)).toBeNull();
  });
});

// Task 74 — products for one fuel, and the info sheet.
describe("fuel", () => {
  const majorPetrol: CatalogueProductRow = {
    ...fullService,
    id: "mp",
    name: "Major service",
    description: "Oil and filters replaced\nSpark plugs replaced",
    fuel_types: ["petrol"],
    display_order: 2,
  };
  const majorDiesel: CatalogueProductRow = { ...majorPetrol, id: "md", description: "Oil and filters replaced", fuel_types: ["diesel"], price_pence: 22000 };
  const dpf: CatalogueProductRow = { ...fullService, id: "dpf", name: "DPF forced regeneration", fuel_types: ["diesel"], includes_engine_oil: false, display_order: 11 };
  const rows = [fullService, majorPetrol, majorDiesel, dpf];

  it("reads HaynesPro's fuel as one family; a hybrid is petrol", () => {
    expect(fuelFamilyOf(["DIESEL"])).toBe("diesel");
    expect(fuelFamilyOf("PETROL")).toBe("petrol");
    expect(fuelFamilyOf(["PETROL", "ELECTRICAL"])).toBe("petrol");
    expect(fuelFamilyOf(["ELECTRICAL"])).toBe("electric");
    expect(fuelFamilyOf("LPG")).toBeNull();
    expect(fuelFamilyOf(null)).toBeNull();
  });

  it("lists each car only what its fuel is offered", () => {
    expect(productsForFuel(rows, "diesel").map((r) => r.id)).toEqual(["s1", "md", "dpf"]);
    expect(productsForFuel(rows, "petrol").map((r) => r.id)).toEqual(["s1", "mp"]);
    // An unknown fuel sees everything, as before fuels existed.
    expect(productsForFuel(rows, null).map((r) => r.id)).toEqual(["s1", "mp", "md", "dpf"]);
  });

  it("swaps a product for its same-named twin for the car's fuel, in place", () => {
    const products = resolveProducts(["p:s1", "p:mp"], rows, "diesel");
    expect(products?.map((p) => p.id)).toEqual(["p:s1", "p:md"]);
    expect(resolveProducts(["p:md"], rows, "petrol")?.map((p) => p.id)).toEqual(["p:mp"]);
  });

  it("refuses a product with no twin for the car's fuel", () => {
    expect(resolveProducts(["p:dpf"], rows, "petrol")).toBeNull();
    expect(resolveProducts(["p:dpf"], rows, "diesel")?.map((p) => p.id)).toEqual(["p:dpf"]);
  });

  it("shows one card per name before the car is known", () => {
    expect(oneProductPerName(rows).map((r) => r.id)).toEqual(["s1", "mp", "dpf"]);
  });
});

describe("parseInfoSheet", () => {
  it("reads headings, bullets and paragraphs", () => {
    const blocks = parseInfoSheet(
      "Intro line one\nstill intro.\n\n## How we do it\n- Check\n• Soak\n\nThe fee applies.\n",
    );
    expect(blocks).toEqual([
      { type: "paragraph", text: "Intro line one still intro." },
      { type: "heading", text: "How we do it" },
      { type: "bullets", items: ["Check", "Soak"] },
      { type: "paragraph", text: "The fee applies." },
    ]);
    expect(parseInfoSheet(null)).toEqual([]);
  });

  it("carries the sheet onto the quotable product", () => {
    expect(toQuotableProduct({ ...diagnostic, info_sheet: "  ## Hi  " }).infoSheet).toBe("## Hi");
    expect(toQuotableProduct(diagnostic).infoSheet).toBeNull();
  });
});
