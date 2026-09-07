import type { Metadata } from "next";
import { LegalPage } from "../_components/legal-page";
import { getTakeRateBase } from "@/lib/pricing/calculate";
import { createAdminClient } from "@/lib/supabase/admin";
import { PREAMBLE, buildSections } from "./content";

export const metadata: Metadata = {
  title: "Mechanic Terms & Conditions — Book My Tech",
  description:
    "The terms mechanics work under on Book My Tech — vetting, independent status, bookings, additional work, the platform fee, warranty duties, conduct, and suspension or removal.",
};

// Public so an applicant can read the terms BEFORE applying, which is the point
// of publishing it — the mechanic apply flow links here. It lives under the
// (customer) route group with the other legal pages because it shares their
// chrome, not because it's aimed at customers.
//
// Dynamic because the §25 worked example is computed from the live platform
// take rate (platform_settings.take_rate_base), so it can't drift from what
// the platform actually deducts.
export const dynamic = "force-dynamic";

export default async function MechanicTermsPage() {
  const takeRate = await getTakeRateBase(createAdminClient());

  return (
    <LegalPage
      eyebrow="Legal"
      title="Mechanic Terms & Conditions"
      intro="The terms you work under as an independent mechanic on Book My Tech — how bookings, additional work, the platform fee, the warranty and our standards work."
      lastUpdated="26 August 2026"
      preamble={PREAMBLE}
      sections={buildSections(takeRate)}
    />
  );
}
