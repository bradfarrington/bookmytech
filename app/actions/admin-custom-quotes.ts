"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { saveCustomQuote, withdrawCustomQuote } from "@/lib/custom-quotes/server";
import type { AdminQuoteInput } from "@/lib/custom-quotes/model";

// The admin's custom quotes (Task 75): price a request (or start one), send it,
// withdraw it. Thin wrappers over lib/custom-quotes/server.ts after an admin check.

async function requireAdmin(): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return { ok: false, error: "Admins only." };
  return { ok: true, userId: user.id };
}

function revalidate(id?: string) {
  revalidatePath("/admin/quotes");
  if (id) {
    revalidatePath(`/admin/quotes/${id}`);
    revalidatePath(`/book/quote/${id}`);
  }
}

/** Save (and optionally send) a quote. `id` null creates one. */
export async function saveCustomQuoteAction(
  id: string | null,
  input: AdminQuoteInput,
  send: boolean,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const result = await saveCustomQuote(id, input, { send, adminId: gate.userId });
  if (result.ok) revalidate(result.id);
  return result;
}

export async function withdrawCustomQuoteAction(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const result = await withdrawCustomQuote(id);
  if (result.ok) revalidate(id);
  return result;
}
