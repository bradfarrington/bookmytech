import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ArrowRight, CheckCircle2, MapPin, PoundSterling, CalendarClock } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { Button } from "@/components/ui/button";

// Public, area-specific mechanic-recruitment landing page. Read via the
// service-role client so PLANNED areas (is_active=false, not visible to anon
// RLS) can still recruit ahead of launch. The Apply CTA carries ?area=<slug>
// so the submitted application is tagged to this area.

interface AreaRecruit {
  id: string;
  name: string;
  slug: string;
  status: string;
  recruitment_headline: string | null;
  recruitment_blurb: string | null;
}

async function loadArea(slug: string): Promise<AreaRecruit | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("areas")
    .select("id, name, slug, status, recruitment_headline, recruitment_blurb")
    .eq("slug", slug)
    .maybeSingle();
  // Paused areas don't actively recruit; planned + active do.
  if (!data || data.status === "paused") return null;
  return data as AreaRecruit;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ "area-slug": string }>;
}): Promise<Metadata> {
  const { "area-slug": slug } = await params;
  const area = await loadArea(slug);
  if (!area) return { title: "Become a Book My Tech mechanic" };
  return {
    title: `Become a Book My Tech mechanic in ${area.name}`,
    description:
      area.recruitment_blurb ??
      `Join Book My Tech as a vetted mobile mechanic in ${area.name}. Set your own area, get matched to jobs near you.`,
  };
}

const BENEFITS = [
  { icon: PoundSterling, title: "Keep more of every job", detail: "Transparent fixed pricing, fast payouts — no chasing invoices." },
  { icon: CalendarClock, title: "Work on your terms", detail: "Set your hours, your radius and your specialisms. Accept the jobs that suit you." },
  { icon: MapPin, title: "Jobs near you", detail: "We match you to bookings in your area and bring the customers to you." },
];

export default async function AreaRecruitmentPage({
  params,
}: {
  params: Promise<{ "area-slug": string }>;
}) {
  const { "area-slug": slug } = await params;
  const area = await loadArea(slug);
  if (!area) notFound();

  const headline = area.recruitment_headline ?? `Become a Book My Tech mechanic in ${area.name}`;
  const blurb =
    area.recruitment_blurb ??
    `We're growing our network of vetted mobile mechanics in ${area.name}. Apply in minutes, set your own area and hours, and start getting matched to jobs near you.`;
  const applyHref = `/mechanics/apply/step-1?area=${encodeURIComponent(area.slug)}`;

  return (
    <div className="min-h-screen bg-surface">
      <header className="border-b border-border bg-surface-card">
        <div className="mx-auto flex max-w-content items-center justify-between px-4 py-3">
          <Link href="/" aria-label="Book My Tech — home">
            <Image src="/logo-no-bg.png" alt="Book My Tech" width={120} height={32} className="h-8 w-auto" />
          </Link>
          <Link href={applyHref} className="text-sm font-semibold text-brand-blue hover:underline">
            Apply now
          </Link>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="bg-brand-gradient px-4 py-16 text-white sm:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide">
              <MapPin size={13} /> {area.name}
              {area.status === "planned" && <span className="ml-1 rounded bg-white/20 px-1.5">Launching soon</span>}
            </span>
            <h1 className="mt-4 text-4xl font-extrabold tracking-tight sm:text-5xl">{headline}</h1>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-blue-100">{blurb}</p>
            <div className="mt-8 flex justify-center">
              <Link href={applyHref}>
                <Button variant="secondary" size="lg" iconRight={ArrowRight}>
                  Start your application
                </Button>
              </Link>
            </div>
            <p className="mt-3 text-sm text-blue-200">Takes about 10 minutes · vetted in days</p>
          </div>
        </section>

        {/* Benefits */}
        <section className="mx-auto max-w-content px-4 py-16">
          <div className="grid gap-6 sm:grid-cols-3">
            {BENEFITS.map((b) => (
              <div key={b.title} className="rounded-2xl border border-border bg-surface-card p-6 shadow-card">
                <div className="flex size-11 items-center justify-center rounded-xl bg-blue-50 text-brand-blue">
                  <b.icon size={22} />
                </div>
                <h2 className="mt-4 text-lg font-bold text-text-primary">{b.title}</h2>
                <p className="mt-1.5 text-sm text-text-secondary">{b.detail}</p>
              </div>
            ))}
          </div>

          {/* What you need */}
          <div className="mx-auto mt-12 max-w-2xl rounded-2xl border border-border bg-surface-card p-6 shadow-card">
            <h2 className="text-lg font-bold text-text-primary">What you&apos;ll need to apply</h2>
            <ul className="mt-4 space-y-2.5">
              {[
                "Photo ID",
                "Public liability + trade insurance",
                "A recognised trade qualification",
                "Two references",
              ].map((item) => (
                <li key={item} className="flex items-center gap-2.5 text-sm text-text-secondary">
                  <CheckCircle2 size={18} className="shrink-0 text-success" />
                  {item}
                </li>
              ))}
            </ul>
            <div className="mt-6">
              <Link href={applyHref}>
                <Button variant="primary" size="lg" fullWidth iconRight={ArrowRight}>
                  Apply to work in {area.name}
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
