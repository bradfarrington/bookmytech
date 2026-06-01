"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Accepts an optional `redirectTo` via FormData so the same action serves the
// admin sidebar (→ /admin/login), the mechanic dashboard (→ /mechanic/login)
// and the public site (→ /). Whitelist the destinations to prevent
// open-redirect abuse from any stray form.
const ALLOWED_REDIRECTS = new Set(["/admin/login", "/mechanic/login", "/"]);

export async function signOut(formData?: FormData) {
  const raw = formData?.get("redirectTo");
  const target =
    typeof raw === "string" && ALLOWED_REDIRECTS.has(raw) ? raw : "/admin/login";

  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(target);
}
