import Link from "next/link";
import { Check, Disc, Droplet, Radio, ShieldCheck, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Reveal } from "@/components/ui/reveal";
import { SectionHeading } from "@/components/ui/section-heading";
import { SectionWatermark } from "@/components/ui/section-watermark";

// An illustrative quote, labelled as an example on the card. The figures are
// internally consistent: each line is its parts plus book hours at £58/hr, and
// the lines sum to the total. There is deliberately no named mechanic — dispatch
// is broadcast, first to accept, and the customer never picks.
const LINES: { icon: LucideIcon; title: string; detail: string; price: string }[] = [
  {
    icon: Disc,
    title: "Front brake pads & discs",
    detail: "1.4 hrs book time · parts for this exact car",
    price: "£233.60",
  },
  {
    icon: Droplet,
    title: "Brake fluid change",
    detail: "0.6 hrs book time · fluid to the manufacturer's spec",
    price: "£46.80",
  },
];

const TOTALS = [
  { label: "Parts", value: "£164.40" },
  { label: "Labour (2.0 hrs)", value: "£116.00" },
] as const;

export function QuoteShowcase() {
  return (
    // Pale blue band: sits between the white ticker and the white how-it-works
    // timeline so the sections read as distinct.
    <section className="relative overflow-hidden border-y border-blue-100 bg-[linear-gradient(180deg,#eff6ff_0%,#e0ebff_100%)]">
      <SectionWatermark />
      <div className="relative mx-auto max-w-content px-4 py-14 sm:px-6 sm:py-[88px]">
        <SectionHeading
          eyebrow="The price you see"
          title="Is the price you pay."
          lead="Repairs are priced from the manufacturer's own repair times for your exact car: parts, labour and call-out in one figure, shown before you book."
        />

        <Reveal className="mx-auto max-w-[980px] overflow-hidden rounded-3xl border border-border bg-white shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border-subtle bg-[linear-gradient(180deg,#f8fafc,#fff)] px-5 py-[22px] sm:px-[26px]">
            <div className="flex min-w-0 items-center gap-3.5">
              <span className="shrink-0 rounded-md border-2 border-surface-dark bg-plate-yellow px-2.5 py-1.5 font-['Arial_Black',sans-serif] text-[15px] font-black tracking-[0.06em] text-[#1a1a1a]">
                AB12 CDE
              </span>
              <div className="min-w-0">
                <p className="text-base font-extrabold text-text-primary">
                  2019 Volkswagen Golf 1.5 TSI
                </p>
                <p className="text-xs text-text-muted">Example quote</p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1.5 text-xs font-bold text-green-700">
              <Icon icon={Check} size={12} strokeWidth={3} />
              Priced for this car
            </span>
          </div>

          <div className="grid min-[821px]:grid-cols-[1.15fr_1fr]">
            <div className="border-b border-border-subtle px-5 py-6 sm:px-[26px] min-[821px]:border-b-0 min-[821px]:border-r">
              <h3 className="mb-3.5 text-xs font-bold uppercase tracking-[0.1em] text-text-muted">
                Your job
              </h3>
              <ul>
                {LINES.map((line) => (
                  <li
                    key={line.title}
                    className="grid grid-cols-[32px_1fr_auto] items-center gap-3 border-b border-dashed border-border-subtle py-3 last:border-b-0"
                  >
                    <span className="flex size-8 items-center justify-center rounded-lg bg-indigo-50 text-brand-blue">
                      <Icon icon={line.icon} size={16} strokeWidth={2} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-text-primary">{line.title}</p>
                      <p className="mt-0.5 text-xs text-text-muted">{line.detail}</p>
                    </div>
                    <p className="font-display text-base font-extrabold text-text-primary">
                      {line.price}
                    </p>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-col gap-4 bg-[linear-gradient(180deg,#f8fafc,#eef2ff)] px-5 py-6 sm:px-[26px]">
              {TOTALS.map((row) => (
                <div
                  key={row.label}
                  className="flex items-baseline justify-between text-sm text-text-secondary"
                >
                  <span>{row.label}</span>
                  <span className="font-semibold text-text-primary">{row.value}</span>
                </div>
              ))}
              <div className="flex items-baseline justify-between text-sm text-text-secondary">
                <span>Call-out</span>
                <span className="font-bold text-success">Included</span>
              </div>
              <div className="flex items-baseline justify-between border-t border-border pt-3.5 font-display text-[28px] font-extrabold tracking-[-0.02em] text-text-primary">
                <span className="font-sans text-sm font-bold tracking-normal text-text-secondary">
                  Total
                </span>
                £280.40
              </div>

              <p className="flex items-start gap-2 text-[13px] leading-[1.5] text-text-secondary">
                <Icon icon={ShieldCheck} size={16} className="mt-0.5 shrink-0 text-brand-blue" />
                Your card is pre-authorised, not charged. If your mechanic finds more
                work, nothing extra is done until you approve it.
              </p>

              <div className="flex items-center gap-3 rounded-2xl border border-border bg-white p-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-blue text-white">
                  <Icon icon={Radio} size={18} strokeWidth={2} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-text-primary">
                    Sent to vetted mechanics near you
                  </p>
                  <p className="text-xs text-text-muted">The first to accept takes the job.</p>
                </div>
                <Link href="/book" className="shrink-0">
                  <Button variant="primary" className="font-bold">
                    Book
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
