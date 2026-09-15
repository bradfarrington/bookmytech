import { Fragment } from "react";
import { Award, ShieldCheck, Users, Zap, type LucideIcon } from "lucide-react";
import { Icon } from "@/components/ui/icon";

type TickerItem = { icon?: LucideIcon; value: string; label: string };

// The figures the trust strip carried before the Task 46 redesign. Keep them in
// step with the hero badge.
const ITEMS: TickerItem[] = [
  { value: "4.9 / 5", label: "across 8,400+ reviews" },
  { icon: ShieldCheck, value: "DBS-checked", label: "every mechanic vetted" },
  { icon: Zap, value: "Same-day", label: "most jobs booked within 4 hrs" },
  { icon: Award, value: "12-month", label: "parts & labour guarantee" },
  { icon: Users, value: "1,200+ mechanics", label: "across the UK" },
];

// Full-bleed marquee. The items are rendered twice and the row slides by -50%,
// so each item carries its own trailing space (padding, not flex gap) to keep
// the two halves exactly equal and the loop seamless.
export function TrustTicker() {
  return (
    <section
      aria-label="Why drivers trust Book My Tech"
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
                  {item.icon ? (
                    <Icon icon={item.icon} size={18} strokeWidth={2} className="text-brand-blue" />
                  ) : (
                    <span aria-hidden className="text-[15px] tracking-[1px] text-warning">
                      ★★★★★
                    </span>
                  )}
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
