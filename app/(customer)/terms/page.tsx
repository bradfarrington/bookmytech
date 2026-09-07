import type { Metadata } from "next";
import { LegalPage } from "../_components/legal-page";
import { cancelFeeTiers } from "@/lib/bookings/manage-booking";
import { createAdminClient } from "@/lib/supabase/admin";
import { PREAMBLE, buildSections } from "./content";

export const metadata: Metadata = {
  title: "Customer Terms & Conditions — Book My Tech",
  description:
    "The terms that apply when you book a vetted independent mechanic through Book My Tech — bookings, pricing, additional work, cancellations, payment and the 12-month / 12,000-mile warranty.",
};

// The cancellation fee figures in §20 and §58 are read LIVE from
// platform_settings — the same figures cancelBooking actually charges — for the
// reason explained on /cancellation-policy: a published policy must never
// disagree with what a customer is really charged. Hence the page is dynamic.
export const dynamic = "force-dynamic";

export default async function TermsPage() {
  const tiers = await cancelFeeTiers(createAdminClient());

  return (
    <LegalPage
      eyebrow="Legal"
      title="Customer Terms & Conditions"
      intro="The terms that apply to your use of the Book My Tech website and booking platform. Please read them carefully — they explain how bookings, additional work, payment, cancellations and our warranty work."
      lastUpdated="26 August 2026"
      preamble={PREAMBLE}
      sections={buildSections(tiers)}
    />
  );
}
