import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "../_components/legal-page";

export const metadata: Metadata = {
  title: "Privacy Notice — Book My Tech",
  description:
    "How Book My Tech collects, uses and protects your personal data, your rights under UK GDPR, and how to contact us about privacy.",
};

const SECTIONS: LegalSection[] = [
  {
    heading: "Who we are",
    body: [
      "Book My Tech Ltd is the data controller for the personal data described in this notice. This notice explains what we collect, why, how long we keep it, and the rights you have under the UK GDPR and the Data Protection Act 2018.",
    ],
  },
  {
    heading: "Information we collect",
    bullets: [
      "Account details — your name, email address, phone number and password.",
      "Vehicle details — registration, make, model and engine, looked up to price your job.",
      "Booking details — the service requested, location of the appointment, and any notes you provide.",
      "Payment information — processed securely by our payment providers; we do not store full card details.",
      "Usage data — device, browser and interaction data collected to keep the Platform secure and reliable.",
    ],
  },
  {
    heading: "How we use your information",
    bullets: [
      "To match you with a Mechanic, confirm bookings and deliver the service you requested.",
      "To take payment, pre-authorise funds and process refunds.",
      "To send booking confirmations, reminders and status updates by email and SMS.",
      "To provide customer support and handle disputes.",
      "To keep the Platform secure, prevent fraud and meet our legal obligations.",
      "To improve our services and, where you have consented, send you relevant offers.",
    ],
  },
  {
    heading: "Legal bases",
    body: [
      "We process your data to perform our contract with you (delivering bookings), to comply with legal obligations (such as tax and accounting), for our legitimate interests (securing and improving the Platform), and on the basis of your consent (for example, marketing messages, which you can withdraw at any time).",
    ],
  },
  {
    heading: "Sharing your information",
    body: [
      "We share the details a Mechanic needs to carry out your job — such as your name, contact number, vehicle and appointment location. We also use trusted processors for payments, SMS and email delivery, hosting and analytics. We require all processors to protect your data and use it only on our instructions. We do not sell your personal data.",
    ],
  },
  {
    heading: "How long we keep it",
    body: [
      "We keep your account and booking records for as long as your account is active and for a reasonable period afterwards to meet legal, accounting and dispute-resolution requirements. When data is no longer needed, we delete or anonymise it.",
    ],
  },
  {
    heading: "Your rights",
    bullets: [
      "Access — request a copy of the personal data we hold about you.",
      "Rectification — ask us to correct inaccurate or incomplete data.",
      "Erasure — ask us to delete your data where we have no overriding reason to keep it.",
      "Restriction and objection — limit or object to certain processing.",
      "Portability — receive your data in a portable format.",
      "Withdraw consent — opt out of marketing at any time via the unsubscribe link or your settings.",
    ],
  },
  {
    heading: "Security",
    body: [
      "We use appropriate technical and organisational measures — including encryption in transit, access controls and secure infrastructure — to protect your personal data against loss, misuse and unauthorised access.",
    ],
  },
  {
    heading: "Contacting us and complaints",
    body: [
      "To exercise any of your rights, email support@bookmytech.co.uk. If you are unhappy with how we handle your data you have the right to complain to the Information Commissioner's Office (ICO) at ico.org.uk, though we would welcome the chance to resolve your concern first.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Privacy Notice"
      intro="How we collect, use and protect your personal data — and the rights you have over it under UK data protection law."
      lastUpdated="June 2026"
      sections={SECTIONS}
    />
  );
}
