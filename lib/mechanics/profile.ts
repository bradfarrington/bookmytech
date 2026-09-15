import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingColumn, isMissingTable } from "@/lib/supabase/errors";

// The mechanic profile a customer sees (Task 51), read through the CALLER'S
// client. Both sources are views that only answer for mechanics on the caller's
// own bookings (mechanic_cards 0048/0074, mechanic_public_reviews 0074), so an
// id belonging to anyone else reads as "not found", exactly as in the app.
//
// Works before 0074 too: the extras and the reviews are simply absent.

export interface MechanicProfile {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  rating: number | null;
  jobCount: number;
  isPro: boolean;
  bio: string | null;
  /** Only while one of the caller's bookings with them is live. */
  phone: string | null;
  specialisms: string[];
  /** When they were approved to take jobs. */
  joinedAt: string | null;
}

export interface PublicReview {
  id: string;
  rating: number;
  comment: string | null;
  tags: string[];
  createdAt: string;
  /** First name only; null for a guest-era review. */
  reviewerFirstName: string | null;
  mechanicResponse: string | null;
}

interface CardRow {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  rating: number | string | null;
  job_count: number | null;
  is_pro: boolean | null;
  bio: string | null;
  phone: string | null;
  specialisms?: string[] | null;
  approved_at?: string | null;
}

interface ReviewRow {
  id: string;
  rating: number;
  tags: string[] | null;
  comment: string | null;
  mechanic_response: string | null;
  created_at: string;
  reviewer_first_name: string | null;
}

const CARD_COLUMNS = "id, full_name, avatar_url, rating, job_count, is_pro, bio, phone";

export type MechanicProfileResult =
  | { ok: true; profile: MechanicProfile | null; reviews: PublicReview[] }
  | { ok: false; error: string };

export async function loadMechanicProfile(
  db: SupabaseClient,
  mechanicId: string,
  options: { reviewLimit?: number } = {},
): Promise<MechanicProfileResult> {
  const withExtras = await db
    .from("mechanic_cards")
    .select(`${CARD_COLUMNS}, specialisms, approved_at`)
    .eq("id", mechanicId)
    .maybeSingle();

  let card = withExtras.data as unknown as CardRow | null;
  let cardError = withExtras.error;
  if (cardError && isMissingColumn(cardError)) {
    const plain = await db.from("mechanic_cards").select(CARD_COLUMNS).eq("id", mechanicId).maybeSingle();
    card = plain.data as unknown as CardRow | null;
    cardError = plain.error;
  }
  if (cardError) {
    console.error("[mechanic profile] card read failed", mechanicId, cardError.message);
    return { ok: false, error: "We couldn't load this mechanic. Please try again." };
  }
  if (!card) return { ok: true, profile: null, reviews: [] };

  const rating = card.rating == null ? null : Number(card.rating);
  const profile: MechanicProfile = {
    id: card.id,
    fullName: card.full_name?.trim() || "Your mechanic",
    avatarUrl: card.avatar_url,
    rating: rating != null && Number.isFinite(rating) ? rating : null,
    jobCount: card.job_count ?? 0,
    isPro: !!card.is_pro,
    bio: card.bio,
    phone: card.phone,
    specialisms: Array.isArray(card.specialisms) ? card.specialisms : [],
    joinedAt: card.approved_at ?? null,
  };

  const { data: reviewRows, error: reviewError } = await db
    .from("mechanic_public_reviews")
    .select("id, rating, tags, comment, mechanic_response, created_at, reviewer_first_name")
    .eq("mechanic_id", mechanicId)
    .order("created_at", { ascending: false })
    .limit(options.reviewLimit ?? 20);
  if (reviewError && !isMissingTable(reviewError)) {
    console.error("[mechanic profile] reviews read failed", mechanicId, reviewError.message);
  }

  const reviews = ((reviewRows ?? []) as unknown as ReviewRow[]).map((row) => ({
    id: row.id,
    rating: row.rating,
    comment: row.comment,
    tags: Array.isArray(row.tags) ? row.tags : [],
    createdAt: row.created_at,
    reviewerFirstName: row.reviewer_first_name,
    mechanicResponse: row.mechanic_response,
  }));

  return { ok: true, profile, reviews };
}
