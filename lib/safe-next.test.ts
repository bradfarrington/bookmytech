import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-next";

describe("safeNext — destinations it allows", () => {
  it("keeps a deep path under an allow-listed prefix", () => {
    expect(safeNext("/dashboard/quotes/abc")).toBe("/dashboard/quotes/abc");
    expect(safeNext("/dashboard/bookings/abc/report")).toBe("/dashboard/bookings/abc/report");
    expect(safeNext("/mechanic/set-password")).toBe("/mechanic/set-password");
    expect(safeNext("/admin")).toBe("/admin");
  });

  it("keeps the query string, which is how the funnel carries its quote", () => {
    expect(safeNext("/book/time?quote=abc")).toBe("/book/time?quote=abc");
  });

  it("allows a prefix on its own but not a longer word starting with it", () => {
    expect(safeNext("/dashboard")).toBe("/dashboard");
    expect(safeNext("/dashboards-are-fun")).toBeNull();
  });

  it("drops a fragment, which the server never sees anyway", () => {
    expect(safeNext("/dashboard/inbox#latest")).toBe("/dashboard/inbox");
  });
});

describe("safeNext — open-redirect attempts", () => {
  it("refuses another origin, however it is spelled", () => {
    expect(safeNext("https://evil.com")).toBeNull();
    expect(safeNext("http://evil.com/dashboard")).toBeNull();
    expect(safeNext("//evil.com")).toBeNull();
    expect(safeNext("//evil.com/dashboard")).toBeNull();
    // A backslash: WHATWG URL parsing treats it as a separator, so this is
    // "//evil.com" by the time anything resolves it.
    expect(safeNext("/\\evil.com")).toBeNull();
    expect(safeNext("\\\\evil.com")).toBeNull();
  });

  it("refuses a host smuggled past a string test by a stripped control character", () => {
    // URL parsing removes tab/newline/CR *before* parsing, so each of these
    // resolves to http://evil.com despite not starting with "//".
    expect(safeNext("/\t/evil.com")).toBeNull();
    expect(safeNext("/\n/evil.com")).toBeNull();
    expect(safeNext("/\r/evil.com")).toBeNull();
    expect(safeNext("/dashboard\t/x")).toBeNull();
  });

  it("refuses encoded variants", () => {
    expect(safeNext("%2f%2fevil.com")).toBeNull();
    expect(safeNext("/%2f%2fevil.com")).toBeNull();
    expect(safeNext("%68%74%74%70%73%3a%2f%2fevil.com")).toBeNull();
    // Malformed percent-encoding: decodeURIComponent would throw.
    expect(safeNext("/dashboard/%zz")).toBeNull();
  });

  it("refuses traversal, raw or encoded, rather than following where it lands", () => {
    expect(safeNext("/dashboard/../admin")).toBeNull();
    expect(safeNext("/dashboard/%2e%2e/admin")).toBeNull();
    expect(safeNext("/dashboard%2f..%2fadmin")).toBeNull();
    expect(safeNext("/book/../../etc/passwd")).toBeNull();
  });

  it("refuses paths outside the four areas", () => {
    expect(safeNext("/")).toBeNull();
    expect(safeNext("/login")).toBeNull();
    expect(safeNext("/api/mobile/v1/garage")).toBeNull();
    expect(safeNext("/terms")).toBeNull();
    // Route matching is case-sensitive, so this would 404 anyway.
    expect(safeNext("/DASHBOARD/x")).toBeNull();
  });

  it("refuses anything that is not a usable string", () => {
    expect(safeNext(undefined)).toBeNull();
    expect(safeNext(null)).toBeNull();
    expect(safeNext("")).toBeNull();
    expect(safeNext(42)).toBeNull();
    expect(safeNext(["/dashboard"])).toBeNull();
    // A FormData file field arrives as an object, not a string.
    expect(safeNext({ toString: () => "/dashboard" })).toBeNull();
  });

  it("refuses a relative path with no leading slash", () => {
    expect(safeNext("dashboard/quotes/abc")).toBeNull();
    expect(safeNext("evil.com")).toBeNull();
  });
});
