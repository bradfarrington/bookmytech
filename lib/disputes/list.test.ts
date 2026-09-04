import { describe, expect, it } from "vitest";
import { groupMechanicDisputes, isOpenDispute } from "./list";
import type { DisputeStatus } from "./constants";

const row = (id: string, status: DisputeStatus, createdAt: string, resolvedAt: string | null = null) => ({
  id,
  status,
  createdAt,
  resolvedAt,
});

describe("groupMechanicDisputes", () => {
  it("splits open from closed", () => {
    const { open, closed } = groupMechanicDisputes([
      row("a", "opened", "2026-09-01T10:00:00Z"),
      row("b", "resolved", "2026-08-01T10:00:00Z", "2026-08-03T10:00:00Z"),
      row("c", "withdrawn", "2026-08-10T10:00:00Z", "2026-08-11T10:00:00Z"),
      row("d", "responded", "2026-09-02T10:00:00Z"),
      row("e", "escalated", "2026-08-20T10:00:00Z"),
    ]);
    expect(open.map((r) => r.id)).toEqual(["e", "d", "a"]); // escalated → responded → opened
    expect(closed.map((r) => r.id)).toEqual(["c", "b"]); // most recently settled first
  });

  it("orders open disputes of the same status newest first", () => {
    const { open } = groupMechanicDisputes([
      row("old", "opened", "2026-09-01T10:00:00Z"),
      row("new", "opened", "2026-09-03T10:00:00Z"),
    ]);
    expect(open.map((r) => r.id)).toEqual(["new", "old"]);
  });

  it("falls back to created_at when a closed dispute has no resolved_at", () => {
    const { closed } = groupMechanicDisputes([
      row("x", "withdrawn", "2026-09-01T10:00:00Z"),
      row("y", "resolved", "2026-08-01T10:00:00Z", "2026-09-02T10:00:00Z"),
    ]);
    expect(closed.map((r) => r.id)).toEqual(["y", "x"]);
  });

  it("knows which statuses are open", () => {
    expect(isOpenDispute("opened")).toBe(true);
    expect(isOpenDispute("responded")).toBe(true);
    expect(isOpenDispute("escalated")).toBe(true);
    expect(isOpenDispute("resolved")).toBe(false);
    expect(isOpenDispute("withdrawn")).toBe(false);
  });
});
