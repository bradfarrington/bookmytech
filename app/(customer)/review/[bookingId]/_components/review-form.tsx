"use client";

import { useState, useTransition } from "react";
import { Star, CheckCircle, Loader2 } from "lucide-react";
import { submitReview } from "@/app/actions/reviews";

interface ReviewFormProps {
  bookingId: string;
  mechanicName: string;
  tags: readonly string[];
  // Pre-selected rating from a one-tap email link (?rating=N).
  initialRating?: number;
}

export function ReviewForm({ bookingId, mechanicName, tags, initialRating = 0 }: ReviewFormProps) {
  const [rating, setRating] = useState(initialRating);
  const [hover, setHover] = useState(0);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function toggleTag(tag: string) {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  }

  function submit() {
    setError(null);
    if (rating < 1) {
      setError("Tap a star to give your rating.");
      return;
    }
    startTransition(async () => {
      const res = await submitReview(bookingId, { rating, tags: selectedTags, comment });
      if (res.ok) setDone(true);
      else setError(res.error);
    });
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <div className="flex size-16 items-center justify-center rounded-full bg-green-50">
          <CheckCircle size={32} className="text-success" />
        </div>
        <h1 className="text-2xl font-bold text-text-primary">Thanks for your review</h1>
        <p className="text-text-secondary">
          Your feedback helps {mechanicName} and other customers. We appreciate it.
        </p>
      </div>
    );
  }

  const shown = hover || rating;

  return (
    <div className="flex flex-col gap-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-text-primary">How did {mechanicName} do?</h1>
        <p className="mt-1 text-text-secondary">Your feedback takes ten seconds.</p>
      </div>

      {/* Star picker */}
      <div className="flex justify-center gap-1.5" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            onClick={() => setRating(n)}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            className="rounded p-1 transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
          >
            <Star
              size={40}
              strokeWidth={1.5}
              className={n <= shown ? "fill-warning text-warning" : "fill-transparent text-border"}
            />
          </button>
        ))}
      </div>

      {/* Quick tags */}
      <div>
        <p className="mb-2 text-center text-xs font-semibold uppercase tracking-[0.04em] text-text-muted">
          What stood out? (optional)
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {tags.map((tag) => {
            const on = selectedTags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                className={[
                  "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                  on
                    ? "border-brand-blue bg-brand-blue text-white"
                    : "border-border bg-surface-card text-text-secondary hover:border-brand-blue",
                ].join(" ")}
              >
                {tag}
              </button>
            );
          })}
        </div>
      </div>

      {/* Comment */}
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={4}
        placeholder="Anything you'd like to add? (optional)"
        className="w-full rounded-button border border-border bg-surface-card px-3.5 py-3 text-sm text-text-primary placeholder:text-text-muted focus:border-brand-blue focus:outline-none"
      />

      {error && <p className="text-center text-sm text-red-600">{error}</p>}

      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="inline-flex h-12 items-center justify-center gap-2 rounded-button bg-brand-blue px-6 text-sm font-semibold text-white transition-colors hover:bg-brand-blue-dark disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending && <Loader2 size={16} className="animate-spin" />}
        {pending ? "Submitting…" : "Submit review"}
      </button>
    </div>
  );
}
