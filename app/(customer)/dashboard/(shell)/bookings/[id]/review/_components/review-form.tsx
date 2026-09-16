"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Star } from "lucide-react";
import { AvatarTile, Button, Caption, Notice, Panel, Section } from "@/components/dashboard/ui";
import { cn } from "@/lib/utils";
import { submitReviewAsCustomer } from "@/app/actions/reviews";

// Stars, tags, comment and submit for the dashboard review screen. The stars
// are native radio inputs, so arrow keys, Tab and screen readers work without
// any extra wiring; the big star is the visible label.

const RATING_WORDS = ["", "Poor", "Not great", "OK", "Good", "Brilliant"];

const FIELD =
  "block w-full resize-y rounded-lg border border-border bg-surface-card px-3 py-2.5 text-base leading-5 text-text-primary placeholder:text-text-muted focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20 sm:text-sm";

export function ReviewForm({
  bookingId,
  backHref,
  mechanicName,
  mechanicAvatarUrl,
  tags,
  maxComment,
}: {
  bookingId: string;
  backHref: string;
  mechanicName: string;
  mechanicAvatarUrl: string | null;
  tags: string[];
  maxComment: number;
}) {
  const router = useRouter();
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [picked, setPicked] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const shown = hover || rating;

  function toggleTag(tag: string) {
    setPicked((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (rating < 1) {
      setError("Tap a star to give your rating.");
      return;
    }
    startTransition(async () => {
      const res = await submitReviewAsCustomer(bookingId, { rating, tags: picked, comment });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push(backHref);
    });
  }

  return (
    <form onSubmit={submit} className="contents">
      <Panel tone="float" padding="lg" className="text-center">
        <div className="flex justify-center">
          <AvatarTile name={mechanicName} src={mechanicAvatarUrl} size="xl" />
        </div>
        <div className="mt-3 font-display text-[17px] font-bold leading-[22px] tracking-[-0.3px] text-text-primary">
          {mechanicName}
        </div>
        <fieldset className="mt-4">
          <legend className="sr-only">Your rating for {mechanicName}</legend>
          <div className="flex justify-center gap-1" onMouseLeave={() => setHover(0)}>
            {[1, 2, 3, 4, 5].map((n) => (
              <label
                key={n}
                onMouseEnter={() => setHover(n)}
                className="flex size-11 cursor-pointer items-center justify-center rounded-lg has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-blue"
              >
                <input
                  type="radio"
                  name="rating"
                  value={n}
                  checked={rating === n}
                  onChange={() => {
                    setRating(n);
                    setError(null);
                  }}
                  className="sr-only"
                />
                <Star
                  size={36}
                  strokeWidth={0}
                  aria-hidden
                  className={cn("transition-colors", n <= shown ? "fill-warning" : "fill-text-disabled")}
                />
                <span className="sr-only">
                  {n} star{n > 1 ? "s" : ""}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="mt-2 h-5 text-[13.5px] font-bold leading-5 text-amber-600" aria-live="polite">
          {RATING_WORDS[shown]}
        </div>
      </Panel>

      <Section title="What stood out?">
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => {
            const on = picked.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                aria-pressed={on}
                onClick={() => toggleTag(tag)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-2",
                  on
                    ? "border-brand-blue bg-surface-card text-brand-blue"
                    : "border-transparent bg-border-subtle text-slate-700 hover:bg-slate-200",
                )}
              >
                {on && <Check size={13} strokeWidth={3} aria-hidden />}
                {tag}
              </button>
            );
          })}
        </div>
      </Section>

      <div>
        <label htmlFor="review-comment" className="mb-1.5 block text-xs font-semibold text-text-secondary">
          Anything to add? <span className="font-normal text-text-muted">(optional)</span>
        </label>
        <textarea
          id="review-comment"
          rows={4}
          maxLength={maxComment}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="What went well, or what could have been better"
          className={FIELD}
        />
        {comment.length > maxComment - 200 && (
          <Caption className="mt-1 text-right">
            {comment.length} of {maxComment} characters
          </Caption>
        )}
        <Caption className="mt-2">Your first name, rating and comment may be shown on your mechanic&apos;s profile and on the Book My Tech website. We never show your surname or email.</Caption>
      </div>

      {error && (
        <div role="alert">
          <Notice tone="danger" title={error} />
        </div>
      )}

      <div className="sticky bottom-0 z-10 -mx-4 mt-1 flex flex-col gap-2 border-t border-border-subtle bg-surface px-4 pb-5 pt-3 sm:-mx-6 sm:px-6">
        <Button type="submit" variant="primary" size="lg" full disabled={pending}>
          {pending ? "Sending your review…" : "Submit review"}
        </Button>
      </div>
    </form>
  );
}
