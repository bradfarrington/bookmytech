import Link from "next/link";
import { Star, ShieldAlert, Scale } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { RebookControl } from "./rebook-control";
import { SectionHeading } from "./section-heading";
import { STATUS_LABELS, STATUS_TONES, type DashboardBooking, type MechanicLite } from "./types";

interface PastJobsProps {
  jobs: DashboardBooking[];
  mechanics: Record<string, MechanicLite>;
  ratedByBooking: Record<string, number>;
  /** booking id → its dispute (if one exists). */
  disputes: Record<string, { id: string; status: string }>;
}

const DISPUTE_WINDOW_MS = 48 * 60 * 60 * 1000;

// Completed / cancelled / disputed history. Each non-cancelled job can be
// rebooked one-tap; completed jobs can be disputed for 48h, and a job with an
// open dispute links straight to its case.
export function PastJobs({ jobs, mechanics, ratedByBooking, disputes }: PastJobsProps) {
  if (jobs.length === 0) return null;

  return (
    // The rule is the boundary between "things that still need you" above and
    // finished history below. Without it the two ran together as one long list.
    <section className="border-t border-border pt-8">
      <SectionHeading count={jobs.length}>Past jobs</SectionHeading>
      <div className="flex flex-col gap-3">
        {jobs.map((job) => {
          const mechanic = job.mechanicId ? mechanics[job.mechanicId] ?? null : null;
          const rating = ratedByBooking[job.id];
          const completedDate = (job.completedAt ?? job.scheduledAt)
            ? new Date(job.completedAt ?? job.scheduledAt!).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })
            : "—";
          const cancelled = job.status === "cancelled";
          const dispute = disputes[job.id];
          const inDisputeWindow =
            job.status === "completed" &&
            job.completedAt != null &&
            Date.now() - new Date(job.completedAt).getTime() < DISPUTE_WINDOW_MS;

          // One action node, placed inside RebookControl's button row (or on its
          // own for a cancelled job, which can't be rebooked).
          const disputeAction = dispute ? (
            <Link
              href={`/dashboard/disputes/${dispute.id}`}
              className="inline-flex h-9 items-center gap-1.5 rounded-button border border-border px-3.5 text-sm font-medium text-text-secondary transition-colors hover:border-text-muted hover:bg-surface"
            >
              <Scale size={15} />
              View dispute
            </Link>
          ) : inDisputeWindow ? (
            <Link
              href={`/dashboard/disputes/new/${job.id}`}
              className="inline-flex h-9 items-center gap-1.5 rounded-button border border-border px-3.5 text-sm font-medium text-text-secondary transition-colors hover:border-text-muted hover:bg-surface"
            >
              <ShieldAlert size={15} />
              Raise dispute
            </Link>
          ) : null;

          const hasActions = !cancelled || disputeAction !== null;

          return (
            <div
              key={job.id}
              className="overflow-hidden rounded-2xl border border-border bg-surface-card transition-colors hover:border-text-disabled"
            >
              <div className="flex items-start justify-between gap-4 p-4">
                <div className="min-w-0">
                  <p className="font-semibold leading-snug text-text-primary">
                    {job.repairDescription}
                  </p>
                  <p className="mt-1 text-sm text-text-muted">
                    {completedDate}
                    {mechanic ? ` · ${mechanic.name}` : ""}
                    {" · "}
                    {job.vehicleReg}
                  </p>

                  {rating ? (
                    <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
                      <Star size={12} className="fill-amber-400 text-amber-400" />
                      You rated {rating}/5
                    </p>
                  ) : job.status === "completed" ? (
                    <Link
                      href={`/review/${job.id}`}
                      className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-blue hover:underline"
                    >
                      <Star size={14} />
                      Leave a review
                    </Link>
                  ) : null}
                </div>

                {/* Price leads, status sits under it as a pill — the same pill
                    the upcoming cards use, so a job reads the same way wherever
                    it appears on the page. */}
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <p className="text-lg font-bold leading-none text-text-primary">
                    {formatPrice(job.totalPence)}
                  </p>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      STATUS_TONES[job.status] ?? "bg-surface text-text-secondary"
                    }`}
                  >
                    {STATUS_LABELS[job.status] ?? job.status}
                  </span>
                </div>
              </div>

              {/* Actions live in their own tinted footer, separated by a rule.
                  Before this they ran straight on from the body with no divider,
                  so the tickbox floated between two buttons and belonged to
                  neither. */}
              {hasActions && (
                <div className="border-t border-border bg-surface/60 px-4 py-3">
                  {cancelled ? (
                    <div className="flex flex-wrap items-center gap-2">{disputeAction}</div>
                  ) : (
                    <RebookControl
                      reg={job.vehicleReg}
                      postcode={job.postcode}
                      repairNodeId={job.repairNodeId}
                      make={job.vehicleMake}
                      model={job.vehicleModel}
                      mechanicId={job.mechanicId}
                      mechanicName={mechanic?.name ?? null}
                    >
                      {disputeAction}
                    </RebookControl>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
