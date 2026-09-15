import Link from "next/link";
import { Scale, ArrowRight } from "lucide-react";
import { DISPUTE_STATUS_LABELS, REASON_LABELS, type DisputeStatus } from "@/lib/disputes/constants";
import { formatJobNumber } from "@/lib/utils";
import { SectionHeading } from "./section-heading";

export interface DisputeSummary {
  id: string;
  status: DisputeStatus;
  reasonCategory: string;
  createdAt: string;
  jobNumber: number | null;
  repairDescription: string;
}

// Open disputes, surfaced on the dashboard itself.
//
// Before this the ONLY route to a dispute was scrolling to Past jobs, finding
// the disputed job among the completed ones, and clicking through. A dispute is
// the one thing on this page where the customer is waiting on US, so burying it
// below the history had it exactly backwards. Resolved cases stay out of the way
// on /dashboard/disputes.
export function DisputesPanel({ disputes }: { disputes: DisputeSummary[] }) {
  if (disputes.length === 0) return null;

  return (
    <section>
      <SectionHeading>
        {disputes.length === 1 ? "Your open dispute" : "Your open disputes"}
      </SectionHeading>

      <div className="flex flex-col gap-3">
        {disputes.map((d) => (
          <Link
            key={d.id}
            href={`/dashboard/disputes/${d.id}`}
            className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 transition-colors hover:border-amber-300 hover:bg-amber-100/60 sm:flex-nowrap"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
              <Scale size={18} />
            </span>

            <div className="min-w-[60%] flex-1">
              <p className="font-semibold text-text-primary">
                {d.repairDescription}
              </p>
              <p className="mt-0.5 text-sm text-text-secondary">
                {REASON_LABELS[d.reasonCategory] ?? d.reasonCategory}
                {d.jobNumber != null && <> · Job {formatJobNumber(d.jobNumber)}</>}
                {" · "}
                Raised{" "}
                {new Date(d.createdAt).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </p>
            </div>

            <span
              // The shared tones are built for a white card; on this amber one
              // the amber pill vanishes, so the panel supplies its own contrast.
              className="shrink-0 rounded-full border border-amber-300 bg-white px-2.5 py-1 text-xs font-semibold text-amber-800"
            >
              {DISPUTE_STATUS_LABELS[d.status]}
            </span>
            <ArrowRight size={16} className="shrink-0 text-text-muted" />
          </Link>
        ))}
      </div>

      <Link
        href="/dashboard/disputes"
        className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-blue hover:underline"
      >
        See all disputes
        <ArrowRight size={14} />
      </Link>
    </section>
  );
}
