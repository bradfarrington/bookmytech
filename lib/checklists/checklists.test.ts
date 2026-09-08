import { describe, expect, it } from "vitest";
import {
  checklistProgress,
  checklistsForBooking,
  groupBySection,
  isValidResult,
  itemsForTier,
  resultLabel,
  unfinishedMessage,
  type ChecklistItemRow,
} from "./checklists";

const item = (id: string, section: string, tiers: string[] | null = null, position = 0, active = true): ChecklistItemRow => ({
  id,
  checklist_id: "insp",
  section,
  label: id,
  position,
  tiers,
  is_active: active,
});

describe("checklistsForBooking", () => {
  const links = [
    { productId: "p:full", checklist_id: "full", checklist_tier: null },
    { productId: "p:gold", checklist_id: "insp", checklist_tier: "gold" },
    { productId: "p:bronze", checklist_id: "insp", checklist_tier: "bronze" },
    { productId: "p:diag", checklist_id: null, checklist_tier: null },
  ];

  it("one per product with a checklist; products without one are ignored", () => {
    expect(checklistsForBooking(["p:diag", "p:full"], links)).toEqual([{ checklistId: "full", tier: null }]);
    expect(checklistsForBooking(["p:diag"], links)).toEqual([]);
    expect(checklistsForBooking(["1M01510000WV0"], links)).toEqual([]);
  });

  it("two checklists in one visit; the same checklist twice collapses to the higher tier", () => {
    expect(checklistsForBooking(["p:full", "p:gold"], links)).toEqual([
      { checklistId: "full", tier: null },
      { checklistId: "insp", tier: "gold" },
    ]);
    expect(checklistsForBooking(["p:bronze", "p:gold"], links)).toEqual([{ checklistId: "insp", tier: "gold" }]);
    expect(checklistsForBooking(["p:gold", "p:bronze"], links)).toEqual([{ checklistId: "insp", tier: "gold" }]);
  });
});

describe("itemsForTier + groupBySection", () => {
  const items = [
    item("a", "Interior", ["bronze", "silver", "gold"], 0),
    item("b", "Interior", ["silver", "gold"], 1),
    item("c", "Engine", ["gold"], 2),
    item("d", "Engine", null, 3),
    item("e", "Engine", ["gold"], 4, false),
  ];

  it("filters by tier, drops inactive items, keeps order", () => {
    expect(itemsForTier(items, "insp", "bronze").map((i) => i.id)).toEqual(["a", "d"]);
    expect(itemsForTier(items, "insp", "silver").map((i) => i.id)).toEqual(["a", "b", "d"]);
    expect(itemsForTier(items, "insp", "gold").map((i) => i.id)).toEqual(["a", "b", "c", "d"]);
    // A service checklist has no tiers: everything untiered applies.
    expect(itemsForTier(items, "insp", null).map((i) => i.id)).toEqual(["d"]);
    expect(itemsForTier(items, "other", "gold")).toEqual([]);
  });

  it("groups by section in first-seen order", () => {
    const sections = groupBySection(itemsForTier(items, "insp", "gold"));
    expect(sections.map((s) => [s.section, s.items.length])).toEqual([["Interior", 2], ["Engine", 2]]);
  });
});

describe("checklistProgress + unfinishedMessage", () => {
  const items = [item("a", "S"), item("b", "S"), item("c", "S")];

  it("counts answers by kind and what's left", () => {
    const p = checklistProgress(items, [
      { item_id: "a", result: "pass", comment: null },
      { item_id: "b", result: "fail", comment: "Worn" },
      { item_id: "zzz", result: "pass", comment: null }, // not in this list
    ]);
    expect(p).toMatchObject({ total: 3, answered: 2, unanswered: 1, pass: 1, fail: 1, advisory: 0 });
    expect(unfinishedMessage("Gold inspection", p)).toBe("Finish the Gold inspection first — 1 item still needs an answer.");
  });

  it("is done when every item has an answer", () => {
    const p = checklistProgress(items, items.map((i) => ({ item_id: i.id, result: "checked", comment: null })));
    expect(p.unanswered).toBe(0);
    expect(p.checked).toBe(3);
    expect(unfinishedMessage("Full service checklist", p)).toBeNull();
    expect(unfinishedMessage("x", checklistProgress(items, []))).toBe("Finish the x first — 3 items still need an answer.");
  });
});

describe("results", () => {
  it("validates per kind and labels", () => {
    expect(isValidResult("service", "checked")).toBe(true);
    expect(isValidResult("service", "pass")).toBe(false);
    expect(isValidResult("inspection", "advisory")).toBe(true);
    expect(isValidResult("inspection", "na")).toBe(false);
    expect(resultLabel("not_checked")).toBe("Not checked");
    expect(resultLabel(null)).toBe("—");
  });
});
