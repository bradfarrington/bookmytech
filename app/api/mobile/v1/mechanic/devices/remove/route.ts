import { mobileMechanicCaller } from "@/lib/mobile/mechanic-actions";
import { apiError, apiOk, readJsonBody } from "@/lib/mobile/respond";
import { createAdminClient } from "@/lib/supabase/admin";

// POST /api/mobile/v1/mechanic/devices/remove — stop notifying this device.
// AUTHENTICATED, mechanics only. Mirrors POST /devices/remove.
//
// Body: { token }
// 200:  { ok: true } — whether or not a row matched.
//       Otherwise `{ error }`: 401, 403 (not a mechanic), 400/415, 429, 500.
//
// Called on sign-out so a shared phone doesn't keep receiving the previous
// mechanic's offers. Deletes ONLY the caller's own row.

interface RemoveBody {
  token?: unknown;
}

export async function POST(request: Request): Promise<Response> {
  const parsed = await readJsonBody<RemoveBody>(request);
  if (!parsed.ok) return parsed.response;

  const auth = await mobileMechanicCaller(request);
  if (!auth.ok) return auth.response;

  const { token } = parsed.body;
  if (typeof token !== "string" || !token.trim()) {
    return apiError("Something went wrong. Please try again.", 400);
  }

  const { error } = await createAdminClient()
    .from("mechanic_push_tokens")
    .delete()
    .eq("token", token.trim())
    .eq("mechanic_id", auth.caller.userId);
  if (error) {
    console.error("[mechanic/devices/remove] delete failed", error);
    return apiError("We couldn't update your notification settings. Please try again later.", 500);
  }

  return apiOk({ ok: true });
}
