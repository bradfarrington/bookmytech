import { mobileMechanicCaller } from "@/lib/mobile/mechanic-actions";
import { apiError, apiOk, readJsonBody } from "@/lib/mobile/respond";
import { isExpoPushToken } from "@/lib/push/format";
import { createAdminClient } from "@/lib/supabase/admin";

// POST /api/mobile/v1/mechanic/devices — register this device for job-offer
// push. AUTHENTICATED, mechanics only. The mechanic app's counterpart of
// POST /devices, deliberately a separate route AND a separate table
// (`mechanic_push_tokens`, 0082): a phone with both apps installed registers a
// different token with each, and a customer notification must never be able to
// reach the mechanic app or the other way round.
//
// Body: { token, platform } — an Expo push token, and "ios" | "android".
// 200:  { ok: true }
//       Otherwise `{ error }`: 401, 403 (not a mechanic), 400/415, 429, 500.
//
// Upserts on the TOKEN, so a phone that changes hands moves to the new mechanic
// rather than leaving the old one's offers arriving on it (see 0050).
//
// OWNERSHIP: the mechanic id is the verified caller, never the body.

interface DeviceBody {
  token?: unknown;
  platform?: unknown;
}

const PLATFORMS = ["ios", "android"] as const;
type Platform = (typeof PLATFORMS)[number];

export async function POST(request: Request): Promise<Response> {
  const parsed = await readJsonBody<DeviceBody>(request);
  if (!parsed.ok) return parsed.response;

  const auth = await mobileMechanicCaller(request);
  if (!auth.ok) return auth.response;

  const { token, platform } = parsed.body;
  if (!isExpoPushToken(token) || !PLATFORMS.includes(platform as Platform)) {
    return apiError("We couldn't register this device for notifications.", 400);
  }

  const { error } = await createAdminClient()
    .from("mechanic_push_tokens")
    .upsert(
      { token, mechanic_id: auth.caller.userId, platform, last_seen_at: new Date().toISOString() },
      { onConflict: "token" },
    );
  if (error) {
    console.error("[mechanic/devices] upsert failed — has migration 0082 been applied?", error);
    return apiError("We couldn't save your notification settings. Please try again later.", 500);
  }

  return apiOk({ ok: true });
}
