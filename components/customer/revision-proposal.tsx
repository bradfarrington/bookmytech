import Link from "next/link";
import { ArrowRightLeft, ChevronRight } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { differenceLabel } from "@/lib/revisions/diff";

// Shown to the customer when their mechanic has revised the job on site
// (Task 37) — on the active booking card, every upcoming row and the
// confirmation page, the same way a quote is. Links to the approval page,
// which is signed-in only.

export interface PendingRevisionSummary {
  id: string;
  afterTotalPence: number;
  differencePence: number;
  repairDescription: string;
}

export function RevisionProposal({ revision, compact = false }: { revision: PendingRevisionSummary; compact?: boolean }) {
  return (
    <Link
      href={`/dashboard/revisions/${revision.id}`}
      className={`flex items-center gap-3 rounded-2xl border border-amber-400/60 bg-amber-50 transition-colors hover:border-amber-500 ${compact ? "p-3.5" : "p-4"}`}
    >
      <ArrowRightLeft size={compact ? 18 : 20} className="shrink-0 text-amber-700" />
      <div className="min-w-0 flex-1">
        <p className={`font-semibold text-text-primary ${compact ? "text-sm" : ""}`}>
          Your mechanic has revised the job — {formatPrice(revision.afterTotalPence)} ({differenceLabel(revision.differencePence)})
        </p>
        <p className="mt-0.5 text-xs text-text-secondary">
          {revision.repairDescription} — the repair you booked isn&apos;t what your car needs. Review and approve, or decline. Nothing changes until you do.
        </p>
      </div>
      <ChevronRight size={16} className="shrink-0 text-amber-700" />
    </Link>
  );
}
