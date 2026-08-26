import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "../_components/legal-page";
import { cancelFeeTiers } from "@/lib/bookings/manage-booking";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatPrice } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Cancellation Policy — Book My Tech",
  description:
    "What it costs to cancel or reschedule a Book My Tech booking, when each fee tier applies, and how refunds and pre-authorisations work.",
};

// The three fee tiers are read LIVE from platform_settings — the same figures
// cancelBooking actually charges (lib/bookings/manage-booking.ts). They're
// tunable by an admin on /admin/pricing, so hardcoding them here would let the
// published policy drift away from what a customer is really charged. That's the
// one thing a policy page must never do, so the page is dynamic.
export const dynamic = "force-dynamic";

export default async function CancellationPolicyPage() {
  const tiers = await cancelFeeTiers(createAdminClient());

  const free = tiers.before24h === 0;

  const sections: LegalSection[] = [
    {
      heading: "The short version",
      body: [
        `You can cancel or reschedule from your dashboard at any time. More than 24 hours before your slot it costs ${free ? "nothing" : formatPrice(tiers.before24h)}. Closer to the appointment, or once a mechanic is already on the way, a fee applies because someone has held that time for you and started travelling to it.`,
        "Rescheduling is always free. If you can move the job rather than cancel it, you keep your mechanic and you pay no fee at all.",
      ],
    },
    {
      heading: "Cancellation fees",
      body: [
        "The fee depends on when you cancel, measured against the start of your booked slot:",
      ],
      bullets: [
        `More than 24 hours before your slot — ${free ? "no charge" : formatPrice(tiers.before24h)}. The pre-authorisation on your card is released in full.`,
        `Within 24 hours of your slot — ${formatPrice(tiers.within24h)}. Your mechanic has committed the time and turned down other work for it.`,
        `Once your mechanic is marked en route — ${formatPrice(tiers.enRoute)}. They are already travelling to you, at their own cost.`,
      ],
    },
    {
      heading: "How the fee is taken",
      body: [
        "When you book, we pre-authorise the quoted amount on your card. A pre-authorisation is not a payment — it reserves the funds and nothing leaves your account.",
        "If a cancellation fee applies, we capture only that fee from the pre-authorisation and release the rest immediately. If no fee applies, the whole pre-authorisation is released and you are charged nothing.",
        "Released funds are available again as soon as your bank processes the release. That is usually immediate, but some banks take a few working days to show it.",
      ],
    },
    {
      heading: "Rescheduling",
      body: [
        "Rescheduling is free and does not count as a cancellation, however close to your slot you do it. You keep the same mechanic wherever possible.",
        "Your mechanic may also propose a new time — if they do, you will be asked to accept or decline it. Declining a proposed time does not incur a fee.",
      ],
    },
    {
      heading: "If we cancel",
      body: [
        "If your mechanic can no longer attend, we will try to match you with another mechanic for the same slot. You will be told either way.",
        "If we cannot find a replacement and have to cancel, you are never charged a fee and the pre-authorisation is released in full. That applies however close to the appointment the cancellation happens.",
      ],
    },
    {
      heading: "If the job can't go ahead on the day",
      body: [
        "If a mechanic arrives and the work cannot be carried out for a reason outside your control — the wrong part was supplied, or a fault turns out to need a garage — you are not charged a cancellation fee.",
        "If a mechanic arrives at the booked address and cannot reach the vehicle or nobody is there, that is treated as a late cancellation and the en-route fee applies. Keeping your address and access notes up to date on the booking is the way to avoid this.",
      ],
    },
    {
      heading: "Your statutory rights",
      body: [
        "Nothing in this policy affects your statutory rights, including your rights under the Consumer Rights Act 2015 and, where they apply to a service booked at a distance, your cancellation rights under the Consumer Contracts Regulations 2013.",
        "If you believe a fee has been charged incorrectly, raise it with us through your dashboard or by email and we will look at it. If you are not satisfied with the outcome, you can open a dispute from the booking itself.",
      ],
    },
  ];

  return (
    <LegalPage
      eyebrow="Legal"
      title="Cancellation Policy"
      intro="What it costs to cancel or move a booking, when each fee applies, and how your pre-authorisation is handled."
      lastUpdated="26 August 2026"
      sections={sections}
    />
  );
}
