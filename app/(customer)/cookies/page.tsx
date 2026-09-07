import type { Metadata } from "next";
import { LegalPage } from "../_components/legal-page";
import { PREAMBLE, SECTIONS } from "./content";

export const metadata: Metadata = {
  title: "Cookie Policy — Book My Tech",
  description:
    "What cookies and similar technologies Book My Tech uses, why we use them, which ones need your consent, and how to change your choice.",
};

export default function CookiesPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Cookie Policy"
      intro="The cookies and similar technologies we use on our website and booking platform, what each one does, and how you can manage your preferences."
      lastUpdated="26 August 2026"
      preamble={PREAMBLE}
      sections={SECTIONS}
    />
  );
}
