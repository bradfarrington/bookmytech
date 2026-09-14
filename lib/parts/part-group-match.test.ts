import { describe, expect, it } from "vitest";

import type { AdsComponent } from "@/lib/lkq/types";
import {
  autoMatchComponent,
  nameMatchScore,
  nameWords,
  resolvePartGroupLink,
  suggestComponents,
} from "./part-group-match";

const c = (ComponentNumber: string, ComponentName: string): AdsComponent => ({
  ComponentNumber,
  ComponentName,
  ComponentSource: "",
});

const LIST: AdsComponent[] = [
  c("000010", "Clutch Slave Cylinder"),
  c("000011", "Clutch Kit"),
  c("000347", "Inner Tie Rod"),
  c("000348", "Track Rod End"),
  c("000397", "Antifreeze"),
  c("000398", "Antifreeze "),
  c("000925", "Shock Absorber"),
  c("000926", "Shock Absorber Kit"),
];

describe("nameWords / nameMatchScore", () => {
  it("ignores word order, punctuation, case and plurals", () => {
    expect(nameMatchScore(nameWords("Slave cylinder, clutch"), nameWords("Clutch Slave Cylinder"))).toBe(1);
    expect(nameMatchScore(nameWords("Brake pads"), nameWords("Brake Pad"))).toBe(1);
  });

  it("scores partial overlap between 0 and 1, and nothing in common as 0", () => {
    const score = nameMatchScore(nameWords("Shock absorber"), nameWords("Shock Absorber Kit"));
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
    expect(nameMatchScore(nameWords("Fuel tank"), nameWords("Wiper Blade"))).toBe(0);
    expect(nameMatchScore(nameWords(""), nameWords("Wiper Blade"))).toBe(0);
  });
});

describe("autoMatchComponent", () => {
  it("matches when exactly one component has the same words", () => {
    expect(autoMatchComponent("Slave cylinder, clutch", LIST)?.ComponentNumber).toBe("000010");
    expect(autoMatchComponent("Shock absorber", LIST)?.ComponentNumber).toBe("000925");
  });

  it("refuses when two components have the same words (LKQ lists some names twice)", () => {
    expect(autoMatchComponent("Antifreeze", LIST)).toBeNull();
  });

  it("refuses a close-but-different name — 'Tie rod end' is not 'Inner Tie Rod'", () => {
    expect(autoMatchComponent("Tie rod end", LIST)).toBeNull();
  });
});

describe("suggestComponents", () => {
  it("ranks the closest names first, shorter names winning ties, capped at the limit", () => {
    const suggestions = suggestComponents("Tie rod end", 2, LIST);
    expect(suggestions.map((s) => s.component.ComponentName)).toEqual(["Inner Tie Rod", "Track Rod End"]);
    expect(suggestions[0].score).toBeGreaterThanOrEqual(suggestions[1].score);
  });

  it("returns nothing for a name with no usable words", () => {
    expect(suggestComponents("--", 3, LIST)).toEqual([]);
  });
});

describe("suggestComponents against LKQ's real list", () => {
  it("finds the verified pairings from the BM19WKO measurement", () => {
    expect(autoMatchComponent("Shock absorber")?.ComponentNumber).toBe("000925");
    expect(autoMatchComponent("Wheel hub")?.ComponentNumber).toBe("000602");
    expect(autoMatchComponent("Antifreeze")).toBeNull();
    expect(autoMatchComponent("Tie rod end")).toBeNull();
  });
});

describe("resolvePartGroupLink", () => {
  it("an admin's decision wins over the name matcher", () => {
    expect(
      resolvePartGroupLink({ status: "confirmed", lkq_component: "000011", description: "Slave cylinder, clutch" }, LIST),
    ).toMatchObject({ kind: "confirmed", component: { ComponentNumber: "000011" } });
    expect(resolvePartGroupLink({ status: "no_match", lkq_component: null, description: "Shock absorber" }, LIST)).toEqual({
      kind: "no_match",
    });
  });

  it("an unreviewed group is auto-matched only when the match is unambiguous", () => {
    expect(resolvePartGroupLink({ status: "unreviewed", lkq_component: null, description: "Shock absorber" }, LIST)).toMatchObject({
      kind: "auto",
      component: { ComponentNumber: "000925" },
    });
    expect(resolvePartGroupLink({ status: "unreviewed", lkq_component: null, description: "Antifreeze" }, LIST)).toEqual({
      kind: "unmatched",
    });
  });

  it("flags a confirmed component LKQ no longer lists instead of silently dropping it", () => {
    expect(resolvePartGroupLink({ status: "confirmed", lkq_component: "999999", description: "Brake disc" }, LIST)).toEqual({
      kind: "stale",
      componentNumber: "999999",
    });
  });
});
