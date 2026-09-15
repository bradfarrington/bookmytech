import { describe, expect, it } from "vitest";

import { describeEvent } from "./events";
import { EMPTY_READ_STATE, isUnread, readStateFromRow, unreadCount } from "./read-state";

const event = (event_type: string, payload: unknown = null) => ({
  id: "e1",
  event_type,
  created_at: "2026-09-15T09:00:00.000Z",
  reason: null,
  payload,
});

describe("describeEvent", () => {
  it("words a status change by the status it moved to", () => {
    expect(describeEvent(event("status_changed", { status_to: "en_route" }))).toBe("Mechanic on the way");
    expect(describeEvent(event("status_changed", { status_to: "some_new_status" }))).toBeNull();
    expect(describeEvent(event("status_changed", {}))).toBeNull();
  });

  it("leaves internal event types out", () => {
    expect(describeEvent(event("payout_transferred"))).toBeNull();
    expect(describeEvent(event("note"))).toBeNull();
  });

  it("names on-site fees and a visit ended by a declined revision", () => {
    expect(describeEvent(event("payment_captured", { kind: "on_site_diagnostic" }))).toBe("On-site diagnostic fee taken");
    expect(describeEvent(event("payment_captured"))).toBe("Payment taken");
    expect(describeEvent(event("cancelled", { outcome: "customer_declined_revision" }))).toBe(
      "Visit ended after the revised job was declined",
    );
  });

  it("names the day an arrival window was confirmed for, when it's known", () => {
    expect(describeEvent(event("arrival_window_set", { day: "2026-09-18" }))).toMatch(/^Arrival confirmed for /);
    expect(describeEvent(event("arrival_window_set"))).toBe("Arrival window confirmed");
  });
});

describe("read state", () => {
  const now = new Date("2026-09-15T12:00:00.000Z");
  const item = (id: string, hoursAgo: number) => ({ id, at: new Date(now.getTime() - hoursAgo * 3_600_000).toISOString() });

  it("counts recent, unopened items as unread", () => {
    expect(isUnread(item("a", 1), EMPTY_READ_STATE, now)).toBe(true);
    expect(isUnread(item("a", 1), { before: null, ids: ["a"] }, now)).toBe(false);
  });

  it("treats everything before 'mark all read' and older than a week as read", () => {
    const state = { before: new Date(now.getTime() - 2 * 3_600_000).toISOString(), ids: [] };
    expect(isUnread(item("old", 3), state, now)).toBe(false);
    expect(isUnread(item("new", 1), state, now)).toBe(true);
    expect(isUnread(item("ancient", 8 * 24), EMPTY_READ_STATE, now)).toBe(false);
  });

  it("counts and reads rows safely", () => {
    expect(unreadCount([item("a", 1), item("b", 2)], { before: null, ids: ["b"] }, now)).toBe(1);
    expect(readStateFromRow(null)).toEqual(EMPTY_READ_STATE);
    expect(readStateFromRow({ read_before: null, read_ids: null })).toEqual(EMPTY_READ_STATE);
  });
});
