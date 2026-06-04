import { redirect } from "next/navigation";
import { Star, MessageSquare } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { KPI } from "@/components/ui/kpi";
import { Stars } from "@/components/ui/stars";
import { Overline } from "@/components/ui/overline";
import { Card } from "@/components/ui/card";
import { ReviewsList, type ReviewItem } from "./_components/reviews-list";

export const dynamic = "force-dynamic";

// One-to-one Supabase joins arrive typed as arrays; normalise to a single row.
function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export default async function MechanicReviewsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/mechanic/login");

  // RLS scopes this to the mechanic's own reviews (0012). The booking join
  // gives us the customer's display name (works because the booking is
  // assigned to this mechanic).
  const { data: rows } = await supabase
    .from("reviews")
    .select(
      `id, rating, tags, comment, mechanic_response, created_at,
       booking:bookings(customer_name)`,
    )
    .eq("mechanic_id", user.id)
    .order("created_at", { ascending: false });

  const reviews: ReviewItem[] = (rows ?? []).map((r) => ({
    id: r.id,
    rating: r.rating,
    tags: Array.isArray(r.tags) ? r.tags : [],
    comment: r.comment,
    mechanicResponse: r.mechanic_response,
    createdAt: r.created_at,
    customerName: one(r.booking as never as { customer_name?: string })?.customer_name ?? "Customer",
  }));

  const total = reviews.length;
  const average =
    total > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / total : 0;
  const responded = reviews.filter((r) => r.mechanicResponse).length;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Overline>Reviews</Overline>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-text-primary">
          Your reviews
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          Ratings and feedback from your completed jobs.
        </p>
      </div>

      {total === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-blue-50">
            <Star size={26} className="text-brand-blue" />
          </div>
          <h2 className="text-lg font-bold text-text-primary">No reviews yet</h2>
          <p className="max-w-sm text-sm text-text-secondary">
            Once you complete jobs, customers can rate you. Your reviews and
            average rating will show up here.
          </p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
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
            <KPI label="Responded" value={`${responded}/${total}`} icon={MessageSquare} />
          </div>

          <ReviewsList reviews={reviews} />
        </>
      )}
    </div>
  );
}
