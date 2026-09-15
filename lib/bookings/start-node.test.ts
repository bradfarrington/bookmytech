import { describe, expect, it } from "vitest";
import { parseCrumbs } from "./repair-hrefs";
import { bookingStartNode } from "./start-node";

describe("bookingStartNode", () => {
  it("accepts the Repairs root with its breadcrumb", () => {
    const node = bookingStartNode("root");
    expect(node?.id).toBe("root");
    expect(parseCrumbs(node?.crumbs)).toEqual([{ id: "root", label: "Repairs" }]);
  });

  it("accepts each product category with its label as the breadcrumb", () => {
    expect(bookingStartNode("c:diagnostics")).toEqual({
      id: "c:diagnostics",
      crumbs: "c:diagnostics~Diagnostics",
    });
    expect(parseCrumbs(bookingStartNode("c:inspection")?.crumbs)).toEqual([
      { id: "c:inspection", label: "Pre-purchase inspection" },
    ]);
  });

  it("drops anything else", () => {
    for (const raw of [null, undefined, "", "c:nope", "p:3f2a", "12345", "../admin", "root|x"]) {
      expect(bookingStartNode(raw)).toBeNull();
    }
  });
});
