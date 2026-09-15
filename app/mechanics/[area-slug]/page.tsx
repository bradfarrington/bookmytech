import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CustomerNav } from "@/components/ui/customer-nav";
import { FactTicker } from "@/components/ui/fact-ticker";
import { Icon } from "@/components/ui/icon";
import { Reveal } from "@/components/ui/reveal";
import { createAdminClient } from "@/lib/supabase/admin";
import { Footer } from "../../(customer)/_components/footer";
import { MECHANIC_FACTS, applyHref } from "../_components/recruitment";
import {
  MechanicBenefits,
  MechanicFinalCta,
  MechanicHowItWorks,
  MechanicRequirements,
} from "../_components/sections";

// Public, area-specific mechanic-recruitment landing page. Read via the
// service-role client so PLANNED areas (is_active=false, not visible to anon
// RLS) can still recruit ahead of launch. The Apply CTA carries ?area=<slug>
// so the submitted application is tagged to this area.
//
// Task 46: the shared nav and footer and the same sections as /mechanics
// (app/mechanics/_components), with the area's own headline in the hero.

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
  const href = applyHref(area.slug);

  return (
    <>
      <CustomerNav active="For mechanics" />
      <main>
        <section className="relative overflow-hidden bg-brand-gradient-deep text-white">
          <div aria-hidden className="hero-glow pointer-events-none absolute inset-0" />
          <div className="relative mx-auto max-w-[860px] px-4 pb-[72px] pt-14 text-center sm:px-6 sm:pb-24 sm:pt-[88px]">
            <Reveal stagger trigger="mount" y={18}>
              <span className="mb-[22px] inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-[7px] text-xs font-semibold">
                <Icon icon={MapPin} size={13} strokeWidth={2.2} />
                {area.name}
                {area.status === "planned" && (
                  <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px]">Launching soon</span>
                )}
              </span>
              <h1 className="mb-[22px] font-display text-[clamp(36px,5.5vw,62px)] font-extrabold leading-[1.04] tracking-[-0.028em]">
                {headline}
              </h1>
              <p className="mx-auto mb-8 max-w-[620px] text-[17px] leading-[1.55] text-white/80">
                {blurb}
              </p>
              <div className="flex justify-center">
                <Link href={href}>
                  <Button
                    variant="secondary"
                    size="lg"
                    iconRight={ArrowRight}
                    className="border-transparent bg-white font-bold text-brand-blue-dark hover:bg-surface"
                  >
                    Start your application
                  </Button>
                </Link>
              </div>
              <p className="mt-4 text-sm text-white/70">
                Takes about 10 minutes · free to apply · reviewed in days
              </p>
            </Reveal>
          </div>
        </section>

        <FactTicker facts={MECHANIC_FACTS} label="Why mechanics join Book My Tech" />
        <MechanicBenefits />
        <MechanicHowItWorks />
        <MechanicRequirements applyHref={href} ctaLabel={`Apply to work in ${area.name}`} />
        <MechanicFinalCta
          applyHref={href}
          title={`Start taking jobs in ${area.name}.`}
          body="Free to apply, and you could be taking jobs within days."
        />
      </main>
      <Footer />
    </>
  );
}
