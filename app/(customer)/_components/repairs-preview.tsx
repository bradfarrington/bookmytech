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
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Overline } from "@/components/ui/overline";
import { Pill } from "@/components/ui/pill";
import { Reveal } from "@/components/ui/reveal";
import { cn } from "@/lib/utils";

// Static marketing preview of what can be booked. There's no services
// catalogue any more — every booking is a HaynesPro repair priced from the
// manufacturer's book time for the exact car — so this shows popular repair
// areas and sends people into the funnel, where real per-vehicle prices live.
const POPULAR_REPAIRS: {
  name: string;
  blurb: string;
  icon: LucideIcon;
  featured?: boolean;
}[] = [
  { name: "Diagnostics", blurb: "Warning lights and faults, found fast", icon: Search, featured: true },
  { name: "Brakes", blurb: "Pads, discs and everything between", icon: Disc },
  { name: "Battery & charging", blurb: "Testing, replacement and alternators", icon: BatteryCharging },
  { name: "Clutch & transmission", blurb: "Clutches, gearboxes and drivetrain", icon: Settings },
  { name: "Servicing & maintenance", blurb: "Oil, filters and scheduled work", icon: Wrench },
  { name: "MOT prep", blurb: "Checks and fixes before the test", icon: ShieldCheck },
];

export function RepairsPreview() {
  return (
    <section id="repairs" className="bg-surface">
      <div className="mx-auto max-w-content px-4 py-14 sm:px-8 lg:py-[56px]">
        <Reveal className="mx-auto mb-9 max-w-[600px] text-center">
          <Overline className="mb-2 text-brand-blue">Repairs</Overline>
          <h2 className="mb-2 text-[32px] font-extrabold leading-tight tracking-[-0.025em] text-text-primary sm:text-[40px]">
            Priced for your exact car.
          </h2>
          <p className="text-base text-text-secondary">
            Enter your reg and browse every repair we can do on your car — each
            one priced up front from the manufacturer&apos;s own repair times.
          </p>
        </Reveal>

        <Reveal as="ul" stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {POPULAR_REPAIRS.map((r) => (
            <li key={r.name} className="h-full">
              <Link href="/book" className="block h-full" aria-label={`Book ${r.name}`}>
                <Card
                  className={cn(
                    "flex h-full items-start gap-3.5 transition-all hover:-translate-y-0.5 hover:border-brand-blue/50",
                    r.featured && "border-brand-blue bg-blue-50",
                  )}
                >
                  <div
                    className={cn(
                      "flex size-11 shrink-0 items-center justify-center rounded-xl",
                      r.featured ? "bg-brand-blue" : "bg-blue-50",
                    )}
                  >
                    <Icon
                      icon={r.icon}
                      size={20}
                      className={r.featured ? "text-white" : "text-brand-blue"}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-base font-bold tracking-[-0.01em] text-text-primary">
                        {r.name}
                      </h3>
                      {r.featured && <Pill tone="accent">Most picked</Pill>}
                    </div>
                    <p className="mt-1 text-[13px] text-text-muted">{r.blurb}</p>
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </Reveal>

        <div className="mt-9 flex justify-center">
          <Link
            href="/book"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-blue transition-colors hover:text-brand-blue-dark"
          >
            See prices for your car
            <Icon icon={ArrowRight} size={16} />
          </Link>
        </div>
      </div>
    </section>
  );
}
