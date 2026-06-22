import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "../_components/legal-page";

export const metadata: Metadata = {
  title: "Terms of Service — Book My Tech",
  description:
    "The terms that govern your use of Book My Tech — booking a mobile mechanic, pricing, payments, guarantees, cancellations and your responsibilities.",
};

const SECTIONS: LegalSection[] = [
  {
    heading: "About these terms",
    body: [
      "These Terms of Service (“Terms”) govern your access to and use of the Book My Tech website, apps and services (the “Platform”), operated by Book My Tech Ltd (“Book My Tech”, “we”, “us”). By creating an account or booking a service you agree to these Terms.",
      "Book My Tech is a platform that connects customers with independent, vetted mobile mechanics (“Mechanics”). We facilitate bookings, payments and support; the repair work itself is carried out by the Mechanic matched to your job.",
    ],
  },
  {
    heading: "Booking a service",
    body: [
      "When you enter your vehicle registration and select a service or describe a fault, we show you a fixed price for your area that includes parts, labour and call-out. Submitting a booking is an offer to purchase that service at the quoted price.",
      "A booking is confirmed once a Mechanic accepts the job. We then notify you by email and SMS with the appointment details. If no Mechanic is available for your chosen slot, we will contact you to arrange an alternative or cancel the booking at no charge.",
    ],
  },
  {
    heading: "Pricing and payments",
    body: [
      "We pre-authorise the full quoted amount on your payment method at the time of booking. This is not a charge — it reserves the funds. We only capture payment once the work has been completed and you have confirmed it, or after the confirmation window has elapsed.",
      "If a fault diagnosis reveals that additional or different work is required, the Mechanic will explain this and provide a revised price before carrying out any further work. You are never charged for work you have not approved.",
      "Where a diagnostic visit does not lead to a repair, only the published diagnostic fee applies. If the repair proceeds, that fee is credited against the cost of the work.",
    ],
  },
  {
    heading: "Cancellations and rescheduling",
    body: [
      "You can reschedule or cancel a booking free of charge from your dashboard up to the start of your appointment slot. Because nothing is captured until the job is complete, cancelling in advance costs you nothing.",
      "If a Mechanic is unable to attend, we will offer to rematch you to another Mechanic or cancel and release the pre-authorisation in full.",
    ],
  },
  {
    heading: "Workmanship guarantee",
    body: [
      "Work booked through Book My Tech is covered by a 12-month guarantee on parts and labour, subject to fair wear and tear and correct use of the vehicle. If a fault with the original work recurs within that period, contact us and we will arrange for it to be put right at no additional cost.",
      "The guarantee does not cover unrelated faults, pre-existing issues disclosed at the time of service, or damage caused by misuse, accident or third-party work carried out after our visit.",
    ],
  },
  {
    heading: "Your responsibilities",
    bullets: [
      "Provide accurate vehicle, contact and location details when booking.",
      "Ensure the vehicle is accessible and safe to work on at the agreed location and time.",
      "Be present (or nominate someone who can authorise work) for the duration of the appointment.",
      "Disclose any known faults or modifications that may affect the work.",
    ],
  },
  {
    heading: "The role of Mechanics",
    body: [
      "Mechanics are independent contractors, not employees of Book My Tech. We vet every Mechanic — verifying identity, insurance and trade qualifications — before they take their first job, and we monitor quality through reviews and our disputes process. The contract for the repair work is between you and Book My Tech, who is responsible to you for the service under these Terms.",
    ],
  },
  {
    heading: "Disputes",
    body: [
      "If you are unhappy with any aspect of a job, raise it from your dashboard within the confirmation window. Our support team will review the booking, mediate where needed, and can hold or reverse payment while a dispute is investigated. We aim to resolve disputes fairly and quickly.",
    ],
  },
  {
    heading: "Liability",
    body: [
      "Nothing in these Terms limits our liability for death or personal injury caused by negligence, fraud, or any liability that cannot be excluded by law. Subject to that, our total liability arising out of a booking is limited to the price paid for that booking, save for our obligations under the workmanship guarantee.",
    ],
  },
  {
    heading: "Changes to these terms",
    body: [
      "We may update these Terms from time to time. If we make material changes we will notify you by email or in-app. Continued use of the Platform after changes take effect constitutes acceptance of the updated Terms.",
    ],
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Terms of Service"
      intro="The terms that govern booking and using Book My Tech. Please read them carefully — they explain how bookings, payments and our guarantee work."
      lastUpdated="June 2026"
      sections={SECTIONS}
    />
  );
}
