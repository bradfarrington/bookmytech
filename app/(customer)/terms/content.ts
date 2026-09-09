import type { LegalBlock, LegalSection } from "../_components/legal-page";
import { formatPrice } from "@/lib/utils";

// Hand-converted from Brad's "customer tncs.odt" (docs/legal/, 26 August 2026).
//
// Deviations from the document, all agreed with Brad on 2026-09-07:
//   • The cancellation fee figures (§20, §58) are NOT the document's static
//     £30 / £50. They are rendered from the same live platform_settings tiers
//     that cancelBooking charges, so the published Terms can never disagree
//     with what a customer is actually charged. Same rule as /cancellation-policy.
//   • The document's "On the day of appointment — £50" row is omitted: the
//     platform has no such tier. A same-day cancellation is charged the
//     within-24-hours fee unless the mechanic is already en route.
//   • §22: rescheduling is always free on the platform, so the document's
//     "a cancellation charge may apply" sentence is replaced.

export type CancelFeeTiers = { before24h: number; within24h: number; enRoute: number; diagnostic: number };

export const PREAMBLE: LegalBlock[] = [
  { type: "p", text: "These Terms & Conditions (“Terms”) apply to your use of the Book My Tech website, booking platform and related services." },
  { type: "p", text: "Book My Tech Ltd is registered in England and Wales under company number 17379663." },
  { type: "address", lines: [
    "Registered office:",
    "2 Syerscote Lane",
    "Wigginton",
    "B79 9DX",
    "United Kingdom",
    "Customer Support: support@bookmytech.co.uk",
  ] },
  { type: "p", text: "These Terms are intended to be clear and customer-friendly. Nothing in these Terms removes or restricts any statutory consumer rights you may have." },
];

const fee = (pence: number) => (pence === 0 ? "Free" : formatPrice(pence));

export function buildSections(tiers: CancelFeeTiers): LegalSection[] {
  return [
  {
    heading: "About Book My Tech",
    blocks: [
      { type: "p", text: "Book My Tech provides an online platform that allows customers to find and book vetted independent mechanics for vehicle repairs, servicing, diagnostics, inspections and other automotive services." },
      { type: "p", text: "Our aim is to make arranging a mechanic simple, transparent and convenient." },
      { type: "p", text: "Through the Book My Tech platform, customers can:" },
      {
        type: "bullets",
        items: [
          "request vehicle repairs;",
          "book servicing;",
          "arrange diagnostics;",
          "arrange inspections;",
          "book mobile mechanics;",
          "receive quotations;",
          "choose appointment times;",
          "make payments securely; and",
          "receive customer support.",
        ],
      },
      { type: "p", text: "By using Book My Tech or making a booking, you agree to these Terms." },
    ],
  },
  {
    heading: "Our Role",
    blocks: [
      { type: "p", text: "Book My Tech operates a booking platform connecting customers with independent mechanics." },
      { type: "p", text: "Mechanics using Book My Tech are independent automotive professionals and are not employees of Book My Tech." },
      { type: "p", text: "The mechanic is responsible for carrying out automotive work with reasonable skill and care and in accordance with applicable law." },
      { type: "p", text: "Book My Tech provides the platform through which bookings, quotations, additional work, payments and customer support are managed." },
      { type: "p", text: "Where you make a booking through Book My Tech, you benefit from the protections and processes described in these Terms, including our applicable warranty and customer support procedures." },
    ],
  },
  {
    heading: "Our Mechanics and Vetting",
    blocks: [
      { type: "p", text: "Customer safety and confidence are extremely important to us." },
      { type: "p", text: "Book My Tech vets every mechanic before they are onboarded onto the platform." },
      { type: "p", text: "Our vetting process may include checks relating to:" },
      {
        type: "bullets",
        items: [
          "identity;",
          "automotive experience;",
          "qualifications;",
          "previous work experience;",
          "insurance;",
          "right to work, where applicable;",
          "business information; and",
          "other relevant checks.",
        ],
      },
      { type: "p", text: "We may also monitor:" },
      {
        type: "bullets",
        items: [
          "customer feedback;",
          "complaints;",
          "booking performance; and",
          "compliance with our platform rules.",
        ],
      },
      { type: "p", text: "If a mechanic does not meet our standards, we may suspend, restrict or remove them from the Book My Tech platform." },
      { type: "p", text: "Our vetting process is intended to maintain high standards. However, no vetting process can guarantee that a mechanic will never make a mistake or that every mechanic will be suitable for every vehicle or repair." },
    ],
  },
  {
    heading: "Independent Mechanics",
    blocks: [
      { type: "p", text: "Mechanics using Book My Tech are independent businesses." },
      { type: "p", text: "Mechanics are responsible for:" },
      {
        type: "bullets",
        items: [
          "the work they carry out;",
          "their workmanship;",
          "parts they supply;",
          "complying with applicable laws;",
          "maintaining appropriate insurance;",
          "maintaining relevant qualifications where required;",
          "following appropriate manufacturer and industry procedures; and",
          "complying with Book My Tech’s platform rules.",
        ],
      },
      { type: "p", text: "Book My Tech may assist customers where there is a problem with a booking or mechanic." },
    ],
  },
  {
    heading: "Eligibility",
    blocks: [
      { type: "p", text: "You must be at least 18 years old to make a booking yourself." },
      { type: "p", text: "If you make a booking on behalf of another person or business, you confirm that you have authority to do so." },
    ],
  },
  {
    heading: "Making a Booking",
    blocks: [
      { type: "p", text: "When making a booking, you should provide accurate and complete information, including where requested:" },
      {
        type: "bullets",
        items: [
          "vehicle registration;",
          "vehicle make and model;",
          "vehicle year;",
          "vehicle mileage;",
          "your name;",
          "telephone number;",
          "email address;",
          "address;",
          "details of the vehicle fault;",
          "requested repair or service; and",
          "any other information reasonably required.",
        ],
      },
      { type: "p", text: "Providing accurate information helps us arrange an appropriate mechanic and, where necessary, the correct parts." },
      { type: "p", text: "If information supplied is inaccurate or incomplete, the mechanic may not be able to complete the requested work." },
    ],
  },
  {
    heading: "Booking Confirmation",
    blocks: [
      { type: "p", text: "A booking is confirmed once Book My Tech confirms the booking with you." },
      { type: "p", text: "Your confirmation may include:" },
      {
        type: "bullets",
        items: [
          "mechanic details;",
          "vehicle details;",
          "requested work;",
          "agreed price;",
          "appointment date;",
          "appointment time or arrival window;",
          "location; and",
          "payment details.",
        ],
      },
      { type: "p", text: "Please check your confirmation carefully." },
      { type: "p", text: "If anything appears incorrect, contact:" },
      { type: "p", text: "support@bookmytech.co.uk" },
    ],
  },
  {
    heading: "Prices and Quotations",
    blocks: [
      { type: "p", text: "We aim to make our pricing clear and transparent." },
      { type: "p", text: "Where a fixed price is shown for a particular repair or service, that price will normally cover the work described in the booking." },
      { type: "p", text: "Sometimes a vehicle must be inspected or diagnosed before the mechanic can determine exactly what is required." },
      { type: "p", text: "A mechanic may discover that:" },
      {
        type: "bullets",
        items: [
          "an additional fault exists;",
          "additional parts are required;",
          "additional labour is required;",
          "the original fault description was incomplete;",
          "the requested repair will not resolve the underlying issue; or",
          "further diagnosis is necessary.",
        ],
      },
      { type: "p", text: "Where this happens, the additional-work process in Section 9 must be followed." },
    ],
  },
  {
    heading: "Additional Work Must Go Through Book My Tech",
    blocks: [
      { type: "p", text: "If a mechanic identifies additional work that is required or recommended during a Book My Tech booking, all additional work must be quoted, approved, booked and paid for through the Book My Tech platform." },
      { type: "p", text: "This is a fundamental Book My Tech requirement." },
      { type: "p", text: "Additional work includes:" },
      {
        type: "bullets",
        items: [
          "additional repairs;",
          "additional parts;",
          "additional labour;",
          "work identified during diagnostics;",
          "work identified during an inspection;",
          "servicing;",
          "maintenance;",
          "recommended repairs;",
          "follow-up repairs;",
          "return visits; and",
          "any other automotive work relating to the customer’s vehicle that arises from the Book My Tech booking.",
        ],
      },
      { type: "p", text: "Mechanics must not privately quote additional work." },
      { type: "p", text: "A mechanic must not:" },
      {
        type: "bullets",
        items: [
          "provide a private quotation;",
          "offer a private cash price;",
          "request direct payment;",
          "provide personal bank details for additional work;",
          "arrange additional work privately;",
          "ask the customer to contact them directly;",
          "arrange a separate appointment outside Book My Tech; or",
          "encourage the customer to bypass Book My Tech.",
        ],
      },
      { type: "p", text: "The mechanic must submit the additional work and price through Book My Tech." },
      { type: "p", text: "Book My Tech will then provide the customer with the relevant quotation or booking option." },
    ],
  },
  {
    heading: "Customer Approval of Additional Work",
    blocks: [
      { type: "p", text: "A customer is never required to accept additional work simply because a mechanic has recommended it." },
      { type: "p", text: "Where additional work is required or recommended:" },
      {
        type: "numbered",
        items: [
          { text: "The mechanic explains the issue." },
          { text: "The mechanic provides the relevant information to Book My Tech." },
          { text: "Book My Tech provides the additional quotation." },
          { text: "The customer decides whether to proceed." },
          { text: "The customer approves the additional work through Book My Tech." },
          { text: "The additional work is booked and paid for through Book My Tech." },
        ],
      },
      { type: "p", text: "Additional work must not be carried out until customer approval has been obtained through Book My Tech, except where immediate action is reasonably necessary to protect safety or prevent further damage and the customer has agreed to that work." },
      { type: "p", text: "Where additional work is not approved, the mechanic may explain the consequences of leaving the issue unrepaired." },
    ],
  },
  {
    heading: "Why Additional Work Must Stay on the Platform",
    blocks: [
      { type: "p", text: "Keeping additional work within Book My Tech helps protect customers and mechanics." },
      { type: "p", text: "It ensures there is a clear record of:" },
      {
        type: "bullets",
        items: [
          "work recommended;",
          "price;",
          "mechanic;",
          "customer approval;",
          "payment;",
          "parts and labour supplied; and",
          "applicable warranty protection.",
        ],
      },
      { type: "p", text: "It also allows Book My Tech to provide customer support and investigate complaints where necessary." },
    ],
  },
  {
    heading: "Off-Platform Bookings and Payments",
    blocks: [
      { type: "p", text: "Book My Tech is a managed booking platform." },
      { type: "p", text: "All services arranged through Book My Tech must remain on the Book My Tech platform." },
      { type: "p", text: "Mechanics must not ask, encourage, pressure or allow a customer to move a Book My Tech booking off-platform." },
      { type: "p", text: "This includes asking a customer to:" },
      {
        type: "bullets",
        items: [
          "cancel a Book My Tech booking and rebook privately;",
          "pay directly by cash;",
          "pay by bank transfer;",
          "use another payment method instead of Book My Tech;",
          "arrange additional work privately;",
          "arrange future work privately;",
          "exchange contact details for the purpose of bypassing Book My Tech;",
          "arrange a separate appointment directly; or",
          "otherwise circumvent Book My Tech’s booking or payment system.",
        ],
      },
      { type: "p", text: "Customers must also not knowingly participate in an arrangement designed to circumvent Book My Tech." },
    ],
  },
  {
    heading: "Future Work Resulting From a Book My Tech Booking",
    blocks: [
      { type: "p", text: "If a mechanic and customer are introduced through Book My Tech, the mechanic must not use that relationship to deliberately arrange private work outside the platform." },
      { type: "p", text: "Where a customer requires:" },
      {
        type: "bullets",
        items: [
          "another repair;",
          "additional servicing;",
          "further diagnostics;",
          "a follow-up appointment;",
          "another visit; or",
          "any other automotive work arising from their Book My Tech relationship,",
        ],
      },
      { type: "p", text: "the work must be arranged through Book My Tech." },
      { type: "p", text: "If a customer asks a mechanic to arrange work privately, the mechanic should direct the customer back to Book My Tech." },
      { type: "p", text: "This requirement applies regardless of whether the customer or mechanic first suggests moving the work off-platform." },
    ],
  },
  {
    heading: "Reporting Off-Platform Activity",
    blocks: [
      { type: "p", text: "Customers should report any suspected attempt by a mechanic to arrange private or off-platform work." },
      { type: "p", text: "Please contact:" },
      { type: "p", text: "support@bookmytech.co.uk" },
      { type: "p", text: "Where possible, provide:" },
      {
        type: "bullets",
        items: [
          "booking reference;",
          "mechanic’s name;",
          "appointment date;",
          "details of what was requested; and",
          "screenshots or messages where available.",
        ],
      },
      { type: "p", text: "Book My Tech takes suspected platform circumvention seriously." },
      { type: "p", text: "A mechanic found to have deliberately attempted to bypass Book My Tech may have their account:" },
      {
        type: "bullets",
        items: [
          "investigated;",
          "suspended;",
          "restricted; or",
          "permanently removed.",
        ],
      },
      { type: "p", text: "A customer who deliberately attempts to circumvent Book My Tech may also have their account suspended or terminated." },
      { type: "p", text: "Customers will not be penalised simply for reporting a genuine concern in good faith." },
    ],
  },
  {
    heading: "Diagnostic Bookings",
    blocks: [
      { type: "p", text: "A diagnostic booking is intended to identify or investigate a vehicle fault." },
      { type: "p", text: "A diagnostic does not necessarily mean that the vehicle will be repaired during the same appointment." },
      { type: "p", text: "If the mechanic identifies the cause of the problem and can complete the repair within the agreed booking without additional chargeable work, they may do so where appropriate." },
      { type: "p", text: "If additional work, parts or labour are required, the mechanic must submit the additional work through Book My Tech in accordance with Section 9." },
    ],
  },
  {
    heading: "Vehicle Condition",
    blocks: [
      { type: "p", text: "Vehicles can have multiple faults, particularly older or high-mileage vehicles." },
      { type: "p", text: "A repair addresses the work included in the relevant booking." },
      { type: "p", text: "A repair does not guarantee that:" },
      {
        type: "bullets",
        items: [
          "the vehicle has no other faults;",
          "another warning light will not subsequently appear;",
          "another component will not fail;",
          "the vehicle will pass an MOT; or",
          "unrelated faults will not develop.",
        ],
      },
      { type: "p", text: "Where a fault is unrelated to the original repair, it will not normally be covered by the warranty." },
    ],
  },
  {
    heading: "Parts",
    blocks: [
      { type: "p", text: "Where Book My Tech or a mechanic supplies replacement parts, the parts should be suitable for the vehicle and the work being carried out." },
      { type: "p", text: "Where reasonably practicable, suitable-quality parts will be used." },
      { type: "p", text: "If a particular part is unavailable, an alternative may be proposed." },
      { type: "p", text: "Where an alternative materially changes the price or nature of the repair, the customer must be given the opportunity to approve it before the work proceeds." },
    ],
  },
  {
    heading: "Customer-Supplied Parts",
    blocks: [
      { type: "p", text: "Mechanics may decline to fit parts supplied by customers." },
      { type: "p", text: "If a mechanic agrees to install a customer-supplied part, that part may not be covered by the Book My Tech 12-month / 12,000-mile warranty." },
      { type: "p", text: "The mechanic should explain the warranty position before installing a customer-supplied part." },
    ],
  },
  {
    heading: "Payment",
    blocks: [
      { type: "p", text: "Payments made through Book My Tech are processed using Stripe." },
      { type: "p", text: "Stripe is an independent payment service provider." },
      { type: "p", text: "Payment details are processed securely through the payment provider." },
      { type: "p", text: "Book My Tech does not normally have access to your complete card details." },
      { type: "p", text: "You authorise the relevant payment to be processed in accordance with the price and payment terms shown during booking." },
      { type: "p", text: "Where additional work has been approved through Book My Tech, the additional agreed amount will also be payable." },
    ],
  },
  {
    heading: "Cancellation by the Customer",
    blocks: [
      { type: "p", text: "We understand that plans change." },
      { type: "p", text: "Our cancellation policy is:" },
      {
        type: "table",
        head: ["Cancellation timing", "Cancellation fee"],
        rows: [
          ["More than 24 hours before appointment", fee(tiers.before24h)],
          ["Within 24 hours of appointment", fee(tiers.within24h)],
          ["Mechanic has already started travelling to customer", fee(tiers.enRoute)],
          [
            "Mechanic arrives, finds the booked repair is not what the vehicle needs, and you decline the revised work",
            `${fee(tiers.diagnostic)} on-site diagnostic fee, or the fee above — whichever the mechanic applies`,
          ],
        ],
      },
      { type: "p", text: "These charges reflect time and costs incurred by the mechanic in preparing for or travelling to the appointment, or in inspecting the vehicle and identifying what it actually needs." },
      { type: "p", text: "We will consider genuine exceptional circumstances fairly." },
      { type: "p", text: "Our Cancellation Policy explains how a cancellation fee is taken from the amount pre-authorised on your card when you book, and how the rest is released." },
    ],
  },
  {
    heading: "Exceptional Cancellation Circumstances",
    blocks: [
      { type: "p", text: "If you need to cancel because of an emergency or exceptional circumstance, please contact us as soon as possible." },
      { type: "p", text: "We may, at our discretion, reduce or waive a cancellation charge depending on the circumstances." },
      { type: "p", text: "Examples may include:" },
      {
        type: "bullets",
        items: [
          "serious illness;",
          "bereavement;",
          "an accident;",
          "severe weather; or",
          "another significant event outside your reasonable control.",
        ],
      },
      { type: "p", text: "Nothing in this section limits any statutory cancellation rights you may have." },
    ],
  },
  {
    heading: "Rescheduling",
    blocks: [
      { type: "p", text: "Where possible, we will try to reschedule your booking rather than cancel it." },
      { type: "p", text: "Rescheduling is free and is not treated as a cancellation, however close to your appointment you do it. Where possible you will keep the same mechanic." },
      { type: "p", text: "Your mechanic may also propose a new time. If they do, you will be asked to accept or decline it, and declining does not incur a fee." },
    ],
  },
  {
    heading: "Cancellation by Book My Tech or the Mechanic",
    blocks: [
      { type: "p", text: "A booking may occasionally need to be cancelled because:" },
      {
        type: "bullets",
        items: [
          "the mechanic becomes unavailable;",
          "the vehicle is unsuitable for the requested service;",
          "required parts cannot be obtained;",
          "the vehicle is unsafe;",
          "information supplied was materially incorrect;",
          "access is unavailable;",
          "weather makes the work unsafe; or",
          "circumstances outside reasonable control prevent the appointment.",
        ],
      },
      { type: "p", text: "Where appropriate, we will offer:" },
      {
        type: "bullets",
        items: [
          "an alternative appointment;",
          "another suitable mechanic; or",
          "a refund.",
        ],
      },
    ],
  },
  {
    heading: "Mechanic Arrival Times",
    blocks: [
      { type: "p", text: "We aim to provide reliable appointment times." },
      { type: "p", text: "A mechanic may occasionally be delayed due to:" },
      {
        type: "bullets",
        items: [
          "traffic;",
          "a previous job taking longer;",
          "vehicle problems;",
          "weather;",
          "emergencies;",
          "parts availability; or",
          "circumstances outside reasonable control.",
        ],
      },
      { type: "p", text: "Where there is a significant delay, we will try to keep you informed." },
    ],
  },
  {
    heading: "Access to Your Vehicle",
    blocks: [
      { type: "p", text: "You must make your vehicle available at the agreed time and location." },
      { type: "p", text: "Please tell us in advance if:" },
      {
        type: "bullets",
        items: [
          "the vehicle is underground;",
          "access is restricted;",
          "there are height restrictions;",
          "the vehicle cannot be moved;",
          "the vehicle is not roadworthy;",
          "the vehicle is in a locked area; or",
          "specialist equipment is required.",
        ],
      },
      { type: "p", text: "Failure to provide reasonable access may result in cancellation or additional charges where permitted." },
    ],
  },
  {
    heading: "Vehicle Safety",
    blocks: [
      { type: "p", text: "A mechanic may refuse or stop work where they reasonably believe:" },
      {
        type: "bullets",
        items: [
          "the vehicle is unsafe;",
          "the location is unsafe;",
          "the requested work cannot safely be completed;",
          "continuing could cause injury or damage; or",
          "continuing would breach applicable legal requirements.",
        ],
      },
      { type: "p", text: "Where possible, the mechanic will explain the reason." },
    ],
  },
  {
    heading: "Mobile Repairs",
    blocks: [
      { type: "p", text: "Book My Tech allows customers to arrange mobile vehicle repairs where appropriate." },
      { type: "p", text: "Not every repair can safely be completed at a customer’s location." },
      { type: "p", text: "Some repairs may require:" },
      {
        type: "bullets",
        items: [
          "specialist equipment;",
          "a workshop;",
          "a vehicle lift;",
          "recovery;",
          "specialist diagnostics; or",
          "other facilities.",
        ],
      },
      { type: "p", text: "Where a mobile repair cannot be completed, we will try to explain the available options." },
    ],
  },
  {
    heading: "MOT Services",
    blocks: [
      { type: "p", text: "Where an MOT service is booked, the test must be carried out by an appropriately authorised MOT testing facility." },
      { type: "p", text: "Book My Tech does not guarantee that a vehicle will pass an MOT." },
      { type: "p", text: "Any repairs required following an MOT may need to be booked separately through Book My Tech." },
    ],
  },
  {
    heading: "12-Month / 12,000-Mile Warranty",
    blocks: [
      { type: "p", text: "Book My Tech provides a customer warranty for eligible repairs booked through our platform." },
      { type: "p", text: "Eligible parts and labour are covered for 12 months or 12,000 miles, whichever occurs first, unless the relevant booking expressly states otherwise." },
      { type: "p", text: "The warranty is intended to protect customers against eligible failures relating to:" },
      {
        type: "bullets",
        items: [
          "parts supplied as part of the repair; and",
          "workmanship.",
        ],
      },
    ],
  },
  {
    heading: "What the Warranty Covers",
    blocks: [
      { type: "p", text: "Subject to the exclusions in these Terms, the warranty covers eligible failures caused by:" },
      {
        type: "bullets",
        items: [
          "defective parts supplied as part of the repair; or",
          "defective workmanship.",
        ],
      },
      { type: "p", text: "Where an eligible warranty fault occurs, Book My Tech will work with the customer and mechanic to investigate and arrange an appropriate remedy." },
    ],
  },
  {
    heading: "Warranty Exclusions",
    blocks: [
      { type: "p", text: "The warranty does not normally cover:" },
      {
        type: "bullets",
        items: [
          "normal wear and tear;",
          "consumables;",
          "routine maintenance items;",
          "accidental damage;",
          "misuse;",
          "neglect;",
          "racing or competition use;",
          "vandalism;",
          "unauthorised modifications;",
          "damage caused by another component;",
          "unrelated faults;",
          "customer-supplied parts;",
          "repairs carried out by another party;",
          "failure to follow manufacturer instructions;",
          "failure to follow reasonable advice from the mechanic;",
          "continued driving after being advised not to drive the vehicle; or",
          "damage unrelated to the original repair.",
        ],
      },
      { type: "p", text: "Consumable items may have limited or no warranty coverage where their failure is due to normal wear rather than a defect." },
    ],
  },
  {
    heading: "Diagnostics and Inspections",
    blocks: [
      { type: "p", text: "Diagnostic and inspection services are generally not covered by the 12-month / 12,000-mile repair warranty." },
      { type: "p", text: "A diagnostic identifies or investigates a fault at a particular point in time." },
      { type: "p", text: "Where diagnostic work leads to a separate repair, eligible parts and labour for that repair may be covered by the warranty." },
    ],
  },
  {
    heading: "Making a Warranty Claim",
    blocks: [
      { type: "p", text: "If you believe a repair covered by the warranty has failed, contact:" },
      { type: "p", text: "support@bookmytech.co.uk" },
      { type: "p", text: "Please provide:" },
      {
        type: "bullets",
        items: [
          "booking reference;",
          "vehicle registration;",
          "description of the problem;",
          "date the issue occurred; and",
          "photographs or other evidence where available.",
        ],
      },
      { type: "p", text: "We may request additional information." },
    ],
  },
  {
    heading: "Warranty Inspection",
    blocks: [
      { type: "p", text: "Where a warranty claim is made, Book My Tech may arrange for the original mechanic to inspect the vehicle." },
      { type: "p", text: "This allows us to determine whether the issue relates to:" },
      {
        type: "bullets",
        items: [
          "workmanship;",
          "a supplied part;",
          "an unrelated vehicle fault; or",
          "another cause.",
        ],
      },
      { type: "p", text: "Where the issue is covered by the warranty, appropriate remedial work will be arranged." },
      { type: "p", text: "If the issue is established to be unrelated to the original work, reasonable inspection or call-out costs may be payable where these have been explained beforehand." },
    ],
  },
  {
    heading: "Giving the Original Mechanic an Opportunity to Repair",
    blocks: [
      { type: "p", text: "If a warranty issue occurs, you should contact Book My Tech before arranging for another mechanic or garage to repair the affected area." },
      { type: "p", text: "This gives the original mechanic a reasonable opportunity to inspect and rectify the issue." },
      { type: "p", text: "If another party dismantles, repairs or modifies the relevant work before the original mechanic has had a reasonable opportunity to inspect it, this may affect the warranty where it becomes impossible to establish the original cause." },
      { type: "p", text: "This does not affect statutory rights that cannot legally be excluded." },
    ],
  },
  {
    heading: "Customer Responsibilities During the Warranty",
    blocks: [
      { type: "p", text: "Customers should:" },
      {
        type: "bullets",
        items: [
          "follow manufacturer instructions;",
          "follow reasonable advice provided by the mechanic;",
          "maintain the vehicle appropriately;",
          "respond promptly to warning lights;",
          "avoid continuing to drive where advised not to do so; and",
          "report suspected warranty issues promptly.",
        ],
      },
    ],
  },
  {
    heading: "Vehicle Damage",
    blocks: [
      { type: "p", text: "Mechanics are expected to take reasonable care when working on your vehicle." },
      { type: "p", text: "If you believe your vehicle has been damaged during a Book My Tech appointment, contact:" },
      { type: "p", text: "support@bookmytech.co.uk" },
      { type: "p", text: "as soon as reasonably possible." },
      { type: "p", text: "We may request photographs, reports or other evidence and may contact the mechanic to investigate." },
    ],
  },
  {
    heading: "Personal Belongings",
    blocks: [
      { type: "p", text: "Customers should remove valuable or unnecessary belongings from their vehicle before a mechanic attends." },
      { type: "p", text: "Nothing in this section excludes liability that cannot legally be excluded." },
    ],
  },
  {
    heading: "Insurance",
    blocks: [
      { type: "p", text: "Book My Tech requires mechanics to maintain appropriate insurance relevant to the services they provide." },
      { type: "p", text: "Mechanics remain responsible for maintaining their own insurance and complying with applicable legal requirements." },
    ],
  },
  {
    heading: "Complaints",
    blocks: [
      { type: "p", text: "If you have a complaint about:" },
      {
        type: "bullets",
        items: [
          "a mechanic;",
          "workmanship;",
          "a repair;",
          "parts;",
          "pricing;",
          "a booking;",
          "payment;",
          "customer service; or",
          "another aspect of your Book My Tech experience,",
        ],
      },
      { type: "p", text: "please contact:" },
      { type: "p", text: "support@bookmytech.co.uk" },
      { type: "p", text: "We will aim to investigate complaints fairly and promptly." },
    ],
  },
  {
    heading: "Complaint Resolution",
    blocks: [
      { type: "p", text: "Where appropriate, we may:" },
      {
        type: "bullets",
        items: [
          "ask you to explain the issue;",
          "request supporting evidence;",
          "contact the mechanic;",
          "review the original booking;",
          "review the agreed work and price;",
          "request photographs or reports;",
          "arrange an inspection; and",
          "assist in reaching an appropriate resolution.",
        ],
      },
      { type: "p", text: "We aim to treat both customers and mechanics fairly." },
    ],
  },
  {
    heading: "Customer Reviews",
    blocks: [
      { type: "p", text: "We encourage honest customer reviews." },
      { type: "p", text: "Reviews must reflect the customer’s genuine experience." },
      { type: "p", text: "Customers must not:" },
      {
        type: "bullets",
        items: [
          "submit fake reviews;",
          "impersonate another person;",
          "deliberately provide misleading information;",
          "threaten a mechanic in exchange for a review;",
          "disclose private information; or",
          "use reviews for unlawful purposes.",
        ],
      },
      { type: "p", text: "We may remove or moderate content that breaches these requirements or applicable law." },
    ],
  },
  {
    heading: "Customer and Mechanic Conduct",
    blocks: [
      { type: "p", text: "We expect everyone using Book My Tech to behave respectfully." },
      { type: "p", text: "We do not tolerate:" },
      {
        type: "bullets",
        items: [
          "threats;",
          "violence;",
          "harassment;",
          "discrimination;",
          "intimidation; or",
          "abusive behaviour.",
        ],
      },
      { type: "p", text: "We may suspend or terminate access where there is a genuine safety or conduct concern." },
    ],
  },
  {
    heading: "Acceptable Use",
    blocks: [
      { type: "p", text: "You must not use Book My Tech to:" },
      {
        type: "bullets",
        items: [
          "commit fraud;",
          "provide deliberately false information;",
          "make fraudulent bookings;",
          "avoid payment;",
          "interfere with the platform;",
          "gain unauthorised access to our systems;",
          "upload malicious software; or",
          "use the platform unlawfully.",
        ],
      },
    ],
  },
  {
    heading: "Privacy",
    blocks: [
      { type: "p", text: "Book My Tech processes personal information in accordance with our Privacy Policy and applicable UK data protection law." },
      { type: "p", text: "Relevant information may be shared with the mechanic assigned to your booking where necessary to provide the service." },
      { type: "p", text: "This may include:" },
      {
        type: "bullets",
        items: [
          "name;",
          "telephone number;",
          "email address;",
          "address;",
          "vehicle details; and",
          "booking and repair information.",
        ],
      },
      { type: "p", text: "Please see our Privacy Policy for full details of how we collect, use and protect personal information." },
    ],
  },
  {
    heading: "Website Availability",
    blocks: [
      { type: "p", text: "We aim to keep Book My Tech reliable and available." },
      { type: "p", text: "However, we cannot guarantee that the platform will always be:" },
      {
        type: "bullets",
        items: [
          "available;",
          "uninterrupted;",
          "error-free; or",
          "free from technical issues.",
        ],
      },
      { type: "p", text: "We may temporarily suspend the platform for maintenance, security or technical reasons." },
    ],
  },
  {
    heading: "Changes to These Terms",
    blocks: [
      { type: "p", text: "We may update these Terms from time to time to reflect:" },
      {
        type: "bullets",
        items: [
          "changes to our services;",
          "changes to our platform;",
          "changes to technology;",
          "changes in applicable law; or",
          "changes to our business practices.",
        ],
      },
      { type: "p", text: "The latest version will be published on our website." },
      { type: "p", text: "Where a change materially affects an existing booking, we will take reasonable steps to notify customers where required." },
      { type: "p", text: "The Terms applying to a booking will generally be those in effect when the booking was made, unless a change is required by law." },
    ],
  },
  {
    heading: "Events Outside Our Control",
    blocks: [
      { type: "p", text: "We will not be responsible for delays caused by circumstances outside our reasonable control, including:" },
      {
        type: "bullets",
        items: [
          "severe weather;",
          "flooding;",
          "accidents;",
          "major traffic disruption;",
          "strikes;",
          "government restrictions;",
          "public emergencies;",
          "telecommunications failures;",
          "power failures;",
          "supplier problems;",
          "major technical failures; or",
          "other circumstances beyond reasonable control.",
        ],
      },
      { type: "p", text: "We will make reasonable efforts to minimise disruption." },
    ],
  },
  {
    heading: "Suspension or Termination",
    blocks: [
      { type: "p", text: "We may suspend or terminate access to Book My Tech where reasonably necessary, including where a user:" },
      {
        type: "bullets",
        items: [
          "materially breaches these Terms;",
          "provides fraudulent information;",
          "repeatedly misuses the platform;",
          "deliberately attempts to circumvent Book My Tech;",
          "arranges private work arising from Book My Tech;",
          "abuses staff or mechanics; or",
          "uses the platform unlawfully.",
        ],
      },
      { type: "p", text: "This does not affect rights that arose before suspension or termination." },
    ],
  },
  {
    heading: "Intellectual Property",
    blocks: [
      { type: "p", text: "The Book My Tech name, branding, website, software, content and other intellectual property belong to Book My Tech Ltd or its licensors unless otherwise stated." },
      { type: "p", text: "You may use the platform for its intended purpose." },
      { type: "p", text: "You must not copy, reproduce, modify or commercially exploit our website or content without permission." },
    ],
  },
  {
    heading: "Third-Party Services",
    blocks: [
      { type: "p", text: "Book My Tech may use third-party services including payment, mapping, communications and other technology providers." },
      { type: "p", text: "Those services may have their own terms and privacy policies." },
      { type: "p", text: "Payments are processed through Stripe." },
    ],
  },
  {
    heading: "Statutory Consumer Rights",
    blocks: [
      { type: "p", text: "Nothing in these Terms removes or restricts your statutory rights." },
      { type: "p", text: "Where you are a consumer, you have rights under applicable UK consumer protection legislation." },
      { type: "p", text: "Services must be provided in accordance with applicable legal requirements, including requirements relating to reasonable care and skill and conformity with what was agreed." },
      { type: "p", text: "Where these Terms conflict with a mandatory statutory consumer right, the statutory right will take priority." },
    ],
  },
  {
    heading: "Severability",
    blocks: [
      { type: "p", text: "If any provision of these Terms is found to be invalid or unenforceable, the remaining provisions will continue to apply." },
    ],
  },
  {
    heading: "No Waiver",
    blocks: [
      { type: "p", text: "If we do not immediately enforce a provision of these Terms, this does not mean that we have waived our right to enforce it later." },
    ],
  },
  {
    heading: "Entire Agreement",
    blocks: [
      { type: "p", text: "These Terms, together with your booking details, applicable warranty terms and Book My Tech policies, form the agreement governing your use of the platform." },
      { type: "p", text: "Where a specific booking term conflicts with these Terms, the specific booking term will apply to the extent of the conflict." },
    ],
  },
  {
    heading: "Governing Law",
    blocks: [
      { type: "p", text: "These Terms are governed by the laws of England and Wales." },
      { type: "p", text: "Nothing in this section removes any mandatory consumer rights or prevents a consumer from relying on rights available under applicable law." },
    ],
  },
  {
    heading: "Contact Book My Tech",
    blocks: [
      { type: "address", lines: [
        "Book My Tech Ltd",
        "Company number: 17379663",
        "Registered office:",
        "2 Syerscote Lane",
        "Wigginton",
        "B79 9DX",
        "United Kingdom",
        "Customer Support:",
        "support@bookmytech.co.uk",
      ] },
      { type: "p", text: "For bookings, cancellations, warranty claims, complaints or suspected policy breaches, please contact us at the above email address." },
    ],
  },
  {
    heading: "Customer Summary",
    blocks: [
      {
        type: "table",
        head: ["Policy", "Book My Tech"],
        rows: [
          ["Company", "Book My Tech Ltd"],
          ["Company number", "17379663"],
          ["Registered office", "2 Syerscote Lane, Wigginton, B79 9DX"],
          ["Customer support", "support@bookmytech.co.uk"],
          ["Mechanic vetting", "All mechanics vetted before onboarding"],
          ["Payment provider", "Stripe"],
          ["Cancellation more than 24 hours before appointment", fee(tiers.before24h)],
          ["Cancellation within 24 hours", fee(tiers.within24h)],
          ["Mechanic already travelling", fee(tiers.enRoute)],
          ["Eligible repair warranty", "12 months / 12,000 miles"],
          ["Warranty", "Eligible parts and labour"],
          ["Additional work", "Must be quoted and booked through Book My Tech"],
          ["Private additional quotations", "Not permitted"],
          ["Off-platform bookings", "Not permitted"],
          ["Private payments for Book My Tech work", "Not permitted"],
          ["Customer support", "Available through Book My Tech"],
        ],
      },
      { type: "h3", text: "Our Customer Promise" },
      {
        type: "promise",
        items: [
          { emoji: "🔧", title: "Vetted mechanics", text: "Every mechanic is vetted before being onboarded onto Book My Tech." },
          { emoji: "💷", title: "Clear pricing", text: "We aim to make the price and any additional work clear before it is carried out." },
          { emoji: "📱", title: "Additional work stays on Book My Tech", text: "If additional work is identified, it must be quoted, approved, booked and paid for through our platform." },
          { emoji: "🚫", title: "No off-platform bookings", text: "Bookings and work arising from Book My Tech must remain on our platform." },
          { emoji: "🔒", title: "Secure payments", text: "Payments are processed through Stripe." },
          { emoji: "🛡️", title: "12-month / 12,000-mile warranty", text: "Eligible repairs are covered for 12 months or 12,000 miles, whichever occurs first, subject to the warranty terms and exclusions above." },
          { emoji: "🤝", title: "Fair cancellation", text: tiers.before24h === 0 ? "Cancel more than 24 hours before your appointment and there is no cancellation charge." : `Cancel more than 24 hours before your appointment and the cancellation charge is ${formatPrice(tiers.before24h)}.` },
          { emoji: "💬", title: "Customer support", text: "If something goes wrong, contact us and we will work with you and the mechanic to help resolve the issue." },
        ],
      },
      { type: "h3", text: "Your legal rights remain protected" },
      { type: "p", text: "Nothing in these Terms is intended to exclude, restrict or replace any consumer rights or other legal rights that cannot lawfully be excluded or restricted." },
      { type: "address", lines: [
        "Book My Tech Ltd",
        "Company No. 17379663",
        "2 Syerscote Lane, Wigginton, B79 9DX, United Kingdom",
        "support@bookmytech.co.uk",
      ] },
    ],
  },
  ];
}
