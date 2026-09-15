import Link from "next/link";
import {
  Wrench,
  Search,
  Disc,
  BatteryCharging,
  Settings,
  ShieldCheck,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Reveal } from "@/components/ui/reveal";
import { SectionHeading } from "@/components/ui/section-heading";
import { cn } from "@/lib/utils";

// Static marketing preview of what can be booked. Repairs are HaynesPro jobs
// priced from the manufacturer's book time for the exact car; diagnostics,
// servicing and pre-purchase inspections are set-price products (Task 31).
// This shows the headline areas and sends people into the funnel, where the
// real per-vehicle prices live.
//
// "From" prices are only shown where a live product carries one: diagnostics
// (£59.99) and the Bronze inspection (£72.99), seeded in migration 0060. The
// servicing products are seeded inactive with placeholder prices, so they
// don't get a figure here until their prices are set.
const POPULAR_REPAIRS: {
  name: string;
  blurb: string;
  price: string;
  icon: LucideIcon;
  featured?: boolean;
}[] = [
  {
    name: "Diagnostics",
    blurb: "Warning lights, won't-starts and strange noises, found by a mechanic at your door.",
    price: "From £59.99",
    icon: Search,
    featured: true,
  },
  {
    name: "Servicing",
    blurb: "Interim, full and major services with the right oil for your engine.",
    price: "Priced for your car",
    icon: Wrench,
  },
  {
    name: "Pre-purchase inspection",
    blurb: "A Bronze, Silver or Gold check before you hand over the cash.",
    price: "From £72.99",
    icon: ShieldCheck,
  },
  {
    name: "Brakes",
    blurb: "Pads, discs, calipers and everything between.",
    price: "Priced for your car",
    icon: Disc,
  },
  {
    name: "Battery & charging",
    blurb: "Testing, replacement and alternators, sorted on your driveway.",
    price: "Priced for your car",
    icon: BatteryCharging,
  },
  {
    name: "Clutch & transmission",
    blurb: "Clutches, gearboxes and drivetrain.",
    price: "Priced for your car",
    icon: Settings,
  },
];

export function RepairsPreview() {
  return (
    <section id="repairs" className="scroll-mt-[68px] border-y border-border bg-white">
      <div className="mx-auto max-w-content px-4 py-14 sm:px-6 sm:py-[88px]">
        <SectionHeading
          align="left"
          eyebrow="What we do"
          title="Everything your car needs, without the garage."
          lead="Repairs are priced from the manufacturer's repair times for your exact car. Diagnostics and inspections come at set prices you'll see up front."
        />

        {/* Below 561px the grid becomes a horizontal scroll-snap carousel. */}
        <Reveal
          as="ul"
          stagger
          className={cn(
            "grid gap-4 min-[561px]:grid-cols-2 min-[900px]:grid-cols-3",
            "max-[560px]:-mx-4 max-[560px]:auto-cols-[78%] max-[560px]:grid-flow-col max-[560px]:overflow-x-auto max-[560px]:px-4 max-[560px]:pb-4 max-[560px]:pt-1",
            "max-[560px]:snap-x max-[560px]:snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          )}
        >
          {POPULAR_REPAIRS.map((r) => (
            <li key={r.name} className="h-full snap-start">
              <Link
                href="/book"
                aria-label={`Book ${r.name}`}
                className={cn(
                  "flex h-full items-start gap-3.5 rounded-[18px] border p-5 transition-[translate,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-brand-blue/35 hover:shadow-card",
                  r.featured
                    ? "border-brand-blue/35 bg-[linear-gradient(160deg,#eff6ff_0%,#fff_60%)]"
                    : "border-border bg-white",
                )}
              >
                <span
                  className={cn(
                    "flex size-11 shrink-0 items-center justify-center rounded-xl",
                    r.featured ? "bg-brand-blue text-white" : "bg-indigo-50 text-brand-blue",
                  )}
                >
                  <Icon icon={r.icon} size={20} strokeWidth={2} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-base font-bold text-text-primary">{r.name}</h3>
                    {r.featured && (
                      <span className="shrink-0 rounded-full bg-brand-blue px-2 py-[3px] text-[10px] font-extrabold uppercase tracking-[0.08em] text-white">
                        Most picked
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[13px] leading-[1.5] text-text-muted">{r.blurb}</p>
                  <p className="mt-2.5 inline-flex items-center gap-1 font-display text-[15px] font-extrabold text-brand-blue">
                    {r.price}
                    <Icon icon={ArrowRight} size={14} strokeWidth={2.5} />
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </Reveal>

        <div className="mt-10 flex justify-center">
          <Link href="/book">
            <Button
              variant="ghost"
              iconRight={ArrowRight}
              className="font-bold text-text-primary hover:border-text-primary hover:bg-transparent"
            >
              See prices for your car
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
