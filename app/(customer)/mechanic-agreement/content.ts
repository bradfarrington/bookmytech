import type { LegalBlock, LegalSection } from "../_components/legal-page";
import { formatPrice } from "@/lib/utils";

// Hand-converted from Brad's "mechanic tncs.odt" (docs/legal/, 26 August 2026).
//
// Deviations from the document, agreed with Brad on 2026-09-07:
//   • The §25 worked example is computed from the live platform take rate
//     (platform_settings.take_rate_base) rather than the document's static
//     £30 / £170, so the example can never drift from what the platform
//     actually deducts. The 15% figure in the prose is the document's own.
//   • One sentence is added to §25 acknowledging that a different rate may
//     apply where Book My Tech has agreed one with the mechanic (the Pro tier).

export const PREAMBLE: LegalBlock[] = [
  { type: "p", text: "These Mechanic Terms & Conditions apply to all mechanics and automotive service providers who apply to, register with, or provide services through the Book My Tech platform." },
  { type: "p", text: "Book My Tech Ltd is a company registered in England and Wales under company number 17379663." },
  { type: "address", lines: [
    "Registered office:",
    "2 Syerscote Lane",
    "Wigginton",
    "B79 9DX",
    "United Kingdom",
    "Mechanic Support:",
    "support@bookmytech.co.uk",
  ] },
  { type: "p", text: "By applying to become a Book My Tech mechanic, creating an account, accepting a booking, communicating with a customer through the platform, or carrying out work arranged through Book My Tech, you agree to these Terms & Conditions." },
];

const EXAMPLE_TOTAL_PENCE = 20_000;

/** @param takeRate platform commission as a fraction, e.g. 0.15 */
export function buildSections(takeRate: number): LegalSection[] {
  const feePence = Math.round(EXAMPLE_TOTAL_PENCE * takeRate);
  const pct = `${Math.round(takeRate * 1000) / 10}%`;
  return [
  {
    heading: "About Book My Tech",
    blocks: [
      { type: "p", text: "Book My Tech operates an online marketplace and booking platform that connects customers with vetted independent mechanics." },
      { type: "p", text: "Book My Tech may provide customers with access to:" },
      {
        type: "bullets",
        items: [
          "vehicle repairs;",
          "servicing;",
          "diagnostics;",
          "inspections;",
          "maintenance;",
          "mobile mechanic services;",
          "quotations;",
          "booking management;",
          "secure payment facilities; and",
          "customer support.",
        ],
      },
      { type: "p", text: "Mechanics use the platform to receive and complete customer bookings." },
      { type: "p", text: "You operate as an independent mechanic or automotive business and are not an employee of Book My Tech." },
    ],
  },
  {
    heading: "Becoming a Book My Tech Mechanic",
    blocks: [
      { type: "p", text: "To become a mechanic on Book My Tech, you must provide accurate, complete and up-to-date information requested during the onboarding process." },
      { type: "p", text: "This may include:" },
      {
        type: "bullets",
        items: [
          "your full name;",
          "business or trading name;",
          "address;",
          "contact information;",
          "proof of identity;",
          "proof of address;",
          "qualifications;",
          "automotive experience;",
          "insurance details;",
          "business information;",
          "payment information;",
          "right-to-work information where applicable;",
          "specialist qualifications or authorisations; and",
          "any other information reasonably required by Book My Tech.",
        ],
      },
      { type: "p", text: "You must notify Book My Tech if information you have provided changes." },
    ],
  },
  {
    heading: "Mechanic Vetting",
    blocks: [
      { type: "p", text: "Book My Tech vets mechanics before they are onboarded onto the platform." },
      { type: "p", text: "Our vetting process may include checks relating to:" },
      {
        type: "bullets",
        items: [
          "identity;",
          "qualifications;",
          "experience;",
          "work history;",
          "insurance;",
          "business information;",
          "right to work where applicable; and",
          "other relevant information.",
        ],
      },
      { type: "p", text: "Completion of the vetting process does not guarantee acceptance onto Book My Tech." },
      { type: "p", text: "Book My Tech may request additional information or evidence at any time." },
    ],
  },
  {
    heading: "Maintaining Your Eligibility",
    blocks: [
      { type: "p", text: "After onboarding, you must continue to meet Book My Tech’s requirements." },
      { type: "p", text: "You must:" },
      {
        type: "bullets",
        items: [
          "maintain appropriate insurance;",
          "maintain relevant qualifications and authorisations;",
          "comply with applicable laws and regulations;",
          "carry out work safely;",
          "maintain suitable tools and equipment;",
          "provide accurate information;",
          "maintain appropriate professional standards; and",
          "notify Book My Tech of anything that may affect your ability to provide services safely or lawfully.",
        ],
      },
      { type: "p", text: "If your insurance, qualification, licence or other required status expires, is cancelled or changes materially, you must notify Book My Tech immediately." },
    ],
  },
  {
    heading: "Independent Contractor Status",
    blocks: [
      { type: "p", text: "You are an independent mechanic or automotive business." },
      { type: "p", text: "Nothing in these Terms creates an employment relationship, partnership, agency or joint venture between you and Book My Tech." },
      { type: "p", text: "You are responsible for your own:" },
      {
        type: "bullets",
        items: [
          "tax;",
          "National Insurance;",
          "business expenses;",
          "tools;",
          "equipment;",
          "vehicle;",
          "insurance;",
          "qualifications;",
          "licences; and",
          "other business obligations.",
        ],
      },
      { type: "p", text: "You are responsible for ensuring that your business operates lawfully." },
    ],
  },
  {
    heading: "Accepting Bookings",
    blocks: [
      { type: "p", text: "You should only accept bookings that you are suitably qualified, experienced and equipped to complete." },
      { type: "p", text: "Before accepting a booking, you should consider:" },
      {
        type: "bullets",
        items: [
          "the vehicle;",
          "requested work;",
          "your qualifications;",
          "required tools;",
          "required equipment;",
          "required parts;",
          "location;",
          "access;",
          "estimated time;",
          "safety considerations; and",
          "whether you can complete the work to the required standard.",
        ],
      },
      { type: "p", text: "Once you accept a booking, you are expected to make reasonable efforts to attend and complete the agreed work." },
    ],
  },
  {
    heading: "Booking Information",
    blocks: [
      { type: "p", text: "You must carefully review the information provided for each booking." },
      { type: "p", text: "If information is unclear, incomplete or appears incorrect, contact Book My Tech before attending where reasonably possible." },
      { type: "p", text: "You must not knowingly accept work that you cannot safely or competently perform." },
    ],
  },
  {
    heading: "Attendance and Punctuality",
    blocks: [
      { type: "p", text: "Customers rely on mechanics attending at the agreed time." },
      { type: "p", text: "You must make reasonable efforts to:" },
      {
        type: "bullets",
        items: [
          "arrive on time;",
          "attend the correct location;",
          "communicate appropriately;",
          "have the necessary tools and equipment;",
          "have agreed parts where applicable; and",
          "complete the booked work within a reasonable timeframe.",
        ],
      },
      { type: "p", text: "If you are delayed, notify Book My Tech as soon as reasonably possible." },
      { type: "p", text: "Repeated or unreasonable cancellations or delays may result in action against your account." },
    ],
  },
  {
    heading: "Cancelling a Booking",
    blocks: [
      { type: "p", text: "If you need to cancel a booking, notify Book My Tech as soon as possible." },
      { type: "p", text: "You must not cancel a booking because:" },
      {
        type: "bullets",
        items: [
          "you have received a more profitable job;",
          "you want to avoid the Book My Tech platform fee;",
          "you want the customer to book privately;",
          "you want to arrange the work directly with the customer; or",
          "you otherwise wish to circumvent the platform.",
        ],
      },
      { type: "p", text: "Repeated or unreasonable cancellations may result in suspension or removal from the platform." },
    ],
  },
  {
    heading: "Customer Contact",
    blocks: [
      { type: "p", text: "Book My Tech may provide customer information that is necessary for you to complete a booking." },
      { type: "p", text: "You must use customer information only for legitimate purposes connected with the Book My Tech booking." },
      { type: "p", text: "You must not use customer information to:" },
      {
        type: "bullets",
        items: [
          "arrange private work;",
          "solicit customers away from Book My Tech;",
          "provide private quotations;",
          "arrange private payments;",
          "arrange future work outside Book My Tech;",
          "market unrelated services without appropriate permission; or",
          "otherwise circumvent the platform.",
        ],
      },
    ],
  },
  {
    heading: "Professional Conduct",
    blocks: [
      { type: "p", text: "You must treat every customer respectfully, honestly and professionally." },
      { type: "p", text: "You must not engage in:" },
      {
        type: "bullets",
        items: [
          "abusive behaviour;",
          "threatening behaviour;",
          "harassment;",
          "discrimination;",
          "intimidation;",
          "inappropriate conduct; or",
          "behaviour that could reasonably damage the reputation of Book My Tech.",
        ],
      },
      { type: "p", text: "Book My Tech may investigate complaints concerning your conduct." },
    ],
  },
  {
    heading: "Standard of Work",
    blocks: [
      { type: "p", text: "You must carry out Book My Tech work:" },
      {
        type: "bullets",
        items: [
          "with reasonable skill and care;",
          "using appropriate tools and equipment;",
          "in accordance with applicable laws;",
          "using appropriate manufacturer procedures where applicable;",
          "within your professional competence; and",
          "in accordance with the agreed booking.",
        ],
      },
      { type: "p", text: "You must not knowingly carry out unsafe, unlawful or unnecessary work." },
    ],
  },
  {
    heading: "Additional Work",
    blocks: [
      { type: "p", text: "If you identify additional work that you believe is required, you must not simply agree a private price with the customer." },
      { type: "p", text: "All additional work arising from a Book My Tech booking must be submitted through the Book My Tech platform." },
      { type: "p", text: "This includes:" },
      {
        type: "bullets",
        items: [
          "additional repairs;",
          "additional parts;",
          "additional labour;",
          "repairs identified during diagnostics;",
          "repairs identified during inspections;",
          "servicing;",
          "maintenance;",
          "follow-up repairs;",
          "return visits;",
          "recommended repairs; and",
          "any other automotive work arising from the original Book My Tech booking.",
        ],
      },
    ],
  },
  {
    heading: "Additional Work Must Go Through Book My Tech",
    blocks: [
      { type: "p", text: "All additional work must be quoted, approved, booked and paid for through Book My Tech." },
      { type: "p", text: "You must not carry out chargeable additional work until the customer has approved that work through the Book My Tech platform, except where immediate action is reasonably necessary to address a serious safety risk." },
      { type: "p", text: "The customer must be able to see the proposed work and applicable price before approving it." },
    ],
  },
  {
    heading: "Private Quotations Are Prohibited",
    blocks: [
      { type: "p", text: "You must not provide a customer introduced through Book My Tech with a private quotation for additional work arising from a Book My Tech booking." },
      { type: "p", text: "You must not:" },
      {
        type: "bullets",
        items: [
          "give a private price;",
          "offer a private cash price;",
          "offer a private discount in exchange for bypassing Book My Tech;",
          "provide personal bank details for additional work;",
          "issue a private invoice;",
          "provide a private payment link;",
          "arrange a private appointment; or",
          "otherwise arrange additional work outside the platform.",
        ],
      },
      { type: "p", text: "If additional work is required, submit it through Book My Tech." },
    ],
  },
  {
    heading: "Customer Approval of Additional Work",
    blocks: [
      { type: "p", text: "Before chargeable additional work is undertaken, the customer must approve the work through Book My Tech." },
      { type: "p", text: "The customer should be able to understand:" },
      {
        type: "bullets",
        items: [
          "what work is required;",
          "why the work is recommended;",
          "the applicable price; and",
          "any relevant information about the proposed work.",
        ],
      },
      { type: "p", text: "Once approved through Book My Tech, you may proceed." },
      { type: "p", text: "If the customer declines the additional work, you must respect that decision, subject to legitimate safety considerations." },
    ],
  },
  {
    heading: "Safety-Critical Work",
    blocks: [
      { type: "p", text: "If immediate action is reasonably necessary to protect the customer, vehicle or other persons from a serious safety risk, you should contact Book My Tech as soon as reasonably possible." },
      { type: "p", text: "You must not use an alleged safety issue as a means of bypassing the normal Book My Tech quotation and payment process for ordinary additional repairs." },
    ],
  },
  {
    heading: "Off-Platform Bookings",
    blocks: [
      { type: "h3", text: "Strictly prohibited" },
      { type: "p", text: "Off-platform bookings are against Book My Tech policy and are strictly prohibited." },
      { type: "p", text: "If a customer is introduced to you through Book My Tech, you must not arrange a Book My Tech-related service privately with that customer." },
      { type: "p", text: "You must not ask, encourage, pressure or allow a customer to:" },
      {
        type: "bullets",
        items: [
          "cancel a Book My Tech booking and book directly with you;",
          "pay you directly;",
          "pay cash;",
          "pay by bank transfer;",
          "arrange a private quotation;",
          "arrange additional work privately;",
          "arrange future work privately;",
          "arrange another appointment outside Book My Tech;",
          "use your personal payment details; or",
          "otherwise circumvent Book My Tech.",
        ],
      },
      { type: "p", text: "This rule applies regardless of whether the customer or mechanic suggests going off-platform." },
      { type: "p", text: "If a customer asks you to deal privately, you must direct them back to Book My Tech." },
    ],
  },
  {
    heading: "Future Work",
    blocks: [
      { type: "p", text: "Where Book My Tech has introduced you to a customer, future automotive work arising from that customer relationship must be arranged through Book My Tech." },
      { type: "p", text: "This includes:" },
      {
        type: "bullets",
        items: [
          "future servicing;",
          "repairs;",
          "diagnostics;",
          "inspections;",
          "follow-up visits;",
          "additional repairs;",
          "maintenance;",
          "seasonal work; and",
          "other automotive services.",
        ],
      },
      { type: "p", text: "You must not use a Book My Tech customer introduction to establish a private relationship designed to bypass the platform." },
    ],
  },
  {
    heading: "Reporting Off-Platform Requests",
    blocks: [
      { type: "p", text: "If a customer asks you to arrange work privately, politely decline and direct them back to Book My Tech." },
      { type: "p", text: "You should report suspected attempts to bypass the platform to:" },
      { type: "p", text: "support@bookmytech.co.uk" },
      { type: "p", text: "A mechanic will not be penalised for honestly reporting a customer request to bypass Book My Tech." },
    ],
  },
  {
    heading: "Parts",
    blocks: [
      { type: "p", text: "You are responsible for ensuring that parts you supply are appropriate for the vehicle and agreed work." },
      { type: "p", text: "You should:" },
      {
        type: "bullets",
        items: [
          "check compatibility;",
          "obtain appropriate parts;",
          "use suitable quality components;",
          "retain relevant invoices or evidence of purchase; and",
          "provide accurate information about parts supplied.",
        ],
      },
      { type: "p", text: "You must not knowingly fit defective, unsafe or unsuitable parts." },
    ],
  },
  {
    heading: "Customer-Supplied Parts",
    blocks: [
      { type: "p", text: "You may decline to install customer-supplied parts where you reasonably believe they are:" },
      {
        type: "bullets",
        items: [
          "unsuitable;",
          "defective;",
          "unsafe;",
          "incompatible; or",
          "inappropriate for the vehicle.",
        ],
      },
      { type: "p", text: "Where you agree to install a customer-supplied part, you must explain that the Book My Tech parts warranty may not apply to that part." },
    ],
  },
  {
    heading: "Pricing",
    blocks: [
      { type: "p", text: "You must provide Book My Tech with accurate pricing information." },
      { type: "p", text: "You must not:" },
      {
        type: "bullets",
        items: [
          "deliberately underquote to secure a booking and then inflate the price without justification;",
          "conceal required charges;",
          "create false additional charges;",
          "provide misleading parts prices; or",
          "arrange private pricing with the customer.",
        ],
      },
      { type: "p", text: "Any additional charge must be submitted through Book My Tech and approved before the additional work is carried out." },
    ],
  },
  {
    heading: "Payments",
    blocks: [
      { type: "p", text: "Payments for Book My Tech bookings must be processed through the Book My Tech platform." },
      { type: "p", text: "Payments are processed using Stripe." },
      { type: "p", text: "You must not request direct payment from a customer for Book My Tech work." },
      { type: "p", text: "This includes:" },
      {
        type: "bullets",
        items: [
          "cash;",
          "bank transfer;",
          "direct card payment;",
          "private payment links;",
          "cheque; or",
          "any other private payment arrangement.",
        ],
      },
    ],
  },
  {
    heading: "Book My Tech Platform Fee",
    blocks: [
      { type: "p", text: "Book My Tech charges mechanics a 15% platform fee, inclusive of VAT, on the applicable booking value processed through the Book My Tech platform." },
      { type: "p", text: "The 15% platform fee is the total platform fee payable by the mechanic to Book My Tech, inclusive of VAT where VAT is applicable." },
      { type: "p", text: "The platform fee covers services that may include:" },
      {
        type: "bullets",
        items: [
          "customer acquisition;",
          "access to the Book My Tech marketplace;",
          "booking management;",
          "customer communications;",
          "payment administration;",
          "quotation management;",
          "customer support;",
          "warranty administration;",
          "platform technology;",
          "mechanic onboarding and vetting; and",
          "other services provided through the Book My Tech platform.",
        ],
      },
      { type: "h3", text: "Example" },
      { type: "p", text: `If a customer pays ${formatPrice(EXAMPLE_TOTAL_PENCE)} for an applicable Book My Tech booking:` },
      {
        type: "table",
        head: ["Description", "Amount"],
        rows: [
          ["Customer booking price", formatPrice(EXAMPLE_TOTAL_PENCE)],
          [`Book My Tech platform fee — ${pct} inclusive of VAT`, formatPrice(feePence)],
          ["Mechanic amount before any other applicable deductions", formatPrice(EXAMPLE_TOTAL_PENCE - feePence)],
        ],
      },
      { type: "p", text: `The ${formatPrice(feePence)} platform fee is the total Book My Tech platform fee, including VAT where applicable.` },
      { type: "p", text: "Where Book My Tech has agreed a different platform fee rate with you in writing, that rate applies in place of 15% to the bookings it covers. The rate that applies to a booking is shown in your dashboard before you accept it." },
      { type: "p", text: "The mechanic remains responsible for their own tax, National Insurance and other business obligations." },
      { type: "p", text: "The actual amount paid to a mechanic may be affected by refunds, chargebacks, cancellations, payment adjustments or other deductions permitted under these Terms or applicable commercial terms." },
    ],
  },
  {
    heading: "Avoiding the Platform Fee",
    blocks: [
      { type: "p", text: "Mechanics must not attempt to avoid or circumvent the 15% platform fee by:" },
      {
        type: "bullets",
        items: [
          "arranging private bookings;",
          "providing private quotations;",
          "accepting direct payment;",
          "moving additional work off-platform;",
          "arranging future work privately;",
          "asking customers to cancel and rebook directly;",
          "providing personal payment details; or",
          "otherwise circumventing Book My Tech.",
        ],
      },
      { type: "p", text: "Deliberately avoiding the 15% platform fee is a serious breach of these Terms." },
      { type: "p", text: "Depending on the circumstances, Book My Tech may:" },
      {
        type: "bullets",
        items: [
          "investigate the matter;",
          "suspend the mechanic’s account;",
          "restrict access to new bookings;",
          "remove the mechanic from the platform; and/or",
          "take any other action available under these Terms or applicable law.",
        ],
      },
    ],
  },
  {
    heading: "No Circumvention of Book My Tech",
    blocks: [
      { type: "p", text: "You must not attempt to circumvent:" },
      {
        type: "bullets",
        items: [
          "the booking system;",
          "payment system;",
          "quotation system;",
          "customer support;",
          "warranty process;",
          "platform fee;",
          "customer protection procedures; or",
          "any other important part of the Book My Tech platform.",
        ],
      },
      { type: "p", text: "Platform circumvention is a serious breach of these Terms." },
    ],
  },
  {
    heading: "Warranty",
    blocks: [
      { type: "p", text: "Book My Tech provides customers with an applicable 12-month / 12,000-mile warranty for eligible parts and labour, whichever occurs first." },
      { type: "p", text: "As a Book My Tech mechanic, you agree to comply with the Book My Tech warranty requirements." },
      { type: "p", text: "Where a valid warranty issue arises, you may be required to inspect and rectify the relevant work." },
    ],
  },
  {
    heading: "Warranty Responsibilities",
    blocks: [
      { type: "p", text: "Where a customer reports a potential warranty issue, Book My Tech may contact you." },
      { type: "p", text: "You may be required to:" },
      {
        type: "bullets",
        items: [
          "inspect the vehicle;",
          "investigate the reported fault;",
          "provide information about the original work;",
          "identify relevant parts;",
          "provide evidence of parts supplied;",
          "rectify eligible workmanship issues; and",
          "cooperate with Book My Tech in resolving the claim.",
        ],
      },
      { type: "p", text: "You must not refuse to investigate a legitimate warranty concern without reasonable grounds." },
    ],
  },
  {
    heading: "Warranty Period",
    blocks: [
      { type: "p", text: "The standard warranty period is 12 months or 12,000 miles, whichever occurs first." },
      { type: "p", text: "The warranty applies to eligible parts and labour supplied as part of the original repair." },
      { type: "p", text: "The warranty does not normally cover:" },
      {
        type: "bullets",
        items: [
          "normal wear and tear;",
          "consumables;",
          "unrelated faults;",
          "accident damage;",
          "misuse;",
          "neglect;",
          "modifications;",
          "customer-supplied parts;",
          "damage caused by another component;",
          "repairs performed by another party; or",
          "issues unrelated to the original work.",
        ],
      },
    ],
  },
  {
    heading: "Warranty Inspection",
    blocks: [
      { type: "p", text: "If a customer makes a warranty claim, Book My Tech may arrange for you to inspect the vehicle." },
      { type: "p", text: "You must reasonably cooperate with the inspection." },
      { type: "p", text: "You should determine whether the issue appears to be:" },
      {
        type: "bullets",
        items: [
          "defective workmanship;",
          "a defective part supplied by you;",
          "an unrelated fault;",
          "normal wear and tear; or",
          "another cause.",
        ],
      },
      { type: "p", text: "If the issue is covered by the warranty, you may be required to carry out appropriate remedial work." },
    ],
  },
  {
    heading: "Warranty Disputes",
    blocks: [
      { type: "p", text: "If you disagree with a warranty claim, provide Book My Tech with a reasonable explanation and supporting evidence where available." },
      { type: "p", text: "This may include:" },
      {
        type: "bullets",
        items: [
          "photographs;",
          "diagnostic results;",
          "parts invoices;",
          "vehicle history;",
          "repair notes;",
          "technical information; and",
          "other relevant evidence.",
        ],
      },
      { type: "p", text: "Book My Tech may review the evidence and seek an independent assessment where appropriate." },
    ],
  },
  {
    heading: "Record Keeping",
    blocks: [
      { type: "p", text: "You should retain appropriate records relating to Book My Tech work." },
      { type: "p", text: "These may include:" },
      {
        type: "bullets",
        items: [
          "parts invoices;",
          "diagnostic information;",
          "photographs;",
          "job notes;",
          "customer approvals;",
          "vehicle mileage;",
          "vehicle information; and",
          "details of work completed.",
        ],
      },
      { type: "p", text: "Book My Tech may request these records when investigating a complaint or warranty claim." },
    ],
  },
  {
    heading: "Photographs and Evidence",
    blocks: [
      { type: "p", text: "Where appropriate, you should take photographs before and after significant repairs." },
      { type: "p", text: "Photographs may help establish:" },
      {
        type: "bullets",
        items: [
          "vehicle condition;",
          "damage;",
          "parts fitted;",
          "repair progress;",
          "completed work; and",
          "warranty issues.",
        ],
      },
      { type: "p", text: "Customer information and photographs must be handled appropriately and in accordance with applicable data protection law." },
    ],
  },
  {
    heading: "Vehicle Damage",
    blocks: [
      { type: "p", text: "You must take reasonable care when working on customer vehicles." },
      { type: "p", text: "If you become aware that you have damaged a customer’s vehicle, notify Book My Tech promptly." },
      { type: "p", text: "You must not conceal damage from Book My Tech or the customer." },
    ],
  },
  {
    heading: "Safety",
    blocks: [
      { type: "p", text: "You must comply with applicable health and safety requirements." },
      { type: "p", text: "You must not work on a vehicle where:" },
      {
        type: "bullets",
        items: [
          "the location is unsafe;",
          "the vehicle presents an unacceptable risk;",
          "required equipment is unavailable;",
          "you are not competent to perform the work; or",
          "continuing would be unlawful or unsafe.",
        ],
      },
      { type: "p", text: "Where work cannot safely be completed, contact Book My Tech." },
    ],
  },
  {
    heading: "Tools and Equipment",
    blocks: [
      { type: "p", text: "You are responsible for providing suitable tools and equipment for the services you accept." },
      { type: "p", text: "Your equipment must be:" },
      {
        type: "bullets",
        items: [
          "appropriate;",
          "maintained;",
          "safe; and",
          "suitable for the work being carried out.",
        ],
      },
    ],
  },
  {
    heading: "Insurance",
    blocks: [
      { type: "p", text: "You must maintain appropriate insurance for services provided through Book My Tech." },
      { type: "p", text: "You must provide evidence of insurance when requested." },
      { type: "p", text: "If your insurance expires, is cancelled, becomes invalid or materially changes, you must notify Book My Tech immediately and stop accepting affected bookings until the matter has been resolved." },
    ],
  },
  {
    heading: "Qualifications and Competence",
    blocks: [
      { type: "p", text: "You must only accept work that you are competent and appropriately qualified to perform." },
      { type: "p", text: "You must not misrepresent:" },
      {
        type: "bullets",
        items: [
          "qualifications;",
          "experience;",
          "specialist skills;",
          "certifications; or",
          "ability to perform a particular repair.",
        ],
      },
    ],
  },
  {
    heading: "MOT and Specialist Services",
    blocks: [
      { type: "p", text: "If you provide MOT testing or another regulated automotive service, you must hold all required approvals and authorisations." },
      { type: "p", text: "You must not represent yourself as authorised to provide a regulated service unless you are appropriately authorised." },
    ],
  },
  {
    heading: "Customer Reviews",
    blocks: [
      { type: "p", text: "Book My Tech may invite customers to review your services." },
      { type: "p", text: "Reviews must not be manipulated." },
      { type: "p", text: "You must not:" },
      {
        type: "bullets",
        items: [
          "create fake reviews;",
          "offer payment for positive reviews;",
          "threaten customers over negative reviews;",
          "create fake accounts;",
          "submit reviews about yourself; or",
          "deliberately manipulate ratings.",
        ],
      },
    ],
  },
  {
    heading: "Customer Complaints",
    blocks: [
      { type: "p", text: "If Book My Tech receives a complaint about your work, we may contact you." },
      { type: "p", text: "You must cooperate reasonably with our investigation." },
      { type: "p", text: "We may request:" },
      {
        type: "bullets",
        items: [
          "your account of events;",
          "job notes;",
          "photographs;",
          "parts invoices;",
          "diagnostic information;",
          "evidence of customer approval;",
          "information about the work carried out; and",
          "other relevant information.",
        ],
      },
      { type: "p", text: "You must provide accurate information." },
    ],
  },
  {
    heading: "Customer Conduct",
    blocks: [
      { type: "p", text: "If a customer behaves abusively, threateningly or unsafely, prioritise your safety." },
      { type: "p", text: "Where reasonably possible, notify Book My Tech." },
      { type: "p", text: "You do not have to continue working where you reasonably believe there is a serious safety risk." },
    ],
  },
  {
    heading: "Data Protection",
    blocks: [
      { type: "p", text: "You must only use customer information for legitimate purposes connected with the Book My Tech booking." },
      { type: "p", text: "You must not:" },
      {
        type: "bullets",
        items: [
          "sell customer information;",
          "share customer information without appropriate authority;",
          "use customer information for private marketing;",
          "use customer information to arrange off-platform work; or",
          "retain information unnecessarily.",
        ],
      },
      { type: "p", text: "You must comply with applicable UK data protection legislation." },
    ],
  },
  {
    heading: "Confidentiality",
    blocks: [
      { type: "p", text: "Information obtained through Book My Tech about customers, bookings, prices, platform operations and other mechanics should be treated as confidential where appropriate." },
      { type: "p", text: "You must not disclose confidential information except where legally required or necessary to perform the booking." },
    ],
  },
  {
    heading: "Account Security",
    blocks: [
      { type: "p", text: "You are responsible for keeping your Book My Tech account secure." },
      { type: "p", text: "You must not:" },
      {
        type: "bullets",
        items: [
          "share login details;",
          "allow another person to use your account;",
          "create false mechanic accounts; or",
          "allow unauthorised persons to access customer information.",
        ],
      },
      { type: "p", text: "Notify Book My Tech if you believe your account has been compromised." },
    ],
  },
  {
    heading: "Platform Availability",
    blocks: [
      { type: "p", text: "Book My Tech aims to provide a reliable platform but cannot guarantee uninterrupted availability." },
      { type: "p", text: "The platform may occasionally be unavailable because of:" },
      {
        type: "bullets",
        items: [
          "maintenance;",
          "technical problems;",
          "security issues;",
          "third-party failures; or",
          "circumstances outside our reasonable control.",
        ],
      },
    ],
  },
  {
    heading: "Suspension",
    blocks: [
      { type: "p", text: "Book My Tech may suspend your account while investigating:" },
      {
        type: "bullets",
        items: [
          "serious complaints;",
          "suspected fraud;",
          "safety concerns;",
          "insurance issues;",
          "qualification issues;",
          "warranty disputes;",
          "off-platform activity;",
          "customer data misuse;",
          "repeated cancellations;",
          "fee avoidance; or",
          "other potential breaches.",
        ],
      },
      { type: "p", text: "Where appropriate, we may provide you with an opportunity to respond." },
    ],
  },
  {
    heading: "Removal From the Platform",
    blocks: [
      { type: "p", text: "Book My Tech may remove a mechanic from the platform where reasonably necessary." },
      { type: "p", text: "Reasons may include:" },
      {
        type: "bullets",
        items: [
          "serious misconduct;",
          "unsafe work;",
          "repeated poor workmanship;",
          "fraud;",
          "deliberate platform circumvention;",
          "private quotations;",
          "off-platform bookings;",
          "direct payment requests;",
          "platform-fee avoidance;",
          "failure to maintain insurance;",
          "false information;",
          "serious customer complaints;",
          "warranty abuse; or",
          "another material breach of these Terms.",
        ],
      },
      { type: "p", text: "Removal does not remove obligations relating to existing bookings, outstanding warranty claims or other obligations that survive termination." },
    ],
  },
  {
    heading: "Serious Breach — Off-Platform Work",
    blocks: [
      { type: "p", text: "Because Book My Tech operates a managed marketplace, deliberately taking customers or work away from the platform is a serious breach of these Terms." },
      { type: "p", text: "This includes:" },
      {
        type: "bullets",
        items: [
          "private quotations;",
          "private additional repairs;",
          "private payments;",
          "future private bookings arising from a Book My Tech customer;",
          "asking customers to bypass Book My Tech;",
          "concealing off-platform work; and",
          "deliberately avoiding the 15% platform fee.",
        ],
      },
      { type: "p", text: "Depending on the circumstances, this may result in immediate suspension or removal from Book My Tech." },
    ],
  },
  {
    heading: "Events Outside Our Control",
    blocks: [
      { type: "p", text: "Book My Tech will not be responsible for delays caused by circumstances outside our reasonable control." },
      { type: "p", text: "These may include:" },
      {
        type: "bullets",
        items: [
          "severe weather;",
          "flooding;",
          "accidents;",
          "major traffic disruption;",
          "strikes;",
          "public emergencies;",
          "telecommunications failures;",
          "power failures;",
          "supplier failures;",
          "major technical failures; or",
          "other circumstances beyond reasonable control.",
        ],
      },
    ],
  },
  {
    heading: "Intellectual Property",
    blocks: [
      { type: "p", text: "The Book My Tech name, branding, website, software and platform content belong to Book My Tech Ltd or our licensors unless otherwise stated." },
      { type: "p", text: "You may not copy, reproduce or commercially exploit Book My Tech materials without permission." },
    ],
  },
  {
    heading: "Changes to These Terms",
    blocks: [
      { type: "p", text: "We may update these Terms from time to time." },
      { type: "p", text: "Where changes materially affect your use of the platform, we will provide appropriate notice where required." },
      { type: "p", text: "Your continued use of Book My Tech following a notified change may constitute acceptance of the updated Terms." },
    ],
  },
  {
    heading: "No Waiver",
    blocks: [
      { type: "p", text: "If Book My Tech does not immediately enforce a provision of these Terms, this does not mean that we waive our right to enforce it later." },
    ],
  },
  {
    heading: "Severability",
    blocks: [
      { type: "p", text: "If any provision of these Terms is found to be invalid or unenforceable, the remaining provisions will continue to apply." },
    ],
  },
  {
    heading: "Entire Agreement",
    blocks: [
      { type: "p", text: "These Mechanic Terms, together with any separate commercial terms, account requirements, policies and booking requirements provided by Book My Tech, form the agreement governing your use of the platform." },
    ],
  },
  {
    heading: "Governing Law",
    blocks: [
      { type: "p", text: "These Terms are governed by the laws of England and Wales." },
      { type: "p", text: "Any dispute will be dealt with in accordance with applicable law." },
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
        "Mechanic Support:",
        "support@bookmytech.co.uk",
      ] },
    ],
  },
  {
    heading: "Mechanic Key Rules",
    blocks: [
      {
        type: "table",
        head: ["Requirement", "Book My Tech Policy"],
        rows: [
          ["Mechanic vetting", "Required before onboarding"],
          ["Insurance", "Appropriate insurance required"],
          ["Qualifications", "Mechanic must be competent for work accepted"],
          ["Customer treatment", "Professional and respectful"],
          ["Platform fee", "15% of applicable booking value, inclusive of VAT"],
          ["Additional work", "Must go through Book My Tech"],
          ["Private additional quotations", "Strictly prohibited"],
          ["Private payments", "Prohibited for Book My Tech work"],
          ["Off-platform bookings", "Strictly prohibited"],
          ["Future work from Book My Tech customers", "Must remain through Book My Tech"],
          ["Customer data", "Must only be used for legitimate booking purposes"],
          ["Warranty", "12 months / 12,000 miles on eligible parts and labour"],
          ["Warranty claims", "Mechanic must reasonably cooperate"],
          ["Customer complaints", "Mechanic must cooperate with investigations"],
          ["Unsafe work", "Must not be carried out"],
          ["False information", "Prohibited"],
          ["Platform fee avoidance", "Serious breach"],
          ["Platform circumvention", "Serious breach"],
        ],
      },
    ],
  },
  {
    heading: "Our Expectations of Every Book My Tech Mechanic",
    blocks: [
      { type: "p", text: "By joining Book My Tech, you agree to uphold the following standards:" },
      {
        type: "numbered",
        items: [
          { title: "Put the customer first.", text: "Treat every customer fairly, honestly and professionally." },
          { title: "Do quality work.", text: "Carry out work with reasonable skill and care and only accept jobs you are competent to complete." },
          { title: "Be transparent.", text: "Explain faults, repairs and additional work clearly." },
          { title: "Keep additional work on Book My Tech.", text: "Never privately quote or arrange additional work arising from a Book My Tech booking." },
          { title: "Keep bookings on Book My Tech.", text: "Never take a Book My Tech customer or booking off-platform." },
          { title: "Pay the 15% platform fee.", text: "The applicable Book My Tech platform fee is 15% of the applicable booking value, inclusive of VAT. This 15% represents the total platform fee payable to Book My Tech, including VAT where applicable." },
          { title: "Respect the warranty.", text: "Cooperate with legitimate warranty claims and help resolve problems fairly." },
          { title: "Protect customer information.", text: "Use customer information only for legitimate Book My Tech purposes." },
          { title: "Keep customers safe.", text: "Never carry out work that you reasonably believe is unsafe." },
          { title: "Maintain your standards.", text: "Keep your insurance, qualifications, equipment and professional standards up to date." },
          { title: "Protect the Book My Tech reputation.", text: "Your conduct represents both your business and the Book My Tech marketplace." },
        ],
      },
    ],
  },
  {
    heading: "Mechanic Declaration",
    blocks: [
      { type: "p", text: "By accepting bookings through Book My Tech, you confirm that:" },
      {
        type: "bullets",
        items: [
          "the information you have provided to Book My Tech is accurate;",
          "you are suitably qualified and competent for the work you accept;",
          "you maintain appropriate insurance;",
          "you will comply with applicable laws;",
          "you will carry out work with reasonable skill and care;",
          "you will comply with the Book My Tech warranty;",
          "you will not privately quote additional work arising from Book My Tech bookings;",
          "you will not arrange off-platform bookings;",
          "you will not request private payment for Book My Tech work;",
          "you will pay the applicable 15% Book My Tech platform fee, inclusive of VAT;",
          "you acknowledge that the 15% platform fee represents the total platform fee payable to Book My Tech, inclusive of VAT where applicable;",
          "you will not attempt to circumvent or avoid the 15% platform fee;",
          "you will not use a Book My Tech customer introduction to arrange private work;",
          "all additional work arising from a Book My Tech booking will be quoted, approved, booked and paid for through the Book My Tech platform;",
          "you will protect customer information;",
          "you will cooperate with reasonable complaints and warranty investigations; and",
          "you will comply with these Mechanic Terms & Conditions.",
        ],
      },
      { type: "p", text: "Book My Tech Ltd reserves the right to investigate breaches of these Terms and take appropriate action to protect customers, mechanics and the integrity of the Book My Tech platform." },
    ],
  },
  ];
}
