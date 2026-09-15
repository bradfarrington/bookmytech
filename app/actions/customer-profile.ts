"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ProfileState = { ok?: boolean; error?: string } | null;

// Customer account settings: name and contact number. Runs under the user's own
// session: the profiles "update own profile" policy (0010) covers name/phone,
// so no service-role needed.
export async function updateCustomerProfile(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const fullName = String(formData.get("full_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();

  if (!fullName) return { error: "Enter your name." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in again to update your details." };

  const { error } = await supabase
    .from("profiles")
    .update({ full_name: fullName, phone: phone || null })
    .eq("id", user.id);
  if (error) {
    console.error("[customer-profile] update failed", user.id, error.message);
    return { error: "We couldn't save your details. Please try again." };
  }

  revalidatePath("/dashboard/settings");
  // The Text message row there shows the number.
  revalidatePath("/dashboard/settings/reminders");
  revalidatePath("/dashboard");
  return { ok: true };
}
