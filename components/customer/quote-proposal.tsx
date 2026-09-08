import Link from "next/link";
import { BadgePoundSterling, ChevronRight } from "lucide-react";
import { formatPrice } from "@/lib/utils";

// Shown to the customer when their mechanic has sent a quote (Task 33) —
// on the active booking card, every upcoming row and the confirmation page,
// the same way a proposed reschedule is. Links to the approval page, which is
// signed-in only (approving authorises money on a card).

export interface PendingQuoteSummary {
  id: string;
  totalPence: number;
  kind: "now" | "follow_on" | "reduction";
  title: string | null;
}

export function QuoteProposal({ quote, compact = false }: { quote: PendingQuoteSummary; compact?: boolean }) {
  return (
    <Link
      href={`/dashboard/quotes/${quote.id}`}
      className={`flex items-center gap-3 rounded-2xl border border-brand-blue/40 bg-blue-50 transition-colors hover:border-brand-blue ${compact ? "p-3.5" : "p-4"}`}
    >
      <BadgePoundSterling size={compact ? 18 : 20} className="shrink-0 text-brand-blue" />
      <div className="min-w-0 flex-1">
        <p className={`font-semibold text-text-primary ${compact ? "text-sm" : ""}`}>
          Your mechanic has sent a quote for {formatPrice(quote.totalPence)}
        </p>
        <p className="mt-0.5 text-xs text-text-secondary">
          {quote.title ? `${quote.title} · ` : ""}
          {quote.kind === "follow_on" ? "A return visit" : "Extra work on this job"} — review and approve, or decline.
          Nothing is charged until you approve.
        </p>
      </div>
      <ChevronRight size={16} className="shrink-0 text-brand-blue" />
    </Link>
  );
}
