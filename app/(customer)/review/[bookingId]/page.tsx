import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { CheckCircle, Clock } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { REVIEW_TAGS } from "@/app/actions/reviews";
import { ReviewForm } from "./_components/review-form";

interface ReviewPageProps {
  params: Promise<{ bookingId: string }>;
  searchParams: Promise<{ rating?: string }>;
}

export const dynamic = "force-dynamic";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface">
      <header className="border-b border-border bg-surface-card">
        <div className="mx-auto flex max-w-content items-center justify-between px-4 py-3">
          <Link href="/" aria-label="Book My Tech — home">
            <Image src="/logo-no-bg.png" alt="Book My Tech" width={120} height={32} className="h-8 w-auto" />
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-lg px-4 py-10 sm:py-14">{children}</main>
    </div>
  );
}

export default async function ReviewPage({ params, searchParams }: ReviewPageProps) {
  const { bookingId } = await params;
  const { rating: ratingParam } = await searchParams;

  // Guest flow — no auth session. Service-role read, justified the same way as
  // the confirmation page: looked up by full UUID, surfaces nothing sensitive.
  const supabase = createAdminClient();

  const { data: booking } = await supabase
    .from("bookings")
    .select("id, status, mechanic_id, customer_name")
    .eq("id", bookingId)
    .single();

  if (!booking) notFound();

  // Mechanic's first name for the prompt.
  let mechanicName = "your mechanic";
  if (booking.mechanic_id) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", booking.mechanic_id)
      .single();
    const full = profile?.full_name?.trim();
    if (full) mechanicName = full.split(/\s+/)[0];
  }

  if (booking.status !== "completed") {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <div className="flex size-16 items-center justify-center rounded-full bg-blue-50">
            <Clock size={30} className="text-brand-blue" />
          </div>
          <h1 className="text-2xl font-bold text-text-primary">Not quite yet</h1>
          <p className="text-text-secondary">
            You can leave a review once your job has been completed. Come back
            after your mechanic has signed off the work.
          </p>
        </div>
      </Shell>
    );
  }

  const { data: existing } = await supabase
    .from("reviews")
    .select("id")
    .eq("booking_id", bookingId)
    .maybeSingle();

  if (existing) {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <div className="flex size-16 items-center justify-center rounded-full bg-green-50">
            <CheckCircle size={32} className="text-success" />
          </div>
          <h1 className="text-2xl font-bold text-text-primary">You&apos;ve already reviewed this job</h1>
          <p className="text-text-secondary">Thanks again for your feedback.</p>
        </div>
      </Shell>
    );
  }

  const parsed = Number(ratingParam);
  const initialRating = Number.isInteger(parsed) && parsed >= 1 && parsed <= 5 ? parsed : 0;

  return (
    <Shell>
      <ReviewForm
        bookingId={bookingId}
        mechanicName={mechanicName}
        tags={REVIEW_TAGS}
        initialRating={initialRating}
      />
    </Shell>
  );
}
