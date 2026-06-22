import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "../_components/legal-page";

export const metadata: Metadata = {
  title: "Cookie Policy — Book My Tech",
  description:
    "What cookies and similar technologies Book My Tech uses, why we use them, and how you can manage your preferences.",
};

const SECTIONS: LegalSection[] = [
  {
    heading: "What cookies are",
    body: [
      "Cookies are small text files stored on your device when you visit a website. They let a site remember your actions and preferences over time. We also use similar technologies such as local storage and pixels; we refer to all of these as “cookies” in this policy.",
    ],
  },
  {
    heading: "How we use cookies",
    body: ["We use cookies for the following purposes:"],
    bullets: [
      "Strictly necessary — sign-in, security, keeping your booking in progress and load balancing. The Platform won't work properly without these.",
      "Functional — remembering preferences such as your area or recently viewed services.",
      "Analytics — understanding how the Platform is used so we can improve it. These are aggregated and help us see which pages and flows work well.",
      "Marketing — measuring campaigns and showing relevant content. These are only set with your consent.",
    ],
  },
  {
    heading: "Third-party cookies",
    body: [
      "Some cookies are set by trusted third parties that help us run the Platform — for example our payment providers (to process payments securely) and our analytics provider. These parties process data under their own privacy policies and our data-processing agreements with them.",
    ],
  },
  {
    heading: "Managing your preferences",
    body: [
      "When you first visit, you can accept or reject non-essential cookies through our consent banner, and you can change your choice at any time from the cookie settings link in the footer. You can also block or delete cookies in your browser settings, though strictly necessary cookies are required for the Platform to function and disabling them may break parts of the site.",
    ],
  },
  {
    heading: "Changes to this policy",
    body: [
      "We may update this Cookie Policy as our use of cookies evolves. Any changes will be posted here with a revised “last updated” date.",
    ],
  },
];

export default function CookiesPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Cookie Policy"
      intro="The cookies and similar technologies we use, what they do, and how to manage your preferences."
      lastUpdated="June 2026"
      sections={SECTIONS}
    />
  );
}
