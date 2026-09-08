import { describe, expect, it } from "vitest";
import { buildRepairHrefs, parseCrumbs, serialiseCrumbs } from "./repair-hrefs";

describe("repair browser hrefs", () => {
  it("round-trips a crumb trail, tolerating '~' inside a label", () => {
    const trail = [
      { id: "1M", label: "Brakes" },
      { id: "1M01", label: "Front ~ discs" },
    ];
    const packed = serialiseCrumbs(trail);
    expect(packed).toBe("1M~Brakes|1M01~Front ~ discs");
    expect(parseCrumbs(packed)).toEqual(trail);
    expect(parseCrumbs("")).toEqual([]);
    expect(parseCrumbs(undefined)).toEqual([]);
  });

  it("keeps the vehicle, the preferred mechanic and the booking so far on every link", () => {
    const hrefs = buildRepairHrefs({
      reg: "AB12 CDE",
      make: "Ford",
      postcode: "NG10 1AA",
      pref: "mech-1",
      selectedIds: ["a", "b"],
      trail: [{ id: "1M", label: "Brakes" }],
    });
    expect(hrefs.base).toBe(
      "/book/repairs?reg=AB12%20CDE&make=Ford&postcode=NG10%201AA&pref=mech-1&repairs=a%2Cb",
    );
    expect(hrefs.groupHref("1M01", "Discs")).toBe(
      `${hrefs.base}&node=1M01&crumbs=${encodeURIComponent("1M~Brakes|1M01~Discs")}`,
    );
    expect(hrefs.crumbHref(-1)).toBe(hrefs.base);
    expect(hrefs.crumbHref(0)).toBe(`${hrefs.base}&node=1M&crumbs=${encodeURIComponent("1M~Brakes")}`);
    expect(hrefs.bookHref("c")).toBe(
      "/book/match?reg=AB12%20CDE&repairs=a%2Cb%2Cc&make=Ford&postcode=NG10%201AA&pref=mech-1",
    );
    expect(hrefs.continueHref).toBe(
      "/book/match?reg=AB12%20CDE&repairs=a%2Cb&make=Ford&postcode=NG10%201AA&pref=mech-1",
    );
  });

  it("omits what it doesn't have", () => {
    const hrefs = buildRepairHrefs({ reg: "AB12CDE", selectedIds: [] });
    expect(hrefs.base).toBe("/book/repairs?reg=AB12CDE");
    expect(hrefs.bookHref("x")).toBe("/book/match?reg=AB12CDE&repairs=x");
    // A search hit's group link starts a fresh one-crumb trail.
    expect(hrefs.groupHref("1M", "Brakes")).toBe(
      `/book/repairs?reg=AB12CDE&node=1M&crumbs=${encodeURIComponent("1M~Brakes")}`,
    );
  });
});
