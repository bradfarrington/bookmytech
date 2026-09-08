import { describe, expect, it } from "vitest";
import {
  composeTopLevel,
  isProductCategoryId,
  isProductId,
  oilQuoteFor,
  productCategoryOf,
  productId,
  productUuid,
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
