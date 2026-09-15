import Image from "next/image";
import Link from "next/link";
import { CookieSettingsLink } from "@/components/cookie-consent";

type FooterColumn = {
  heading: string;
  links: { label: string; href: string }[];
};

// Hand-rolled brand SVGs — lucide-react v1 dropped Twitter/Instagram/LinkedIn
// after the X rebrand. Inline SVG keeps the footer dep-free.
function XSocialIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.674l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function InstagramSocialIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function LinkedInSocialIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.13 1.45-2.13 2.94v5.67H9.35V9h3.42v1.56h.05a3.74 3.74 0 0 1 3.37-1.85c3.6 0 4.27 2.37 4.27 5.46zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0z" />
    </svg>
  );
}

const COLUMNS: FooterColumn[] = [
  {
    heading: "For Customers",
    links: [
      { label: "Book a repair", href: "/book" },
      { label: "How it works", href: "/#how-it-works" },
      { label: "Repairs", href: "/#repairs" },
      { label: "Reviews", href: "/#reviews" },
      { label: "Pricing", href: "/book" },
      { label: "Your bookings", href: "/dashboard" },
    ],
  },
  {
    heading: "For Mechanics",
    links: [
      { label: "Become a mechanic", href: "/mechanics" },
      { label: "Apply now", href: "/mechanics/apply" },
      { label: "Mechanic terms", href: "/mechanic-agreement" },
      { label: "Help centre", href: "/help" },
      { label: "Mechanic login", href: "/mechanic/login" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "Repairs", href: "/#repairs" },
      { label: "Help & FAQ", href: "/help" },
      { label: "For mechanics", href: "/mechanics" },
      { label: "Contact", href: "/help" },
    ],
  },
];

const SOCIALS: { label: string; Icon: () => React.ReactElement; href: string }[] = [
  { label: "X (Twitter)", Icon: XSocialIcon, href: "#" },
  { label: "Instagram", Icon: InstagramSocialIcon, href: "#" },
  { label: "LinkedIn", Icon: LinkedInSocialIcon, href: "#" },
];

const LEGAL_LINKS = [
  { label: "Terms", href: "/terms" },
  { label: "Privacy", href: "/privacy" },
  { label: "Cookies", href: "/cookies" },
] as const;

export function Footer() {
  return (
    // data-hide-sticky-bar: the homepage's mobile sticky bar hides while the
    // footer is on screen so it never covers the legal links.
    <footer data-hide-sticky-bar className="bg-surface-dark text-white/70">
      <div className="mx-auto max-w-content px-4 pb-10 pt-16 sm:px-6">
        <div className="mb-12 grid grid-cols-2 gap-8 md:grid-cols-[2fr_1fr_1fr_1fr] md:gap-10">
          <div className="col-span-2 md:col-span-1">
            <Link href="/" aria-label="Book My Tech home" className="inline-block">
              <Image
                src="/logo-cropped.png"
                alt="Book My Tech"
                width={159}
                height={40}
                className="h-10 w-auto brightness-0 invert"
              />
            </Link>
            <p className="mt-4 max-w-[320px] text-[13px] leading-[1.6]">
              Vetted mobile mechanics. Transparent pricing. Pay only when the job
              is done.
            </p>
            <ul className="mt-5 flex gap-2.5">
              {SOCIALS.map((s) => (
                <li key={s.label}>
                  <a
                    href={s.href}
                    aria-label={s.label}
                    className="flex size-9 items-center justify-center rounded-full border border-white/15 text-white/70 transition-colors hover:border-white/40 hover:text-white"
                  >
                    <s.Icon />
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.heading}>
              <h3 className="mb-3.5 text-xs font-bold uppercase tracking-[0.1em] text-white">
                {col.heading}
              </h3>
              <ul className="flex flex-col gap-2">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link
                      href={l.href}
                      className="text-[13px] leading-[1.6] text-white/70 transition-colors hover:text-white"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-6 text-xs text-white/55">
          <p>© 2026 Book My Tech Ltd. All rights reserved.</p>
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            {LEGAL_LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="transition-colors hover:text-white">
                  {l.label}
                </Link>
              </li>
            ))}
            <li>
              <CookieSettingsLink className="transition-colors hover:text-white" />
            </li>
            <li>
              <Link href="/cancellation-policy" className="transition-colors hover:text-white">
                Cancellations
              </Link>
            </li>
          </ul>
        </div>
        <p className="mt-3 text-xs text-white/45">
          Book My Tech Ltd is registered in England and Wales, company no. 17379663. Registered
          office: 2 Syerscote Lane, Wigginton, B79 9DX, United Kingdom.
        </p>
      </div>
    </footer>
  );
}
