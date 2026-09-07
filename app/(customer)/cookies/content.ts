import type { LegalBlock, LegalSection } from "../_components/legal-page";

// Hand-converted from Brad's "cookie policy.odt" (docs/legal/, 26 August 2026).
// Deviations from the document: the author's drafting notes are omitted, §7 and
// §9 describe the consent banner the site actually has, and §17 lists the
// cookies actually in use rather than the document's placeholder line.

export const PREAMBLE: LegalBlock[] = [
  { type: "address", lines: [
    "Book My Tech Ltd",
    "Company number: 17379663",
    "Registered office: 2 Syerscote Lane, Wigginton, B79 9DX, United Kingdom",
    "Email: support@bookmytech.co.uk",
  ] },
];

export const SECTIONS: LegalSection[] = [
  {
    heading: "About this Cookie Policy",
    blocks: [
      { type: "p", text: "This Cookie Policy explains how Book My Tech Ltd (“Book My Tech”, “we”, “us” or “our”) uses cookies and similar technologies when you visit or use our website and online booking platform." },
      { type: "p", text: "This policy should be read together with our Privacy Policy and Terms & Conditions." },
    ],
  },
  {
    heading: "What are cookies?",
    blocks: [
      { type: "p", text: "Cookies are small text files that are placed on your computer, phone, tablet or other device when you visit a website." },
      { type: "p", text: "They allow websites to recognise your device and, depending on the type of cookie, remember information about your visit." },
      { type: "p", text: "We may also use similar technologies, including:" },
      {
        type: "bullets",
        items: [
          "pixels;",
          "tags;",
          "local storage;",
          "device identifiers; and",
          "other similar technologies.",
        ],
      },
    ],
  },
  {
    heading: "Why does Book My Tech use cookies?",
    blocks: [
      { type: "p", text: "We use cookies and similar technologies to help us:" },
      {
        type: "bullets",
        items: [
          "make our website work;",
          "provide our booking service;",
          "keep accounts secure;",
          "remember your preferences;",
          "remember information during a booking;",
          "process payments;",
          "prevent fraud;",
          "understand how our website is being used;",
          "improve website performance;",
          "identify technical problems;",
          "measure the effectiveness of marketing; and",
          "provide relevant advertising where permitted.",
        ],
      },
    ],
  },
  {
    heading: "Types of cookies we use",
    blocks: [
      { type: "p", text: "Cookies can generally be divided into different categories." },
      { type: "h3", text: "4.1 Strictly necessary cookies" },
      { type: "p", text: "These cookies are required for our website or booking platform to function properly." },
      { type: "p", text: "They may be used for:" },
      {
        type: "bullets",
        items: [
          "account login;",
          "account security;",
          "session management;",
          "booking functionality;",
          "payment functionality;",
          "fraud prevention;",
          "maintaining your booking session; and",
          "other essential platform functions.",
        ],
      },
      { type: "p", text: "Where a cookie is genuinely necessary to provide a service you have requested, consent may not be required under applicable law." },
      { type: "h3", text: "4.2 Preference cookies" },
      { type: "p", text: "Preference cookies allow Book My Tech to remember choices you have made." },
      { type: "p", text: "For example, they may remember:" },
      {
        type: "bullets",
        items: [
          "language preferences;",
          "region;",
          "display settings;",
          "cookie preferences; and",
          "other settings.",
        ],
      },
      { type: "p", text: "Where consent is legally required, we will ask for your consent before using these cookies." },
      { type: "h3", text: "4.3 Analytics cookies" },
      { type: "p", text: "Analytics cookies help us understand how people use Book My Tech." },
      { type: "p", text: "They may help us understand:" },
      {
        type: "bullets",
        items: [
          "which pages are visited;",
          "how visitors navigate the website;",
          "which features are used;",
          "how long visitors spend on pages;",
          "website performance;",
          "technical errors; and",
          "areas where we can improve the customer experience.",
        ],
      },
      { type: "p", text: "We will obtain consent where required before using non-essential analytics cookies." },
      { type: "h3", text: "4.4 Marketing cookies" },
      { type: "p", text: "Marketing cookies may help us:" },
      {
        type: "bullets",
        items: [
          "measure advertising campaigns;",
          "understand interactions with advertisements;",
          "measure conversions;",
          "provide relevant advertising;",
          "avoid showing the same advertisement repeatedly; and",
          "understand how visitors arrive at our website.",
        ],
      },
      { type: "p", text: "Where required by law, we will obtain your consent before using marketing cookies." },
    ],
  },
  {
    heading: "First-party and third-party cookies",
    blocks: [
      { type: "p", text: "Some cookies are placed directly by Book My Tech." },
      { type: "p", text: "These are known as first-party cookies." },
      { type: "p", text: "Other cookies may be placed by companies that provide services to us." },
      { type: "p", text: "These are known as third-party cookies." },
      { type: "p", text: "Third-party services may include providers supporting:" },
      {
        type: "bullets",
        items: [
          "payments;",
          "security;",
          "analytics;",
          "advertising;",
          "customer communications;",
          "website functionality; and",
          "other technical services.",
        ],
      },
      { type: "p", text: "The third party may process information collected through its technology in accordance with its own privacy policy." },
    ],
  },
  {
    heading: "Stripe and payment cookies",
    blocks: [
      { type: "p", text: "Book My Tech uses Stripe to process payments." },
      { type: "p", text: "Stripe and related payment technologies may use cookies or similar technologies where necessary for:" },
      {
        type: "bullets",
        items: [
          "payment processing;",
          "authentication;",
          "fraud prevention;",
          "security;",
          "payment functionality; and",
          "maintaining a secure transaction.",
        ],
      },
      { type: "p", text: "Payment technologies may therefore be necessary for customers to complete a booking and payment." },
    ],
  },
  {
    heading: "Cookie consent",
    blocks: [
      { type: "p", text: "Where required by applicable law, Book My Tech will ask for your consent before placing non-essential cookies on your device." },
      { type: "p", text: "When you first visit our website, our cookie banner gives you two options:" },
      {
        type: "bullets",
        items: [
          "Accept all — allows the optional analytics cookie described in section 17 as well as the essential cookies.",
          "Reject non-essential — only essential cookies are used.",
        ],
      },
      { type: "p", text: "We do not currently use marketing cookies. If we introduce them, or any other optional category, we will update this policy and ask for your consent for that category separately." },
    ],
  },
  {
    heading: "Essential cookies cannot always be switched off",
    blocks: [
      { type: "p", text: "Some cookies are necessary for the Book My Tech website to function." },
      { type: "p", text: "For example, cookies may be required to:" },
      {
        type: "bullets",
        items: [
          "log into your account;",
          "keep your booking active;",
          "maintain security;",
          "prevent fraudulent activity; or",
          "complete a payment.",
        ],
      },
      { type: "p", text: "Because these cookies are necessary for the service, they may continue to operate where legally permitted even if you reject optional cookies." },
    ],
  },
  {
    heading: "Managing your cookie preferences",
    blocks: [
      { type: "p", text: "You can change your preferences at any time using the “Cookie settings” link in the footer of every page." },
      { type: "p", text: "You can choose to:" },
      {
        type: "bullets",
        items: [
          "accept optional cookies;",
          "reject optional cookies;",
          "allow particular categories; or",
          "withdraw previously given consent.",
        ],
      },
      { type: "p", text: "Withdrawing consent does not affect the lawfulness of processing carried out before you withdrew it." },
    ],
  },
  {
    heading: "Your browser settings",
    blocks: [
      { type: "p", text: "You can also manage cookies through your internet browser." },
      { type: "p", text: "Most browsers allow you to:" },
      {
        type: "bullets",
        items: [
          "see which cookies are stored;",
          "delete cookies;",
          "block cookies;",
          "block third-party cookies; and",
          "receive notifications when cookies are being used.",
        ],
      },
      { type: "p", text: "If you block all cookies, some parts of the Book My Tech website may not work correctly." },
    ],
  },
  {
    heading: "GDPR and PECR",
    blocks: [
      { type: "p", text: "Book My Tech uses cookies in accordance with applicable UK privacy legislation, including:" },
      {
        type: "bullets",
        items: [
          "the UK General Data Protection Regulation (UK GDPR);",
          "the Data Protection Act 2018; and",
          "the Privacy and Electronic Communications Regulations (PECR).",
        ],
      },
      { type: "p", text: "Where consent is required for a non-essential cookie, we will seek consent before placing that cookie." },
      { type: "p", text: "We will not treat continued browsing of the website as consent where applicable law requires a valid consent mechanism." },
    ],
  },
  {
    heading: "Cookie consent records",
    blocks: [
      { type: "p", text: "Where we obtain consent, we may retain a record of your cookie preferences." },
      { type: "p", text: "This may include:" },
      {
        type: "bullets",
        items: [
          "date and time;",
          "consent status;",
          "cookie categories selected;",
          "technical information necessary to associate the preference with a device; and",
          "changes to your cookie preferences.",
        ],
      },
      { type: "p", text: "We retain these records for as long as reasonably necessary to demonstrate and manage your cookie choices." },
    ],
  },
  {
    heading: "Cookies and personal information",
    blocks: [
      { type: "p", text: "Some cookies may collect information that can identify you or that can be linked to other information about you." },
      { type: "p", text: "Where this occurs, that information will be handled in accordance with our Privacy Policy and applicable UK data protection law." },
      { type: "p", text: "You can read our Privacy Policy for more information about:" },
      {
        type: "bullets",
        items: [
          "what personal information we collect;",
          "why we use it;",
          "how long we retain it;",
          "who we share it with; and",
          "your data-protection rights.",
        ],
      },
    ],
  },
  {
    heading: "International transfers",
    blocks: [
      { type: "p", text: "Some third-party providers may process information outside the United Kingdom." },
      { type: "p", text: "Where personal information is transferred internationally, Book My Tech will use appropriate safeguards where required under UK data protection law." },
      { type: "p", text: "These may include an applicable adequacy decision or appropriate contractual safeguards." },
    ],
  },
  {
    heading: "How long do cookies remain on your device?",
    blocks: [
      { type: "p", text: "Cookies can operate for different periods." },
      { type: "h3", text: "Session cookies" },
      { type: "p", text: "These normally expire when you close your browser." },
      { type: "h3", text: "Persistent cookies" },
      { type: "p", text: "These remain on your device for a specified period or until they are deleted." },
      { type: "p", text: "The length of time depends on the purpose of the particular cookie. The durations of the cookies we currently use are listed in section 17." },
    ],
  },
  {
    heading: "Changes to our cookies",
    blocks: [
      { type: "p", text: "The cookies and technologies used by Book My Tech may change as our website develops." },
      { type: "p", text: "For example, we may introduce:" },
      {
        type: "bullets",
        items: [
          "new security tools;",
          "new analytics services;",
          "new payment functionality;",
          "new customer-support tools; or",
          "new marketing technology.",
        ],
      },
      { type: "p", text: "When this happens, we will update this Cookie Policy and, where required, our cookie-consent mechanism." },
    ],
  },
  {
    heading: "Cookies used by third-party services",
    blocks: [
      { type: "p", text: "Where third-party technologies are used, the relevant provider may have its own privacy and cookie policies." },
      { type: "p", text: "Book My Tech will seek to use reputable service providers and will take appropriate steps where third parties process personal information on our behalf." },
      { type: "p", text: "The cookies currently used on the Book My Tech website are:" },
      {
        type: "table",
        head: ["Cookie", "Category", "Purpose", "Duration"],
        rows: [
          ["Sign-in and session cookies (set by our authentication provider, Supabase)", "Strictly necessary", "Keep you signed in to your account and protect it against unauthorised use.", "Session, refreshed while you use the site"],
          ["bmt_consent", "Strictly necessary", "Remembers the choice you made on the cookie banner.", "12 months"],
          ["bmt_sid", "Analytics", "Links the pages you visit while booking so we can see where the booking process works well and where people drop out. First-party; only set if you choose “Accept all”.", "180 days"],
          ["Stripe cookies", "Strictly necessary", "Set by Stripe on the payment step to process your payment securely and prevent fraud.", "Set by Stripe; see Stripe’s cookie policy"],
        ],
      },
    ],
  },
  {
    heading: "Do Not Track",
    blocks: [
      { type: "p", text: "Some browsers offer a Do Not Track setting." },
      { type: "p", text: "There is currently no single universally accepted technical standard for responding to all Do Not Track signals." },
      { type: "p", text: "Book My Tech will consider applicable legal requirements and available technical standards when determining how such signals are handled." },
    ],
  },
  {
    heading: "Your rights",
    blocks: [
      { type: "p", text: "Depending on the circumstances, UK data protection law gives you rights including:" },
      {
        type: "bullets",
        items: [
          "access to your personal information;",
          "correction of inaccurate information;",
          "deletion in certain circumstances;",
          "restriction of processing;",
          "objection to certain processing;",
          "data portability; and",
          "withdrawal of consent where consent is the legal basis.",
        ],
      },
      { type: "p", text: "For more information, please see our Privacy Policy." },
    ],
  },
  {
    heading: "Complaints",
    blocks: [
      { type: "p", text: "If you have concerns about our use of cookies or your personal information, please contact us first." },
      { type: "address", lines: [
        "Book My Tech Ltd",
        "2 Syerscote Lane",
        "Wigginton",
        "B79 9DX",
        "United Kingdom",
        "Email: support@bookmytech.co.uk",
      ] },
      { type: "p", text: "We will investigate your concern and try to resolve it." },
      { type: "p", text: "You also have the right to complain to the UK’s data protection regulator, the Information Commissioner’s Office (ICO), at ico.org.uk." },
    ],
  },
  {
    heading: "Changes to this Cookie Policy",
    blocks: [
      { type: "p", text: "We may update this Cookie Policy from time to time to reflect:" },
      {
        type: "bullets",
        items: [
          "changes to our website;",
          "new technologies;",
          "changes to third-party providers;",
          "changes in applicable law; or",
          "changes to how we use cookies.",
        ],
      },
      { type: "p", text: "The latest version will always be published on our website." },
    ],
  },
  {
    heading: "Contact Us",
    blocks: [
      { type: "p", text: "If you have questions about this Cookie Policy or our use of cookies, please contact:" },
      { type: "address", lines: [
        "Book My Tech Ltd",
        "Company number: 17379663",
        "2 Syerscote Lane",
        "Wigginton",
        "B79 9DX",
        "United Kingdom",
        "Email: support@bookmytech.co.uk",
      ] },
    ],
  },
];
