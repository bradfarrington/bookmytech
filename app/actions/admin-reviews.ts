"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingColumn } from "@/lib/supabase/errors";

// The admin "Shown on profile" switch on /admin/reviews (Task 51). A review is
// public by default (0074); an admin can hide one from the mechanic's profile,
// and who did it and when is recorded on the row. Hiding never changes the
// rating: the average still counts every review.
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
  return { ok: true };
}
