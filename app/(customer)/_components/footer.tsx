import Image from "next/image";
import Link from "next/link";

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
      { label: "Book a service", href: "/book" },
      { label: "How it works", href: "/#how-it-works" },
      { label: "Services", href: "/services" },
      { label: "Reviews", href: "/#reviews" },
      { label: "Pricing", href: "/services" },
    ],
  },
  {
    heading: "For Mechanics",
    links: [
      { label: "Become a mechanic", href: "/mechanics" },
      { label: "Apply now", href: "/mechanics/apply" },
      { label: "Help centre", href: "/help" },
      { label: "Mechanic login", href: "/mechanic/login" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "Services", href: "/services" },
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

export function Footer() {
  return (
    <footer className="bg-text-primary text-white">
      <div className="mx-auto max-w-content px-4 py-14 sm:px-8 lg:py-[56px]">
        <div className="grid gap-10 md:grid-cols-3 lg:grid-cols-[1.4fr_repeat(3,_1fr)]">
          <div className="md:col-span-3 lg:col-span-1">
            <Link href="/" aria-label="Book My Tech home" className="inline-block">
              <Image
                src="/logo.png"
                alt="Book My Tech"
                width={228}
                height={76}
                className="h-16 w-auto brightness-0 invert"
              />
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-[1.55] text-white/70">
              Vetted mobile mechanics. Transparent pricing. Pay only when the job
              is done.
            </p>
            <ul className="mt-5 flex gap-2.5">
              {SOCIALS.map((s) => (
                <li key={s.label}>
                  <a
                    href={s.href}
                    aria-label={s.label}
                    className="flex size-9 items-center justify-center rounded-full border border-white/15 text-white/80 transition-colors hover:border-white/40 hover:text-white"
                  >
                    <s.Icon />
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.heading}>
              <h3 className="mb-4 text-[13px] font-bold uppercase tracking-[0.08em] text-white/60">
                {col.heading}
              </h3>
              <ul className="flex flex-col gap-2.5">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link
                      href={l.href}
                      className="text-sm text-white/85 transition-colors hover:text-white"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-start gap-3 border-t border-white/10 pt-6 text-xs text-white/60 sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 Book My Tech Ltd. All rights reserved.</p>
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            <li>
              <Link href="#" className="hover:text-white">
                Terms
              </Link>
            </li>
            <li>
              <Link href="#" className="hover:text-white">
                Privacy
              </Link>
            </li>
            <li>
              <Link href="#" className="hover:text-white">
                Cookies
              </Link>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
