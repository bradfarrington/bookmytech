import { notFound, redirect } from "next/navigation";
import { Star } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { loadCustomerBooking } from "@/lib/dashboard/customer-bookings";
import { MAX_REVIEW_COMMENT_CHARS } from "@/lib/reviews/submit-review";
import { REVIEW_TAGS } from "@/lib/reviews/tags";
import { ButtonLink, Notice, PageHeader, Screen, Stack, StarRating } from "@/components/dashboard/ui";
import { ReviewForm } from "./_components/review-form";

// Review a completed job from the dashboard (Task 48, mockup 04 "Review").
// Submits through `submitReviewAsCustomer`, which enforces ownership from the
// cookie session. The public email-link page (/review/[bookingId]) is separate
// and unchanged.

export default async function ReviewBookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const booking = await loadCustomerBooking({ userId: user.id, email: user.email ?? null }, id);
  if (!booking) notFound();

  const backHref = `/dashboard/bookings/${booking.id}`;
  const back = (
    <ButtonLink href={backHref} variant="secondary" size="sm">
      Back to your booking
    </ButtonLink>
  );

  if (booking.rating != null) {
    return (
      <Screen>
        <PageHeader title="Leave a review" backHref={backHref} />
        <Notice icon={Star} title="You've already reviewed this job" action={back}>
          <span className="flex flex-wrap items-center gap-2">
            <StarRating value={booking.rating} size={14} />
            Thanks for your feedback.
          </span>
        </Notice>
      </Screen>
    );
  }

  if (booking.status !== "completed" || !booking.mechanic) {
    return (
      <Screen>
        <PageHeader title="Leave a review" backHref={backHref} />
        <Notice
          icon={Star}
          title={booking.status !== "completed" ? "You can review this job once it's complete" : "There's no mechanic to review"}
          action={back}
        >
          {booking.status !== "completed"
            ? "We'll ask you how it went when your mechanic finishes."
            : "This job didn't have a mechanic assigned, so there's nobody to rate."}
        </Notice>
      </Screen>
    );
  }

  return (
    <Screen>
      <PageHeader title="Leave a review" backHref={backHref} />
      <Stack>
        <div>
          <h2 className="font-display text-2xl font-extrabold leading-[30px] tracking-[-0.6px] text-text-primary">
            How did it go?
          </h2>
          <p className="mt-1.5 text-sm leading-5 text-text-secondary">
            It takes a few seconds and helps other customers choose.
          </p>
        </div>
        <ReviewForm
          bookingId={booking.id}
          backHref={backHref}
          mechanicName={booking.mechanic.name}
          mechanicAvatarUrl={booking.mechanic.avatarUrl}
          tags={[...REVIEW_TAGS]}
          maxComment={MAX_REVIEW_COMMENT_CHARS}
        />
      </Stack>
    </Screen>
  );
}
