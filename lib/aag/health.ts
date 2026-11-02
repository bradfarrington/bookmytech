import type { SupabaseClient } from "@supabase/supabase-js";

// Is the AAG parts integration actually working right now? (Task 40.)
//
// Same design as lib/haynespro/health.ts, for the same reason: a supplier
// refusing our credentials must be visible on an admin page, not only in a
// server log nobody reads. One row of operational state in `platform_settings`
// PER ENVIRONMENT, shared across that environment's serverless instances. Dev
// and live share one database, and AAG's sandbox answers a local machine but
// not the deployed site, so a single shared row let one environment's failure
// show up on the other's page.
//
// NB: no `import "server-only"` here, deliberately — lib/aag/client.ts imports
// this at its top level and the unit tests import that file for its pure
// helpers. Everything here takes its Supabase client as a PARAMETER.

const HEALTH_SETTINGS_PREFIX = "aag_health";

function healthKey(): string {
  return `${HEALTH_SETTINGS_PREFIX}:${aagHealthSource()}`;
}

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
   * (VERCEL_ENV) or "local". Also the suffix of the row's key.
   */
  source: string | null;
}

/** This process's environment, as `AagHealth.source` records it. */
export function aagHealthSource(): string {
  return process.env.VERCEL_ENV || "local";
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
      .upsert({ key: healthKey(), value, updated_at: new Date().toISOString() });
  } catch {
    // Diagnostics only.
  }
}

/** Read this environment's last recorded state. Null when nothing has been recorded. */
export async function readAagHealth(db: SupabaseClient): Promise<AagHealth | null> {
  try {
    const { data } = await db
      .from("platform_settings")
      .select("value")
      .eq("key", healthKey())
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
