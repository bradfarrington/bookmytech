import type { BrandIconProps } from "@/components/ui/brand-icons";
import {
  StarIcon,
  ShieldCheckIcon,
  CalendarBoltIcon,
  RosetteIcon,
} from "@/components/ui/brand-icons";

type Badge = {
  Icon: (p: BrandIconProps) => React.ReactElement;
  value: string;
  label: string;
};

const BADGES: Badge[] = [
  { Icon: StarIcon, value: "4.9 / 5", label: "Across 8,400+ reviews" },
  { Icon: ShieldCheckIcon, value: "DBS-checked", label: "Every mechanic vetted" },
  { Icon: CalendarBoltIcon, value: "Same-day", label: "Most jobs booked within 4 hrs" },
  { Icon: RosetteIcon, value: "12-month", label: "Parts & labour guarantee" },
];

export function TrustStrip() {
  return (
    <section className="border-b border-border bg-surface-card">
      <div className="mx-auto grid max-w-content gap-3 px-4 py-6 sm:grid-cols-2 sm:px-8 sm:py-7 lg:grid-cols-4">
        {BADGES.map(({ Icon, value, label }) => (
          <div
            key={value}
            className="group flex items-center gap-4 rounded-2xl border border-border bg-surface-card p-4 shadow-card transition-all hover:-translate-y-0.5 hover:border-brand-blue/40 sm:p-5"
          >
            <div className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-blue-50 ring-1 ring-inset ring-brand-blue/10 transition-colors group-hover:bg-blue-100">
              <Icon size={28} className="text-text-primary" />
            </div>
            <div className="min-w-0">
              <div className="text-lg font-extrabold leading-tight tracking-[-0.01em] text-text-primary">
                {value}
              </div>
              <div className="mt-0.5 text-[13px] leading-snug text-text-muted">
                {label}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
