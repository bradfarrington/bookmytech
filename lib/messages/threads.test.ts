import { describe, expect, it } from "vitest";
import { sortThreads, type MessageThread } from "./threads";

// The order of the mechanic's Messages screen (Task 60). It is the whole value
// of the screen: a list of threads in an arbitrary order is no better than
// opening each job in turn, which is what mechanics had to do before.

function thread(partial: Partial<MessageThread> & { bookingId: string }): MessageThread {
  return {
    jobNumber: null,
    repairDescription: "Front brake pads",
    vehicleReg: null,
    customerName: "Alex Smith",
    lastBody: "Any update?",
    lastAt: "2026-09-16T09:00:00.000Z",
    lastFromCustomer: true,
    unread: 0,
    ...partial,
  };
}

const ids = (list: MessageThread[]) => list.map((t) => t.bookingId);

describe("sortThreads", () => {
  it("puts anything waiting on the mechanic first", () => {
    const sorted = sortThreads([
      thread({ bookingId: "read", unread: 0, lastAt: "2026-09-16T12:00:00.000Z" }),
      thread({ bookingId: "unread", unread: 1, lastAt: "2026-09-16T08:00:00.000Z" }),
    ]);
    // The unread one is OLDER and still comes first: needing an answer beats
    // being recent, which is the point of the ordering.
    expect(ids(sorted)).toEqual(["unread", "read"]);
  });

  it("orders by most recent activity within each group", () => {
    const sorted = sortThreads([
      thread({ bookingId: "unread-old", unread: 2, lastAt: "2026-09-15T09:00:00.000Z" }),
      thread({ bookingId: "read-old", unread: 0, lastAt: "2026-09-14T09:00:00.000Z" }),
      thread({ bookingId: "unread-new", unread: 1, lastAt: "2026-09-16T09:00:00.000Z" }),
      thread({ bookingId: "read-new", unread: 0, lastAt: "2026-09-16T10:00:00.000Z" }),
    ]);
    expect(ids(sorted)).toEqual(["unread-new", "unread-old", "read-new", "read-old"]);
  });

  it("treats any unread count the same for grouping", () => {
    const sorted = sortThreads([
      thread({ bookingId: "one", unread: 1, lastAt: "2026-09-16T09:00:00.000Z" }),
      thread({ bookingId: "many", unread: 9, lastAt: "2026-09-16T08:00:00.000Z" }),
    ]);
    // 9 unread is not "more urgent" than 1: recency decides between them, so a
    // long-ignored thread can't be pushed down by a busier newer one.
    expect(ids(sorted)).toEqual(["one", "many"]);
  });

  it("does not mutate what it is given", () => {
    const input = [
      thread({ bookingId: "a", unread: 0, lastAt: "2026-09-16T08:00:00.000Z" }),
      thread({ bookingId: "b", unread: 1, lastAt: "2026-09-16T09:00:00.000Z" }),
    ];
    sortThreads(input);
    expect(ids(input)).toEqual(["a", "b"]);
  });

  it("survives an unparseable timestamp instead of throwing", () => {
    const sorted = sortThreads([
      thread({ bookingId: "bad", lastAt: "not a date" }),
      thread({ bookingId: "good", lastAt: "2026-09-16T09:00:00.000Z" }),
    ]);
    expect(sorted).toHaveLength(2);
    expect(ids(sorted)).toContain("good");
  });

  it("handles nothing at all", () => {
    expect(sortThreads([])).toEqual([]);
  });
});
