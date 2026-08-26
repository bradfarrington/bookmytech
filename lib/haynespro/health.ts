import type { SupabaseClient } from "@supabase/supabase-js";

// Is the HaynesPro integration actually working right now?
//
// Why this exists: when the licence expired on 2026-08-09 the funnel degraded
// exactly as designed — no crash, no error page — and told every customer "we
// couldn't match your registration". That copy blames the customer's reg for an
// outage on our side, and the only signal anyone at BMT got was a console.error
// on a server nobody was watching. An expired account and a genuinely unknown
// registration were indistinguishable from both ends.
//
// So: the auth path records what it saw, and the admin vehicles page reads it.
// Stored in `platform_settings` rather than a new table because it is one row
// of operational state, it is already the home of the shared VRID, and it needs
// to be visible across serverless instances — a module-level flag would be
// per-instance and therefore useless.

// NB: no `import "server-only"` here, deliberately. lib/haynespro/client.ts
// imports this module at its top level, and that file is imported by the unit
// tests for its pure helpers (extractStatusCode, isAuthFailure). Everything here
// takes its Supabase client as a PARAMETER and pulls in nothing server-side, so
// the guard would buy nothing and would break `npm test`. Same reasoning as the
// dynamic admin-client import documented at the top of client.ts.

const HEALTH_SETTINGS_KEY = "haynespro_health";

/**
 * What HaynesPro's auth endpoint last told us. Codes are theirs:
 * 0 OK · 1 unknown company · 2 bad password · 3 username not found ·
 * 4 no licence · 5 bad/expired vrid · 6 no rights · 7 banned 20 min · −1 unknown.
 * See docs/04-supplier-apis.md.
 */
export interface HaynesProHealth {
  state: "ok" | "auth_failed" | "unreachable";
  /** HaynesPro's statusCode when state is auth_failed; null otherwise. */
  statusCode: number | null;
  /** ISO timestamp of the observation. */
  at: string;
  /** Human-readable reason, for the admin surface. */
  detail: string;
}

/** Plain-English reading of a HaynesPro auth statusCode, for the admin page. */
export function describeAuthStatus(code: number | null): string {
  switch (code) {
    case 1:
      return "HaynesPro doesn't recognise our distributor account (unknown company) — usually an expired or cancelled licence.";
    case 2:
      return "HaynesPro rejected our distributor password.";
    case 3:
      return "HaynesPro doesn't recognise the configured username.";
    case 4:
      return "Our HaynesPro account has no licence for this dataset.";
    case 6:
      return "Our HaynesPro account isn't licensed for this operation.";
    case 7:
      return "HaynesPro has temporarily banned us (too many failed attempts) — this clears itself after about 20 minutes.";
    default:
      return `HaynesPro refused our credentials (status ${code ?? "unknown"}).`;
  }
}

/**
 * Record the outcome of an auth attempt. Never throws and never blocks the
 * caller: this is diagnostics, and the booking funnel must not fail because a
 * status row couldn't be written (Task 16 acceptance criterion).
 */
export async function recordHaynesProHealth(
  db: SupabaseClient,
  health: Omit<HaynesProHealth, "at">,
): Promise<void> {
  try {
    const value: HaynesProHealth = { ...health, at: new Date().toISOString() };
    await db
      .from("platform_settings")
      .upsert({
        key: HEALTH_SETTINGS_KEY,
        value,
        updated_at: new Date().toISOString(),
      });
  } catch {
    // Diagnostics only — a failure here must never surface to a customer.
  }
}

/** Read the last recorded state. Returns null when nothing has been recorded. */
export async function readHaynesProHealth(
  db: SupabaseClient,
): Promise<HaynesProHealth | null> {
  try {
    const { data } = await db
      .from("platform_settings")
      .select("value")
      .eq("key", HEALTH_SETTINGS_KEY)
      .maybeSingle();
    const raw = data?.value as Partial<HaynesProHealth> | null | undefined;
    if (!raw || typeof raw.state !== "string") return null;
    return {
      state: raw.state as HaynesProHealth["state"],
      statusCode: typeof raw.statusCode === "number" ? raw.statusCode : null,
      at: typeof raw.at === "string" ? raw.at : new Date(0).toISOString(),
      detail: typeof raw.detail === "string" ? raw.detail : "",
    };
  } catch {
    return null;
  }
}

/**
 * Is the catalogue down on OUR side rather than the customer's registration
 * being unknown? True only for a recorded auth failure — an unreachable blip is
 * deliberately excluded, because a single timed-out call shouldn't rewrite the
 * copy every customer sees.
 */
export function isCatalogueOutage(health: HaynesProHealth | null): boolean {
  return health?.state === "auth_failed";
}
