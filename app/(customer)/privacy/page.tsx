import type { Metadata } from "next";
import { LegalPage } from "../_components/legal-page";
import { PREAMBLE, SECTIONS } from "./content";

export const metadata: Metadata = {
  title: "Privacy Policy — Book My Tech",
  description:
    "How Book My Tech collects, uses, stores and shares personal information, the lawful bases we rely on, how long we keep it, and your rights under UK GDPR.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Privacy Policy"
      intro="How we collect, use, store and share personal information when you visit our website, make a booking, work with a mechanic, or register as one — and the rights you have over that information."
      lastUpdated="26 August 2026"
      preamble={PREAMBLE}
      sections={SECTIONS}
    />
  );
}
