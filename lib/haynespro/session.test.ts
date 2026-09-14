import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_USERNAME_PREFIX,
  getHaynesProConfig,
  isSessionReusable,
  parseStoredSession,
  sessionDay,
  sessionSettingsKey,
  sessionUsername,
} from "./client";

// HaynesPro's production session rules (Task 44): one session per vehicle,
// usernames `<prefix>_<identifier>`, tokens reusable only by the same username
// on the same day.

describe("sessionUsername", () => {
  it("names a content session after the car type", () => {
    expect(sessionUsername("bmt", { account: "content", carTypeId: 619023786 })).toBe("bmt_619023786");
  });

  it("names an identification session after what is being identified, alphanumerics only", () => {
    expect(sessionUsername("bmt", { account: "id", identifier: "FX73 KUA" })).toBe("bmt_FX73KUA");
    expect(sessionUsername("bmt", { account: "id", identifier: "browse" })).toBe("bmt_browse");
  });

  it("falls back to the default prefix and a placeholder identifier rather than emitting a malformed name", () => {
    expect(sessionUsername("  __ ", { account: "id", identifier: "--" })).toBe(`${DEFAULT_USERNAME_PREFIX}_unknown`);
  });

  it("never exceeds HaynesPro's 32-character limit", () => {
    const name = sessionUsername("averyveryverylongprefix", { account: "id", identifier: "WAUZZZ8L63A002427" });
    expect(name.length).toBe(32);
    expect(name.startsWith("averyveryverylongprefix_")).toBe(true);
  });
});

describe("sessionSettingsKey", () => {
  it("keeps the two accounts' sessions apart even for the same username", () => {
    expect(sessionSettingsKey("id", "bmt_1")).not.toBe(sessionSettingsKey("content", "bmt_1"));
  });
});

describe("sessionDay", () => {
  it("is the UK calendar day, so British Summer Time rolls over at local midnight", () => {
    expect(sessionDay(new Date("2026-09-14T22:59:00Z"))).toBe("2026-09-14");
    expect(sessionDay(new Date("2026-09-14T23:30:00Z"))).toBe("2026-09-15");
  });

  it("matches UTC in winter", () => {
    expect(sessionDay(new Date("2026-01-10T23:30:00Z"))).toBe("2026-01-10");
  });
});

describe("parseStoredSession / isSessionReusable", () => {
  const stored = { vrid: "ABC", username: "bmt_619023786", day: "2026-09-14" };

  it("reuses a token only for the username that minted it, on the same day", () => {
    const parsed = parseStoredSession(stored);
    expect(isSessionReusable(parsed, "bmt_619023786", "2026-09-14")).toBe(true);
    expect(isSessionReusable(parsed, "bmt_619023786", "2026-09-15")).toBe(false);
    expect(isSessionReusable(parsed, "bmt_619036758", "2026-09-14")).toBe(false);
  });

  it("treats a malformed or legacy row as no session", () => {
    expect(parseStoredSession(null)).toBeNull();
    expect(parseStoredSession("1D4D-legacy-shared-vrid")).toBeNull();
    expect(parseStoredSession({ vrid: "ABC" })).toBeNull();
    expect(isSessionReusable(null, "bmt_1", "2026-09-14")).toBe(false);
  });
});

describe("getHaynesProConfig", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const setAll = () => {
    vi.stubEnv("HAYNESPRO_ID_DISTRIBUTOR_USERNAME", "id-user");
    vi.stubEnv("HAYNESPRO_ID_DISTRIBUTOR_PASSWORD", "id-pass");
    vi.stubEnv("HAYNESPRO_CONTENT_DISTRIBUTOR_USERNAME", "content-user");
    vi.stubEnv("HAYNESPRO_CONTENT_DISTRIBUTOR_PASSWORD", "content-pass");
  };

  it("needs both accounts", () => {
    setAll();
    vi.stubEnv("HAYNESPRO_CONTENT_DISTRIBUTOR_PASSWORD", "");
    expect(getHaynesProConfig()).toBeNull();
  });

  it("uses the default prefix when none is configured, and a sanitised one when it is", () => {
    setAll();
    vi.stubEnv("HAYNESPRO_USERNAME_PREFIX", "");
    expect(getHaynesProConfig()?.usernamePrefix).toBe(DEFAULT_USERNAME_PREFIX);
    vi.stubEnv("HAYNESPRO_USERNAME_PREFIX", "35sg46");
    expect(getHaynesProConfig()).toMatchObject({
      id: { distributorUsername: "id-user" },
      content: { distributorUsername: "content-user" },
      usernamePrefix: "35sg46",
    });
  });
});
