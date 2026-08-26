import { mobileActionCaller } from "@/lib/mobile/customer-actions";
import { apiError, apiOk, readJsonBody } from "@/lib/mobile/respond";
import { isExpoPushToken } from "@/lib/push/format";
import { createAdminClient } from "@/lib/supabase/admin";

// POST /api/mobile/v1/devices — register this device for push. AUTHENTICATED.
//
// Body: { token, platform }
//       `token` is an Expo push token ("ExponentPushToken[…]"); `platform` is
//       "ios" | "android".
// 200:  { ok: true }
//       Transport-level problems return `{ error }` with a non-2xx: 401, 400/415
//       (bad body or token), 429, 500 (we couldn't write it).
//
// Upserts on the TOKEN, setting `customer_id` to the caller and bumping
// `last_seen_at`. Keyed on the token rather than (customer, token) on purpose:
// a phone that changes hands re-registers the same token under the new
// customer, and this MOVES it to them rather than leaving the previous owner
// receiving the new one's booking updates. See migration 0050.
//
// The app calls this at most once per foreground, so it sits in the `action`
// rate family alongside cancel/reschedule rather than needing its own.
//
// OWNERSHIP: the customer id is the verified caller, never the body.

interface DeviceBody {
  token?: unknown;
  platform?: unknown;
}

const PLATFORMS = ["ios", "android"] as const;
type Platform = (typeof PLATFORMS)[number];

export async function POST(request: Request): Promise<Response> {
  const parsed = await readJsonBody<DeviceBody>(request);
  if (!parsed.ok) return parsed.response;

  const auth = await mobileActionCaller(request, "action");
  if (!auth.ok) return auth.response;

  const { token, platform } = parsed.body;
  if (!isExpoPushToken(token)) {
    return apiError("We couldn't register this device for notifications.", 400);
  }
  if (!PLATFORMS.includes(platform as Platform)) {
    return apiError("We couldn't register this device for notifications.", 400);
  }

  const now = new Date().toISOString();
  const { error } = await createAdminClient()
    .from("customer_push_tokens")
    .upsert(
      { token, customer_id: auth.caller.userId, platform, last_seen_at: now },
      { onConflict: "token" },
    );
  if (error) {
    console.error("[devices] upsert failed — has migration 0050 been applied?", error);
    return apiError("We couldn't save your notification settings — please try again later.", 500);
  }

  return apiOk({ ok: true });
}
