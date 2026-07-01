import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  SMS_TEMPLATE_BY_KEY,
  interpolateTemplate,
  type SmsTemplateKey,
} from "./templates";

// Server-side resolution of a lifecycle SMS template: load the admin override
// from `sms_templates`, fall back to the code default, and interpolate the merge
// variables. Best-effort — if the table isn't there yet or the read fails, we
// still return the interpolated default so notifications never silently break.

/** Raw body for a key: DB override if present, else the code default. */
export async function getSmsTemplateBody(key: SmsTemplateKey): Promise<string> {
  const def = SMS_TEMPLATE_BY_KEY[key];
  const fallback = def?.defaultBody ?? "";
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("sms_templates")
      .select("body")
      .eq("key", key)
      .maybeSingle();
    const body = data?.body?.trim();
    return body || fallback;
  } catch {
    return fallback;
  }
}

/** Resolve + interpolate a template in one call (one DB read). */
export async function renderSmsTemplate(
  key: SmsTemplateKey,
  vars: Record<string, string | number | null | undefined> = {},
): Promise<string> {
  const body = await getSmsTemplateBody(key);
  return interpolateTemplate(body, vars);
}
