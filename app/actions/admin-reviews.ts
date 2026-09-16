"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingColumn } from "@/lib/supabase/errors";

// The admin "Shown publicly" switch on /admin/reviews (Tasks 51 and 59). A
// review is public by default (0074); an admin can hide one, and who did it and
// when is recorded on the row.
//
// ONE SWITCH, TWO SURFACES. It governs the mechanic profile inside the dashboard
// and the app (through the `mechanic_public_reviews` view) AND the public
// homepage (through lib/reviews/public.ts). Brad's decision on Task 55: one
// control, not two.
//
// Hiding never changes the rating: lib/mechanics/aggregates.ts still counts
// every review in the average. Hiding a comment is editorial, not a correction
// to the mechanic's score.
//
// A server action is a public endpoint, so the role is checked on every call,
// then the write goes through the service-role client.

export type ReviewVisibilityResult = { ok: true } | { ok: false; error: string };

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function setReviewVisibility(
  reviewId: string,
  isPublic: boolean,
): Promise<ReviewVisibilityResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;

  if (typeof reviewId !== "string" || !UUID_SHAPE.test(reviewId)) {
    return { ok: false, error: "We couldn't find that review." };
  }
  if (typeof isPublic !== "boolean") {
    return { ok: false, error: "Choose whether to show or hide the review." };
  }

  const { data, error } = await createAdminClient()
    .from("reviews")
    .update({
      is_public: isPublic,
      visibility_changed_at: new Date().toISOString(),
      visibility_changed_by: gate.userId,
    })
    .eq("id", reviewId)
    .select("id");

  if (error) {
    if (isMissingColumn(error)) {
      return {
        ok: false,
        error: "Hiding reviews isn't available yet. Apply migration 0074 and try again.",
      };
    }
    console.error("[reviews] visibility update failed", error.code, error.message);
    return { ok: false, error: "We couldn't update that review. Please try again." };
  }
  if (!data?.length) return { ok: false, error: "We couldn't find that review." };

  revalidatePath("/admin/reviews");
  // The homepage sets `revalidate = 3600`, so without this a review switched off
  // could stay on the public site for up to an hour after an admin hid it.
  // That is the one delay this switch must not have.
  revalidatePath("/");
  return { ok: true };
}
