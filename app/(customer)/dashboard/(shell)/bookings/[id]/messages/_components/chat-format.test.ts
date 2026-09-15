import { describe, expect, it } from "vitest";
import { formatBookingDay } from "@/lib/slots";
import {
  groupMessagesByDay,
  hasUnreadFromMechanic,
  lastOwnMessageId,
  messageDayLabel,
  messageTime,
  type ChatMessage,
} from "./chat-format";

const NOW = new Date("2026-01-15T12:00:00Z");

function message(id: string, created_at: string, overrides: Partial<ChatMessage> = {}): ChatMessage {
  return { id, sender_role: "customer", body: "Hi", created_at, read_at: null, ...overrides };
}

describe("messageTime", () => {
  it("prints UK wall-clock time", () => {
    expect(messageTime("2026-01-15T09:12:00Z")).toBe("9:12");
    // 13:05 UTC is 14:05 BST.
    expect(messageTime("2026-07-02T13:05:00Z")).toBe("14:05");
    expect(messageTime("2026-01-15T00:00:00Z")).toBe("0:00");
    expect(messageTime("nope")).toBe("");
  });
});

describe("messageDayLabel", () => {
  it("says Today and Yesterday by UK calendar day, then the date", () => {
    expect(messageDayLabel("2026-01-15T00:30:00Z", NOW)).toBe("Today");
    expect(messageDayLabel("2026-01-14T23:59:00Z", NOW)).toBe("Yesterday");
    expect(messageDayLabel("2026-01-12T10:00:00Z", NOW)).toBe(formatBookingDay("2026-01-12T10:00:00Z"));
  });
});

describe("groupMessagesByDay", () => {
  it("groups consecutive messages under their day", () => {
    const days = groupMessagesByDay(
      [
        message("a", "2026-01-14T09:00:00Z"),
        message("b", "2026-01-14T09:05:00Z"),
        message("c", "2026-01-15T08:00:00Z"),
      ],
      NOW,
    );
    expect(days.map((day) => [day.label, day.messages.map((m) => m.id)])).toEqual([
      ["Yesterday", ["a", "b"]],
      ["Today", ["c"]],
    ]);
  });
});

describe("read state", () => {
  it("finds the customer's latest message and unread mechanic messages", () => {
    const thread = [
      message("a", "2026-01-15T09:00:00Z"),
      message("b", "2026-01-15T09:01:00Z", { sender_role: "mechanic", read_at: "2026-01-15T09:02:00Z" }),
      message("c", "2026-01-15T09:03:00Z"),
      message("d", "2026-01-15T09:04:00Z", { sender_role: "mechanic" }),
    ];
    expect(lastOwnMessageId(thread)).toBe("c");
    expect(hasUnreadFromMechanic(thread)).toBe(true);
    expect(hasUnreadFromMechanic(thread.slice(0, 3))).toBe(false);
    expect(lastOwnMessageId([])).toBeNull();
  });
});
