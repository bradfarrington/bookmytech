import { describe, expect, it } from "vitest";
import { buildPushMessage, isExpoPushToken, triageTickets } from "./format";
import { shortPersonName } from "@/lib/utils";

describe("isExpoPushToken", () => {
  it("accepts Expo's token formats and nothing else", () => {
    expect(isExpoPushToken("ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]")).toBe(true);
    expect(isExpoPushToken("ExpoPushToken[xxxxxxxxxxxxxxxxxxxxxx]")).toBe(true);
    expect(isExpoPushToken("apns-device-token")).toBe(false);
    expect(isExpoPushToken("")).toBe(false);
    expect(isExpoPushToken(null)).toBe(false);
    expect(isExpoPushToken(42)).toBe(false);
  });
});

describe("buildPushMessage", () => {
  it("carries the booking id the app deep-links on, on the app's Android channel", () => {
    const m = buildPushMessage("ExponentPushToken[abc]", {
      title: "T",
      body: "B",
      bookingId: "b-1",
    });
    expect(m.to).toBe("ExponentPushToken[abc]");
    expect(m.data).toEqual({ bookingId: "b-1" });
    expect(m.channelId).toBe("bookings");
    expect(m.priority).toBe("high");
  });

  it("omits bookingId when there is no booking, keeping any extra data", () => {
    const m = buildPushMessage("ExponentPushToken[abc]", {
      title: "T",
      body: "B",
      data: { url: "https://example.test/r/tok" },
    });
    expect(m.data).toEqual({ url: "https://example.test/r/tok" });
  });
});

describe("triageTickets", () => {
  const msgs = [
    buildPushMessage("ExponentPushToken[a]", { title: "t", body: "b" }),
    buildPushMessage("ExponentPushToken[b]", { title: "t", body: "b" }),
    buildPushMessage("ExponentPushToken[c]", { title: "t", body: "b" }),
  ];

  it("parks OK tickets for a receipt check, deletes DeviceNotRegistered, counts the rest", () => {
    const out = triageTickets(msgs, [
      { status: "ok", id: "ticket-1" },
      { status: "error", message: "gone", details: { error: "DeviceNotRegistered" } },
      { status: "error", message: "too big", details: { error: "MessageTooBig" } },
    ]);
    expect(out.receipts).toEqual([{ ticket_id: "ticket-1", token: "ExponentPushToken[a]" }]);
    expect(out.deadTokens).toEqual(["ExponentPushToken[b]"]);
    expect(out.failed).toBe(1);
  });

  it("tolerates a short ticket array", () => {
    const out = triageTickets(msgs, [{ status: "ok", id: "only" }]);
    expect(out.receipts).toHaveLength(1);
    expect(out.deadTokens).toHaveLength(0);
  });
});

describe("shortPersonName", () => {
  it("shortens to first name + last initial", () => {
    expect(shortPersonName("James Miller")).toBe("James M");
    expect(shortPersonName("  james   de la   cruz ")).toBe("james C");
    expect(shortPersonName("Cher")).toBe("Cher");
  });
  it("falls back when there is no name", () => {
    expect(shortPersonName(null)).toBe("Your mechanic");
    expect(shortPersonName("   ", "Someone")).toBe("Someone");
  });
});
