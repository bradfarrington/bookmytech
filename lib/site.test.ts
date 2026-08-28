import { afterEach, describe, expect, it, vi } from "vitest";
import { isIndexableHost, isProductionSite } from "./site";

describe("isIndexableHost", () => {
  it("allows the production domain and its subdomains", () => {
    expect(isIndexableHost("bookmytech.co.uk")).toBe(true);
    expect(isIndexableHost("www.bookmytech.co.uk")).toBe(true);
    expect(isIndexableHost("mechanic.bookmytech.co.uk")).toBe(true);
    expect(isIndexableHost("admin.bookmytech.co.uk")).toBe(true);
  });

  it("tolerates case and a port suffix in a raw Host header", () => {
    expect(isIndexableHost("BookMyTech.co.uk")).toBe(true);
    expect(isIndexableHost("bookmytech.co.uk:443")).toBe(true);
  });

  it("refuses the testing subdomain, Vercel URLs and localhost", () => {
    expect(isIndexableHost("bmt.thedigicraft.co.uk")).toBe(false);
    expect(isIndexableHost("bookmytech.vercel.app")).toBe(false);
    expect(
      isIndexableHost("bookmytech-git-main-bradfarringtons-projects.vercel.app"),
    ).toBe(false);
    expect(isIndexableHost("localhost:3000")).toBe(false);
  });

  it("does not match look-alike hosts", () => {
    expect(isIndexableHost("notbookmytech.co.uk")).toBe(false);
    expect(isIndexableHost("bookmytech.co.uk.evil.com")).toBe(false);
    expect(isIndexableHost("bookmytech.com")).toBe(false);
  });

  it("treats a missing host as not indexable", () => {
    expect(isIndexableHost(null)).toBe(false);
    expect(isIndexableHost(undefined)).toBe(false);
    expect(isIndexableHost("")).toBe(false);
  });
});

describe("isProductionSite", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is true only when NEXT_PUBLIC_SITE_URL points at the production domain", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://bookmytech.co.uk");
    expect(isProductionSite()).toBe(true);
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.bookmytech.co.uk/");
    expect(isProductionSite()).toBe(true);
  });

  it("is false for the testing subdomain, localhost, unset and garbage", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://bmt.thedigicraft.co.uk");
    expect(isProductionSite()).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
    expect(isProductionSite()).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    expect(isProductionSite()).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "not a url");
    expect(isProductionSite()).toBe(false);
  });
});
