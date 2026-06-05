import Link from "next/link";
import { Star, ShieldAlert } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { RebookControl } from "./rebook-control";
import { STATUS_LABELS, type DashboardBooking, type MechanicLite } from "./types";

interface PastJobsProps {
  jobs: DashboardBooking[];
  mechanics: Record<string, MechanicLite>;
  ratedByBooking: Record<string, number>;
}

const DISPUTE_WINDOW_MS = 48 * 60 * 60 * 1000;

// Completed + cancelled history. Each completed job can be rebooked one-tap and
// — for 48 hours after completion — disputed. The dispute flow proper lands in
// Task 12; until then the button opens a pre-filled support email.
export function PastJobs({ jobs, mechanics, ratedByBooking }: PastJobsProps) {
  if (jobs.length === 0) return null;

  return (
    <section>
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-text-muted">
        Past jobs
      </h2>
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
          const inDisputeWindow =
            job.status === "completed" &&
            job.completedAt != null &&
            Date.now() - new Date(job.completedAt).getTime() < DISPUTE_WINDOW_MS;

          const disputeHref = `mailto:help@bookmytech.co.uk?subject=${encodeURIComponent(
            `Dispute — booking ${job.id.slice(0, 8).toUpperCase()}`,
          )}`;

          return (
            <div key={job.id} className="rounded-2xl border border-border bg-surface-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-text-primary">{job.serviceName}</p>
                  <p className="mt-0.5 text-sm text-text-muted">
                    {completedDate}
                    {mechanic ? ` · ${mechanic.name}` : ""}
                    {" · "}
                    {job.vehicleReg}
                  </p>
                  {rating ? (
                    <p className="mt-1 flex items-center gap-1 text-sm text-text-secondary">
                      <Star size={13} className="fill-amber-400 text-amber-400" />
                      You rated {rating}/5
                    </p>
                  ) : job.status === "completed" ? (
                    <Link href={`/review/${job.id}`} className="mt-1 inline-block text-sm font-medium text-brand-blue hover:underline">
                      Leave a review
                    </Link>
                  ) : null}
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-semibold text-text-primary">{formatPrice(job.totalPence)}</p>
                  <p className="text-xs text-text-muted">{STATUS_LABELS[job.status] ?? job.status}</p>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-end gap-3">
                {!cancelled && (
                  <RebookControl
                    reg={job.vehicleReg}
                    postcode={job.postcode}
                    serviceSlug={job.serviceSlug}
                    make={job.vehicleMake}
                    model={job.vehicleModel}
                    mechanicId={job.mechanicId}
                    mechanicName={mechanic?.name ?? null}
                  />
                )}
                {inDisputeWindow && (
                  <a
                    href={disputeHref}
                    className="inline-flex h-9 items-center gap-1.5 rounded-button border border-border px-3 text-sm font-medium text-text-secondary transition-colors hover:bg-surface"
                  >
                    <ShieldAlert size={15} />
                    Raise dispute
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
