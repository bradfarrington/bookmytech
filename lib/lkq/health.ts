// LKQ connection health, surfaced on /admin/parts (Task 42).
//
// Modelled on lib/aag/health.ts, with one difference: LKQ is TWO APIs that fail
// independently, so health is recorded per api. The catalogue can be refusing
// our key while pricing is perfectly happy, and the banner has to say so.
//
// No `import "server-only"` here, deliberately — everything takes its Supabase
// client as a PARAMETER so the module stays importable in unit tests.
//
// Diagnostics only: every function swallows its own failures. Health must never
// be the reason a page breaks.

import type { SupabaseClient } from "@supabase/supabase-js";

export type LkqApi = "ecp" | "ads";

export type LkqHealthState = "ok" | "auth_failed" | "unreachable" | "budget_exhausted";

export interface LkqHealth {
  state: LkqHealthState;
  /** LKQ's numeric error code as a string, or the HTTP status. */
  errorCode: string | null;
  /** ISO timestamp. */
  at: string;
  detail: string;
  endpoint: string | null;
}

const KEYS: Record<LkqApi, string> = {
  ecp: "lkq_ecp_health",
  ads: "lkq_ads_health",
};

export function lkqHealthKey(api: LkqApi): string {
  return KEYS[api];
}

export async function recordLkqHealth(
  db: SupabaseClient,
  api: LkqApi,
  health: Omit<LkqHealth, "at">,
): Promise<void> {
  try {
    const value: LkqHealth = { ...health, at: new Date().toISOString() };
    await db
      .from("platform_settings")
      .upsert({ key: KEYS[api], value, updated_at: new Date().toISOString() });
  } catch {
    // Diagnostics only.
  }
}

export async function readLkqHealth(
  db: SupabaseClient,
  api: LkqApi,
): Promise<LkqHealth | null> {
  try {
    const { data } = await db
      .from("platform_settings")
      .select("value")
      .eq("key", KEYS[api])
      .maybeSingle();

    const raw = data?.value as Partial<LkqHealth> | null | undefined;
    if (!raw || typeof raw.state !== "string") return null;

    const state = raw.state as LkqHealthState;
    if (!["ok", "auth_failed", "unreachable", "budget_exhausted"].includes(state)) return null;

    return {
      state,
      errorCode: typeof raw.errorCode === "string" ? raw.errorCode : null,
      at: typeof raw.at === "string" ? raw.at : new Date(0).toISOString(),
      detail: typeof raw.detail === "string" ? raw.detail : "",
      endpoint: typeof raw.endpoint === "string" ? raw.endpoint : null,
    };
  } catch {
    return null;
  }
}
