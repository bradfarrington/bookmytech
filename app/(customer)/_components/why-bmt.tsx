import type { BrandIconProps } from "@/components/ui/brand-icons";
import {
  ShieldCheckIcon,
  PoundCoinIcon,
  MapPinIcon,
  RosetteIcon,
} from "@/components/ui/brand-icons";
import { Overline } from "@/components/ui/overline";

type Pillar = {
  Icon: (p: BrandIconProps) => React.ReactElement;
  title: string;
  body: string;
};

const PILLARS: Pillar[] = [
  {
    Icon: ShieldCheckIcon,
    title: "Vetted mechanics",
    body: "Every mechanic is DBS-checked, insured, and holds a verified trade qualification before they take their first job.",
  },
  {
    Icon: PoundCoinIcon,
    title: "Transparent pricing",
    body: "See the total before you book. No call-out fees, no surprises on the invoice.",
  },
  {
    Icon: MapPinIcon,
    title: "Comes to you",
    body: "Home, office or roadside — we work wherever your car is. No waiting rooms, no taxis to a garage.",
  },
  {
    Icon: RosetteIcon,
    title: "12-month guarantee",
    body: "Every job covered for a full year on parts and labour. If it goes wrong, we put it right.",
  },
];

export function WhyBmt() {
  return (
    <section className="bg-surface-card border-y border-border">
      <div className="mx-auto max-w-content px-4 py-14 sm:px-8 lg:py-[56px]">
        <div className="mx-auto mb-10 max-w-[640px] text-center">
          <Overline className="mb-2 text-brand-blue">Why Book My Tech</Overline>
          <h2 className="text-[32px] font-extrabold leading-tight tracking-[-0.025em] text-text-primary sm:text-[40px]">
            Built for drivers who&apos;d rather be anywhere else.
          </h2>
        </div>

        <ul className="grid gap-x-10 gap-y-8 md:grid-cols-2 md:gap-x-16">
          {PILLARS.map((p) => (
            <li key={p.title} className="flex items-start gap-4">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 ring-1 ring-inset ring-brand-blue/10">
                <p.Icon size={24} className="text-text-primary" />
              </div>
              <div>
                <h3 className="mb-1 text-lg font-bold tracking-[-0.01em] text-text-primary">
                  {p.title}
                </h3>
                <p className="text-[15px] leading-[1.55] text-text-secondary">
                  {p.body}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
