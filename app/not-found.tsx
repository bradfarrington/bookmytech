import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, LifeBuoy, Wrench, LayoutDashboard, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

// Branded 404 for any URL that matches no route, plus anything that calls
// notFound(). It renders inside app/layout.tsx, so Inter and the design tokens
// are available — unlike global-error.tsx, which replaces that layout.
//
// Deliberately NOT the hero's <RegLookupForm />: submitting it spends money
// (DVLA VES + DVSA MOT are billed per call) and 404s are exactly what crawlers
// and scanners hit. The useful destinations are links instead.

export const metadata: Metadata = {
  title: "Page not found — Book My Tech",
  robots: { index: false, follow: true },
};

const DESTINATIONS = [
  {
    href: "/",
    icon: Home,
    label: "Home",
    detail: "How Book My Tech works and what we charge.",
  },
  {
    href: "/dashboard",
    icon: LayoutDashboard,
    label: "Your bookings",
    detail: "Track a job, reschedule, or look back at past repairs.",
  },
  {
    href: "/help",
    icon: LifeBuoy,
    label: "Help centre",
    detail: "Answers on booking, pricing, payments and guarantees.",
  },
  {
    href: "/mechanics",
    icon: Wrench,
    label: "For mechanics",
    detail: "Join the network and get matched to jobs near you.",
  },
] as const;

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-16 sm:py-24">
      <div className="w-full max-w-2xl">
        <div className="text-center">
          <Link href="/" aria-label="Book My Tech home" className="inline-block">
            <Image
              src="/logo-no-bg.png"
              alt="Book My Tech"
              width={180}
              height={60}
              className="mx-auto h-14 w-auto"
            />
          </Link>

          <p className="mt-8 text-[13px] font-bold uppercase tracking-[0.12em] text-brand-blue">
            Error 404
          </p>
          <h1 className="mt-2.5 text-[32px] font-extrabold leading-[1.08] tracking-[-0.025em] text-text-primary sm:text-[40px]">
            We couldn&apos;t find that page
          </h1>
          <p className="mx-auto mt-3 max-w-md text-base leading-[1.6] text-text-secondary">
            The link may be out of date, or the page may have moved. Everything
            still works — here&apos;s the way back.
          </p>

          <div className="mt-7">
            <Link href="/book">
              <Button size="lg" iconRight={ArrowRight}>
                Book a repair
              </Button>
            </Link>
          </div>
        </div>

        <nav aria-label="Suggested pages" className="mt-12">
          <ul className="grid gap-3 sm:grid-cols-2">
            {DESTINATIONS.map(({ href, icon: LinkIcon, label, detail }) => (
              <li key={href}>
                <Link
                  href={href}
                  className="flex h-full gap-3 rounded-2xl border border-border bg-surface-card p-4 shadow-card transition-colors hover:border-brand-blue/40 hover:bg-blue-50/40"
                >
                  <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-brand-blue">
                    <LinkIcon size={18} />
                  </span>
                  <span>
                    <span className="block text-sm font-bold text-text-primary">
                      {label}
                    </span>
                    <span className="mt-0.5 block text-[13px] leading-[1.5] text-text-muted">
                      {detail}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <p className="mt-10 text-center text-sm text-text-muted">
          Looking for something specific?{" "}
          <a
            href="mailto:support@bookmytech.co.uk"
            className="font-semibold text-brand-blue hover:underline"
          >
            support@bookmytech.co.uk
          </a>
        </p>
      </div>
    </main>
  );
}
