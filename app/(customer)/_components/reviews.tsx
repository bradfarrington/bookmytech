import { Quote } from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { Reveal } from "@/components/ui/reveal";
import { SectionHeading } from "@/components/ui/section-heading";
import { Stars } from "@/components/ui/stars";
import { loadPublicReviews } from "@/lib/reviews/public";

// "What customers say" (Task 59). Real reviews, from `reviews.is_public` — the
// same switch on /admin/reviews that governs the mechanic profile inside the
// dashboard, so one control covers both.
//
// Task 46 removed the old placeholder testimonials on the rule that the homepage
// carries no invented counts or ratings (see trust-ticker.tsx and
// mechanic-join.tsx). This section keeps that rule: every word is a real
// customer's, and if there are none to show the section RENDERS NOTHING rather
// than an empty shell or a filler card. That also means it simply stays absent
// until the first public review exists, which is the correct behaviour on a new
// site rather than a state worth designing for.
//
// No aggregate rating is claimed. `mechanics.rating` is a per-mechanic average
// and a site-wide "4.9 from 300 reviews" would be a number we'd have to stand
// behind; the individual reviews speak without it.

function monthYear(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

export async function Reviews() {
  const reviews = await loadPublicReviews(6);
  if (reviews.length === 0) return null;

  return (
    // bg-white, not bg-surface: this sits between the dark repairs band and the
    // mechanic panel, which is bg-surface. Two adjacent sections on the same
    // surface read as one, so the bands alternate dark → white → surface.
    <section id="reviews" className="scroll-mt-[68px] bg-white">
      <div className="mx-auto max-w-content px-4 py-14 sm:px-6 sm:py-[88px]">
        <SectionHeading
          eyebrow="Reviews"
          title="What customers say."
          lead="Left by people after their mechanic finished the job. We publish them as written."
        />

        {/* One column on a phone, two from 700px, three from 1000px. A review
            is a block of prose, so three across is the most that stays
            readable — see the responsive-breakpoints rules. */}
        <Reveal
          stagger
          className="grid gap-5 min-[700px]:grid-cols-2 min-[1000px]:grid-cols-3"
        >
          {reviews.map((review) => (
            <figure
              key={review.id}
              className="flex h-full flex-col gap-4 rounded-[20px] border border-border bg-surface-card p-6 shadow-sm"
            >
              <div className="flex items-center justify-between gap-3">
                <Stars value={review.rating} size={16} />
                <span className="text-brand-blue/25">
                  <Icon icon={Quote} size={22} strokeWidth={2.5} />
                </span>
              </div>

              <blockquote className="flex-1 text-[15px] leading-6 text-text-primary">
                {review.comment}
              </blockquote>

              <figcaption className="text-xs text-text-muted">
                {/* "A Book My Tech customer" when the review predates accounts
                    or the name is missing — never a made-up name, and never a
                    surname even when we have one. */}
                <span className="font-semibold text-text-secondary">
                  {review.reviewerFirstName ?? "A Book My Tech customer"}
                </span>
                {monthYear(review.createdAt) && <> · {monthYear(review.createdAt)}</>}
              </figcaption>
            </figure>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
