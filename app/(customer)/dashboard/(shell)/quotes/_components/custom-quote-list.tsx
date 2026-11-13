import { FileText } from "lucide-react";
import { ListCard, ListRow, StatusPill, type PillTone } from "@/components/dashboard/ui";
import type { CustomQuoteStatus, CustomQuoteView } from "@/lib/custom-quotes/model";
import { describeQuoteVehicle } from "@/lib/custom-quotes/href";
import { formatPrice } from "@/lib/utils";

// The customer's custom quotes (Task 75) as dashboard rows. Each opens the
// quote's own page (/book/quote/<id>), where it's booked or declined.

const TONE: Record<CustomQuoteStatus, PillTone> = {
  requested: "pending",
  sent: "active",
  booked: "success",
  declined: "neutral",
  withdrawn: "neutral",
};

export function CustomQuoteList({ quotes }: { quotes: CustomQuoteView[] }) {
  return (
    <ListCard>
      {quotes.map((q) => (
        <ListRow
          key={q.id}
          href={`/book/quote/${q.id}`}
          icon={FileText}
          tone={q.status === "sent" ? "solid" : "brand"}
          title={q.title ?? q.request ?? "Your quote request"}
          caption={[
            describeQuoteVehicle(q.vehicle.reg, q.vehicle.make, q.vehicle.model),
            q.totalPence != null ? formatPrice(q.totalPence) : null,
          ]
            .filter(Boolean)
            .join(" · ")}
          trailing={<StatusPill tone={TONE[q.status]}>{q.statusLabel}</StatusPill>}
          titleClassName="line-clamp-2"
        />
      ))}
    </ListCard>
  );
}

/** Quotes the customer still has something to do with, or is waiting on. */
export const openQuotes = (quotes: CustomQuoteView[]): CustomQuoteView[] =>
  quotes.filter((q) => q.status === "sent" || q.status === "requested");
