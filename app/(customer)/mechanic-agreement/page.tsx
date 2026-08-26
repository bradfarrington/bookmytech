import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "../_components/legal-page";

export const metadata: Metadata = {
  title: "Mechanic Agreement — Book My Tech",
  description:
    "The terms mechanics work under on Book My Tech — status, jobs and dispatch, pay and commission, standards, insurance, disputes and leaving the network.",
};

// Public so an applicant can read the terms BEFORE applying, which is the point
// of publishing it — /mechanics/apply links here. It lives under the (customer)
// route group with the other legal pages because it shares their chrome, not
// because it's aimed at customers.

const SECTIONS: LegalSection[] = [
  {
    heading: "Who this agreement is between",
    body: [
      "This Mechanic Agreement is between Book My Tech Ltd (“Book My Tech”, “we”, “us”) and you, the independent mechanic accepted onto the Book My Tech network (“you”, “the Mechanic”). It applies from the moment your application is approved and for as long as you hold an active account.",
      "It sits alongside our Terms of Service and Privacy Policy. Where this agreement and the Terms of Service conflict on something specific to mechanics, this agreement takes precedence.",
    ],
  },
  {
    heading: "You are self-employed, not an employee",
    body: [
      "You are an independent contractor. This agreement does not create an employment relationship, a partnership, or an agency relationship between you and Book My Tech.",
      "You are responsible for your own income tax and National Insurance, for registering with HMRC, and for your own VAT position where applicable. We do not operate PAYE on your earnings and we do not deduct tax from your payouts.",
      "You decide when you are available and which jobs you accept. You are free to work for other platforms, garages or customers at the same time, including our competitors.",
    ],
  },
  {
    heading: "Getting onto the network",
    body: [
      "Acceptance is at our discretion and depends on the checks in our onboarding process. You must give accurate information in your application and keep it current.",
      "You must hold and maintain the documents we ask for, and upload renewals before the ones we hold expire. We will remind you when a document is approaching expiry.",
    ],
    bullets: [
      "Proof of identity and right to work in the UK",
      "Relevant motor-trade qualifications or demonstrable equivalent experience",
      "Motor trade road risk and public liability insurance, in force and covering the work you do",
      "A valid driving licence",
      "Your own tools and a vehicle suitable for mobile work",
      "Stripe Connect onboarding completed, so you can be paid",
    ],
  },
  {
    heading: "Documents and lapses",
    body: [
      "If a required document expires or lapses, your account is suspended from receiving new jobs until it is back in order. This is not a penalty — we cannot lawfully or safely dispatch work to an uninsured or unlicensed mechanic.",
      "Jobs already booked with you at the point of suspension may be reassigned to another mechanic so the customer is not left waiting.",
    ],
  },
  {
    heading: "Jobs and dispatch",
    body: [
      "Jobs are offered to available mechanics covering the customer's area. Offers are first-come, first-served: the first mechanic to accept gets the job.",
      "You are never obliged to accept an offer. Once you accept, you are committing to attend at the booked slot, and the customer is told you are coming.",
      "If you cannot attend a job you have accepted, tell us as early as you can so we can find a replacement. Repeatedly accepting and then dropping jobs, or failing to attend without notice, will affect your standing on the network and may end this agreement.",
    ],
  },
  {
    heading: "Pricing, pay and commission",
    body: [
      "Customers are quoted a fixed price made up of labour, calculated from published repair times and our hourly rate, plus parts. You do not set the customer's price.",
      "Your payout for a job is snapshotted when the job is booked, so it cannot move underneath you afterwards. Book My Tech retains a commission on the job total; the current rate is shown in your dashboard before you accept.",
      "Payment is taken from the customer only once the job is complete and the customer has signed it off. Your payout is transferred to your connected Stripe account at that point — we do not hold your money or run scheduled payout runs.",
      "If additional work is needed beyond what was quoted, it must be explained to the customer and approved by them before you carry it out. Never do unapproved work and expect it to be paid.",
    ],
  },
  {
    heading: "Refunds and negative balances",
    body: [
      "If a job is later refunded to the customer — for example following an upheld dispute — Book My Tech funds that refund. Because you have already been paid, the refunded amount becomes a debt on your account and your balance goes negative.",
      "A negative balance is recovered from your next job: only the surplus transfers to you, and the withheld portion repays what we fronted. We will not ask you to send money back.",
    ],
  },
  {
    heading: "Standards of work",
    bullets: [
      "Carry out every job competently, safely and to a professional standard",
      "Use parts of appropriate quality for the vehicle and the repair",
      "Turn up within the booked slot, and keep the customer informed if you are running late",
      "Treat customers and their property with care and respect",
      "Explain the work clearly, in plain language, and never overstate what is needed",
      "Get the customer's sign-off before marking a job complete",
    ],
    body: [
      "We ask customers to review completed jobs. Your rating is visible to us and forms part of how we assess standing on the network.",
    ],
  },
  {
    heading: "Workmanship guarantee",
    body: [
      "Work booked through Book My Tech carries a 12-month workmanship guarantee to the customer. If a fault arises from your workmanship within that period, you are expected to put it right at no further cost to the customer.",
      "This covers workmanship. Where a supplied part fails within its own manufacturer warranty, we will work with you and the customer on the appropriate remedy.",
    ],
  },
  {
    heading: "Insurance and liability",
    body: [
      "You must hold motor trade road risk and public liability insurance appropriate to the work you carry out, and keep it in force for the whole time you are active on the network. You must provide evidence on request.",
      "You are responsible for the work you carry out and for any loss or damage arising from it. Book My Tech provides the platform that connects you with customers, handles booking and payment, and supports both sides — it does not carry out the repair.",
    ],
  },
  {
    heading: "Disputes",
    body: [
      "If a customer raises a dispute about a job, you will be notified and given the opportunity to respond with your account of what happened, including photographs.",
      "We will review both sides fairly and reach a decision. Outcomes range from no action, through partial refund, to a full refund with the amount recovered as described under negative balances.",
      "You can also raise a case with us yourself through the resolution centre in your dashboard — for example if a customer is unreachable, the vehicle is not as described, or a job could not safely be completed.",
    ],
  },
  {
    heading: "Customer data",
    body: [
      "You receive customer contact details, addresses and vehicle information only so you can carry out the job. You may use that information for that purpose and no other.",
      "You must not contact customers to arrange work off-platform, add them to marketing lists, or pass their details to anyone else. You must handle their information in line with UK GDPR and delete what you no longer need.",
      "Taking a customer introduced by Book My Tech off-platform for work of the kind we dispatch is a breach of this agreement and will end it.",
    ],
  },
  {
    heading: "Suspension and ending this agreement",
    body: [
      "You may leave the network at any time. Tell us, and complete any jobs you have already accepted, or let us know so they can be reassigned.",
      "We may suspend or remove your account where documents have lapsed, where standards or conduct fall short, where there is evidence of fraud or dishonesty, or where continuing would put customers at risk. Where the circumstances allow it, we will tell you why and give you the chance to put it right.",
      "Ending this agreement does not affect payment owed for jobs you have properly completed, or the recovery of a negative balance.",
    ],
  },
  {
    heading: "Changes to this agreement",
    body: [
      "We may update this agreement as the platform changes. We will give reasonable notice of material changes, and continuing to accept jobs after a change takes effect means you accept the updated terms.",
      "This agreement is governed by the law of England and Wales.",
    ],
  },
];

export default function MechanicAgreementPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Mechanic Agreement"
      intro="The terms you work under as an independent mechanic on the Book My Tech network — how jobs, pay, standards and disputes work."
      lastUpdated="26 August 2026"
      sections={SECTIONS}
    />
  );
}
