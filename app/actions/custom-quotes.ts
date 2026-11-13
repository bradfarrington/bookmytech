"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  declineCustomQuote,
  enforceQuoteRequestLimits,
  requestCustomQuote,
} from "@/lib/custom-quotes/server";
import type { QuoteRequestInput } from "@/lib/custom-quotes/model";

// The customer's side of a custom quote on the website (Task 75): ask for one,
// or decline one. Thin wrappers over lib/custom-quotes/server.ts, the same
// code behind /api/mobile/v1/quote-requests and /custom-quotes.

async function signedInCustomer(): Promise<{ userId: string; email: string | null } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  // Staff sessions ask as a guest: the request must not attach to a staff account.
  if (profile?.role && profile.role !== "customer") return null;
  return { userId: user.id, email: user.email ?? null };
}

export async function requestQuoteAction(
  input: QuoteRequestInput,
): Promise<{ ok: true; quoteId: string } | { ok: false; error: string }> {
  const [hdrs, caller] = await Promise.all([headers(), signedInCustomer()]);
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() || hdrs.get("x-real-ip")?.trim() || "unknown";
  const limited = await enforceQuoteRequestLimits({ userId: caller?.userId ?? null, ip });
  if (limited) return { ok: false, error: limited };
  return requestCustomQuote(input, caller);
}

export async function declineCustomQuoteAction(quoteId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const caller = await signedInCustomer();
  if (!caller) return { ok: false, error: "Please sign in to decline this quote." };
  const result = await declineCustomQuote(quoteId, caller);
  if (result.ok) revalidatePath(`/book/quote/${quoteId}`);
  return result;
}
