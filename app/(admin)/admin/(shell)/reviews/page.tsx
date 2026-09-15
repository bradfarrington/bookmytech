import { Star, MessageSquare, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isMissingColumn } from "@/lib/supabase/errors";
import { KPI } from "@/components/ui/kpi";
import { Stars } from "@/components/ui/stars";
import { Overline } from "@/components/ui/overline";
import { Card } from "@/components/ui/card";
import { ReviewsTable, type AdminReviewRow } from "./_components/reviews-table";

export const dynamic = "force-dynamic";

// One-to-one Supabase joins arrive typed as arrays; normalise to a single row.
function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

const REVIEW_COLUMNS = `id, rating, tags, comment, mechanic_response, created_at, mechanic_id, booking_id,
       booking:bookings(customer_name),
       mechanic:mechanics(profile:profiles!inner(full_name))`;

interface ReviewQueryRow {
  id: string;
  rating: number;
  tags: unknown;
  comment: string | null;
  mechanic_response: string | null;
  created_at: string;
  mechanic_id: string;
  booking_id: string;
  booking: unknown;
  mechanic: unknown;
  /** Absent until migration 0074 is applied. */
  is_public?: boolean | null;
}

export default async function AdminReviewsPage() {
  const supabase = await createClient();

  // Admins can read every review (RLS policy "Admins can view all reviews",
  // 0012). We join the booking for the customer's display name and the
  // mechanic's profile for their name.
  //
  // `is_public` (Task 51) arrives with migration 0074. Until that's applied the
  // column doesn't exist: read the reviews without it and hide the switches.
  const withVisibility = await supabase
    .from("reviews")
    .select(`${REVIEW_COLUMNS}, is_public`)
    .order("created_at", { ascending: false });
  const visibilityAvailable = !isMissingColumn(withVisibility.error);
  const { data: rows, error } = visibilityAvailable
    ? withVisibility
    : await supabase.from("reviews").select(REVIEW_COLUMNS).order("created_at", { ascending: false });

  const reviews: AdminReviewRow[] = ((rows ?? []) as unknown as ReviewQueryRow[]).map((r) => {
    const mechanic = one(
      r.mechanic as never as {
        profile?: { full_name?: string | null } | { full_name?: string | null }[];
      },
    );
    const profile = one(mechanic?.profile);
    return {
      id: r.id,
      rating: r.rating,
      tags: Array.isArray(r.tags) ? r.tags : [],
      comment: r.comment,
      mechanicResponse: r.mechanic_response,
      createdAt: r.created_at,
      mechanicId: r.mechanic_id,
      bookingId: r.booking_id,
      mechanicName: profile?.full_name ?? "Mechanic",
      customerName:
        one(r.booking as never as { customer_name?: string })?.customer_name ??
        "Customer",
      // Reviews publish by default (0074).
      isPublic: r.is_public ?? true,
    };
  });

  const total = reviews.length;
  const average =
    total > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / total : 0;
  const responded = reviews.filter((r) => r.mechanicResponse).length;
  const mechanicsRated = new Set(reviews.map((r) => r.mechanicId)).size;

  return (
    <div className="space-y-6">
      <header>
        <Overline>Network</Overline>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-text-primary">
          Reviews
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm text-text-muted">
          Every rating and comment customers have left across the network.
        </p>
      </header>

      {error && (
        <div className="rounded-button border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Couldn&apos;t load reviews: {error.message}
        </div>
      )}

      {total === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-blue-50">
            <Star size={26} className="text-brand-blue" />
          </div>
          <h2 className="text-lg font-bold text-text-primary">No reviews yet</h2>
          <p className="max-w-sm text-sm text-text-secondary">
            Once customers rate completed jobs, their reviews will appear here.
          </p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card className="flex flex-col gap-1.5 p-5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-text-muted">
                Average rating
              </span>
              <span className="text-3xl font-extrabold tracking-tight text-text-primary">
                {average.toFixed(1)}
              </span>
              <Stars value={average} size={15} />
            </Card>
            <KPI label="Total reviews" value={total} icon={Star} />
            <KPI label="Mechanics rated" value={mechanicsRated} icon={Users} />
            <KPI
              label="Responded"
              value={`${responded}/${total}`}
              icon={MessageSquare}
            />
          </div>

          <ReviewsTable reviews={reviews} canSetVisibility={visibilityAvailable} />
        </>
      )}
    </div>
  );
}
