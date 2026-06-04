"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MessageSquareReply } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Stars } from "@/components/ui/stars";
import { Button } from "@/components/ui/button";
import { respondToReview } from "@/app/actions/reviews";

export interface ReviewItem {
  id: string;
  rating: number;
  tags: string[];
  comment: string | null;
  mechanicResponse: string | null;
  createdAt: string;
  customerName: string;
}

const FILTERS = [
  { value: 0, label: "All" },
  { value: 5, label: "5★" },
  { value: 4, label: "4★" },
  { value: 3, label: "3★" },
  { value: 2, label: "2★" },
  { value: 1, label: "1★" },
] as const;

function firstName(name: string) {
  return name?.trim().split(/\s+/)[0] || "Customer";
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function ReviewsList({ reviews }: { reviews: ReviewItem[] }) {
  const [filter, setFilter] = useState<number>(0);

  const counts = useMemo(() => {
    const c: Record<number, number> = {};
    for (const r of reviews) c[r.rating] = (c[r.rating] ?? 0) + 1;
    return c;
  }, [reviews]);

  const shown = filter === 0 ? reviews : reviews.filter((r) => r.rating === filter);

  return (
    <div className="space-y-4">
      {/* Filter chips */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const disabled = f.value !== 0 && !counts[f.value];
          const active = filter === f.value;
          return (
            <button
              key={f.value}
              type="button"
              disabled={disabled}
              onClick={() => setFilter(f.value)}
              className={[
                "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "border-brand-blue bg-brand-blue text-white"
                  : "border-border bg-surface-card text-text-secondary hover:border-brand-blue",
                disabled ? "cursor-not-allowed opacity-40 hover:border-border" : "",
              ].join(" ")}
            >
              {f.label}
              {f.value !== 0 && counts[f.value] ? ` (${counts[f.value]})` : ""}
            </button>
          );
        })}
      </div>

      {shown.length === 0 ? (
        <Card className="p-8 text-center text-sm text-text-muted">
          No reviews to show for this filter.
        </Card>
      ) : (
        shown.map((r) => <ReviewRow key={r.id} review={r} />)
      )}
    </div>
  );
}

function ReviewRow({ review }: { review: ReviewItem }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [replying, setReplying] = useState(false);
  const [text, setText] = useState(review.mechanicResponse ?? "");

  function save() {
    startTransition(async () => {
      const res = await respondToReview(review.id, text);
      if (res.ok) {
        toast.success("Reply posted.");
        setReplying(false);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Card className="space-y-3 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-text-primary">{firstName(review.customerName)}</p>
          <Stars value={review.rating} size={15} className="mt-0.5" />
        </div>
        <span className="shrink-0 text-xs text-text-muted">{formatDate(review.createdAt)}</span>
      </div>

      {review.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {review.tags.map((t) => (
            <span
              key={t}
              className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-brand-blue"
            >
              {t}
            </span>
          ))}
        </div>
      )}

      {review.comment && (
        <p className="text-sm leading-relaxed text-text-secondary">{review.comment}</p>
      )}

      {/* Mechanic response */}
      {review.mechanicResponse && !replying && (
        <div className="rounded-xl border border-border-subtle bg-surface px-3.5 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-text-muted">
            Your reply
          </p>
          <p className="mt-1 text-sm text-text-secondary">{review.mechanicResponse}</p>
        </div>
      )}

      {replying ? (
        <div className="space-y-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder="Write a public reply…"
            className="w-full rounded-button border border-border bg-surface-card px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-brand-blue focus:outline-none"
          />
          <div className="flex gap-2">
            <Button size="sm" disabled={pending || !text.trim()} onClick={save}>
              {pending ? "Posting…" : "Post reply"}
            </Button>
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => setReplying(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          iconLeft={MessageSquareReply}
          onClick={() => setReplying(true)}
        >
          {review.mechanicResponse ? "Edit reply" : "Respond"}
        </Button>
      )}
    </Card>
  );
}
