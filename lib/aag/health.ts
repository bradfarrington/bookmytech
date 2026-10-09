import type { SupabaseClient } from "@supabase/supabase-js";

// Is the AAG parts integration actually working right now? (Task 40.)
//
// Same design as lib/haynespro/health.ts, for the same reason: a supplier
// refusing our credentials must be visible on an admin page, not only in a
// server log nobody reads. One row of operational state in `platform_settings`,
// shared across serverless instances.
//
// NB: no `import "server-only"` here, deliberately — lib/aag/client.ts imports
// this at its top level and the unit tests import that file for its pure
// helpers. Everything here takes its Supabase client as a PARAMETER.

const HEALTH_SETTINGS_KEY = "aag_health";

export interface AagHealth {
  state: "ok" | "auth_failed" | "unreachable";
  /** AAG's ErrorCode ("ISE0034") when state is auth_failed; null otherwise. */
  errorCode: string | null;
  /** ISO timestamp of the observation. */
  at: string;
  /** Human-readable reason, for the admin surface. */
  detail: string;
  /** Which host answered — the sandbox and live are different accounts. */
  baseUrl: string | null;
  /**
   * Where the call was made from: "production", "preview", "development"
   * (Vercel's VERCEL_ENV) or "local". The row is shared by every environment,
   * and the sandbox answers a local machine but never Vercel, so a banner
   * that doesn't say where it was seen misleads. Null on rows written before.
   */
  source: string | null;
}

/** This process's environment, as `AagHealth.source` records it. */
export function aagHealthSource(): string {
  return process.env.VERCEL_ENV || "local";
}

/** "the live site" — a source as an admin reads it. */
export function describeAagHealthSource(source: string | null): string | null {
  switch (source) {
    case null:
      return null;
    case "production":
      return "the live site";
    case "preview":
      return "a preview deployment";
    case "local":
      return "a local dev server";
    default:
      return `the ${source} environment`;
  }
}

/**
 * Record the outcome of a call. Never throws and never blocks the caller —
 * diagnostics only.
 */
export async function recordAagHealth(
  db: SupabaseClient,
  health: Omit<AagHealth, "at" | "source">,
): Promise<void> {
  try {
    const value: AagHealth = { ...health, source: aagHealthSource(), at: new Date().toISOString() };
    await db
      .from("platform_settings")
      .upsert({ key: HEALTH_SETTINGS_KEY, value, updated_at: new Date().toISOString() });
  } catch {
    // Diagnostics only.
  }
}

/** Read the last recorded state. Returns null when nothing has been recorded. */
export async function readAagHealth(db: SupabaseClient): Promise<AagHealth | null> {
  try {
    const { data } = await db
      .from("platform_settings")
      .select("value")
      .eq("key", HEALTH_SETTINGS_KEY)
      .maybeSingle();
    const raw = data?.value as Partial<AagHealth> | null | undefined;
    if (!raw || typeof raw.state !== "string") return null;
    return {
      state: raw.state as AagHealth["state"],
      errorCode: typeof raw.errorCode === "string" ? raw.errorCode : null,
      at: typeof raw.at === "string" ? raw.at : new Date(0).toISOString(),
      detail: typeof raw.detail === "string" ? raw.detail : "",
      baseUrl: typeof raw.baseUrl === "string" ? raw.baseUrl : null,
      source: typeof raw.source === "string" ? raw.source : null,
    };
  } catch {
    return null;
  }
}
