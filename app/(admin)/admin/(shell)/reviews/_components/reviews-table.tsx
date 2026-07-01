"use client";

import { useMemo, useState } from "react";
import { Link2 } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Stars } from "@/components/ui/stars";
import { Select } from "@/components/ui/select";

export interface AdminReviewRow {
  id: string;
  rating: number;
  tags: string[];
  comment: string | null;
  mechanicResponse: string | null;
  createdAt: string;
  mechanicId: string;
  bookingId: string;
  mechanicName: string;
  customerName: string;
}

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

type RatingFilter = "all" | "5" | "4" | "3" | "2" | "1";

const RATING_FILTER_OPTIONS: ReadonlyArray<{ value: RatingFilter; label: string }> = [
  { value: "all", label: "All ratings" },
  { value: "5", label: "5 stars" },
  { value: "4", label: "4 stars" },
  { value: "3", label: "3 stars" },
  { value: "2", label: "2 stars" },
  { value: "1", label: "1 star" },
];

export function ReviewsTable({ reviews }: { reviews: AdminReviewRow[] }) {
  const [ratingFilter, setRatingFilter] = useState<RatingFilter>("all");
  const [mechanicFilter, setMechanicFilter] = useState<string>("all");

  const mechanicOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const r of reviews) byId.set(r.mechanicId, r.mechanicName);
    const opts = Array.from(byId, ([value, label]) => ({ value, label })).sort(
      (a, b) => a.label.localeCompare(b.label),
    );
    return [{ value: "all", label: "All mechanics" }, ...opts];
  }, [reviews]);

  const filtered = useMemo(() => {
    return reviews.filter((r) => {
      if (ratingFilter !== "all" && r.rating !== Number(ratingFilter)) return false;
      if (mechanicFilter !== "all" && r.mechanicId !== mechanicFilter) return false;
      return true;
    });
  }, [reviews, ratingFilter, mechanicFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select<RatingFilter>
          value={ratingFilter}
          onChange={setRatingFilter}
          options={RATING_FILTER_OPTIONS}
          aria-label="Filter by rating"
          className="max-w-[180px]"
        />
        <Select<string>
          value={mechanicFilter}
          onChange={setMechanicFilter}
          options={mechanicOptions}
          aria-label="Filter by mechanic"
          className="max-w-[220px]"
        />
        <p className="text-sm text-text-muted">
          {filtered.length} of {reviews.length} reviews
        </p>
      </div>

      {filtered.length === 0 ? (
        <Card className="p-8 text-center text-sm text-text-muted">
          No reviews to show for these filters.
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-surface text-[11px] font-semibold uppercase tracking-[0.04em] text-text-muted">
                <tr>
                  <th className="px-5 py-3">Mechanic</th>
                  <th className="px-5 py-3">Rating</th>
                  <th className="px-5 py-3">Feedback</th>
                  <th className="px-5 py-3">Customer</th>
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {filtered.map((r) => (
                  <tr key={r.id} className="align-top hover:bg-surface/50">
                    <td className="px-5 py-3">
                      <span className="font-semibold text-text-primary">
                        {r.mechanicName}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <Stars value={r.rating} size={14} />
                    </td>
                    <td className="max-w-md px-5 py-3">
                      {r.tags.length > 0 && (
                        <div className="mb-1.5 flex flex-wrap gap-1.5">
                          {r.tags.map((t) => (
                            <span
                              key={t}
                              className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-brand-blue"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                      {r.comment ? (
                        <p className="text-sm leading-relaxed text-text-secondary">
                          {r.comment}
                        </p>
                      ) : (
                        r.tags.length === 0 && (
                          <span className="text-text-muted">—</span>
                        )
                      )}
                      {r.mechanicResponse && (
                        <p className="mt-1.5 inline-flex items-center gap-1 text-xs text-text-muted">
                          <Link2 size={12} />
                          Mechanic replied
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-3 text-text-secondary">
                      {firstName(r.customerName)}
                    </td>
                    <td className="px-5 py-3 text-text-muted">
                      {formatDate(r.createdAt)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link
                        href={`/admin/jobs/${r.bookingId}`}
                        className="text-sm font-semibold text-brand-blue hover:underline"
                      >
                        View job
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
