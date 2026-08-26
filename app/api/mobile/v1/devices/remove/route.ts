import { mobileActionCaller } from "@/lib/mobile/customer-actions";
import { apiError, apiOk, readJsonBody } from "@/lib/mobile/respond";
import { createAdminClient } from "@/lib/supabase/admin";

// POST /api/mobile/v1/devices/remove — stop notifying this device. AUTHENTICATED.
//
// Body: { token }
// 200:  { ok: true } — whether or not a row matched. Removing a token that was
//       never registered, or was already pruned, is a success, not an error.
//       Transport-level problems return `{ error }`: 401, 400/415, 429, 500.
//
// Called on sign-out so a shared phone doesn't keep receiving the previous
// customer's booking updates. Deletes ONLY if the row belongs to the caller —
// knowing somebody else's token must not be enough to silence their phone.
// (A token re-registered by a new owner has already moved; see /devices.)

interface RemoveBody {
  token?: unknown;
}

export async function POST(request: Request): Promise<Response> {
  const parsed = await readJsonBody<RemoveBody>(request);
  if (!parsed.ok) return parsed.response;

  const auth = await mobileActionCaller(request, "action");
  if (!auth.ok) return auth.response;

  const { token } = parsed.body;
  if (typeof token !== "string" || !token.trim()) {
    return apiError("Something went wrong — please try again.", 400);
  }

  const { error } = await createAdminClient()
    .from("customer_push_tokens")
    .delete()
    .eq("token", token.trim())
    .eq("customer_id", auth.caller.userId);
  if (error) {
    console.error("[devices/remove] delete failed", error);
    return apiError("We couldn't update your notification settings — please try again later.", 500);
  }

  return apiOk({ ok: true });
}
