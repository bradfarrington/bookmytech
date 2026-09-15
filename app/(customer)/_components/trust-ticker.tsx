import { Fragment } from "react";
import {
  Award,
  Clock,
  CreditCard,
  Gauge,
  ShieldCheck,
  ThumbsUp,
  type LucideIcon,
} from "lucide-react";
import { Icon } from "@/components/ui/icon";

type TickerItem = { icon: LucideIcon; value: string; label: string };

// Only claims the product and the customer terms back up. No invented counts or
// ratings. The evidence for each:
//   vetted:      terms "Book My Tech vets every mechanic before they are onboarded"
//   warranty:    terms, 12 months or 12,000 miles on eligible parts and labour
//   pre-auth:    manual-capture PaymentIntent, captured when the job completes
//   approval:    extra work needs the customer's approval (quotes, revisions)
//   book times:  repairs priced from manufacturer repair times (lib/haynespro)
//   windows:     2-hour arrival windows, 8am to 8pm, 60-minute minimum lead (lib/slots.ts)
// DBS checks were removed from the platform: never claim them.
const ITEMS: TickerItem[] = [
  { icon: ShieldCheck, value: "Vetted mechanics", label: "checked before they join" },
  { icon: Award, value: "12-month warranty", label: "on eligible parts and labour" },
  { icon: CreditCard, value: "Nothing charged upfront", label: "paid when the job's done" },
  { icon: ThumbsUp, value: "Your approval first", label: "for any extra work" },
  { icon: Gauge, value: "Manufacturer repair times", label: "priced for your exact car" },
  { icon: Clock, value: "2-hour arrival windows", label: "8am to 8pm" },
];

// Full-bleed marquee. The items are rendered twice and the row slides by -50%,
// so each item carries its own trailing space (padding, not flex gap) to keep
// the two halves exactly equal and the loop seamless.
export function TrustTicker() {
  return (
    <section
      aria-label="Why drivers book with Book My Tech"
      className="overflow-hidden border-b border-border bg-white py-[18px]"
    >
      <ul className="flex w-max animate-ticker items-center whitespace-nowrap motion-reduce:animate-none">
        {[0, 1].map((copy) => (
          <Fragment key={copy}>
            {ITEMS.map((item) => (
              <li
                key={`${copy}-${item.value}`}
                aria-hidden={copy === 1 || undefined}
                className="flex items-center gap-14 pr-14"
              >
                <span className="inline-flex items-center gap-3 text-sm font-bold text-text-primary">
                  <Icon icon={item.icon} size={18} strokeWidth={2} className="text-brand-blue" />
                  <span>{item.value}</span>
                  <span className="font-medium text-text-muted">{item.label}</span>
                </span>
                <span aria-hidden className="size-[5px] shrink-0 rounded-full bg-text-disabled" />
              </li>
            ))}
          </Fragment>
        ))}
      </ul>
    </section>
  );
}
