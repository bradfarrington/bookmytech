import Link from "next/link";
import { CustomerNav } from "@/components/ui/customer-nav";
import { Overline } from "@/components/ui/overline";
import { Footer } from "./footer";

export type LegalSection = {
  heading: string;
  /** Plain paragraphs of body copy. */
  body?: string[];
  /** Optional bullet list rendered under the paragraphs. */
  bullets?: string[];
};

export interface LegalPageProps {
  /** Overline shown above the title, e.g. "Legal". */
  eyebrow: string;
  title: string;
  /** Short standfirst under the title. */
  intro: string;
  lastUpdated: string;
  sections: LegalSection[];
}

// Shared chrome + typography for the policy pages (Terms, Privacy, Cookies).
// Keeps each page file to just its content model.
export function LegalPage({ eyebrow, title, intro, lastUpdated, sections }: LegalPageProps) {
  return (
    <>
      <section className="bg-brand-gradient text-white">
        <CustomerNav dark />
        <div className="mx-auto max-w-content px-4 pb-14 pt-8 sm:px-8 lg:pb-16 lg:pt-10">
          <Overline className="mb-3 text-white/70">{eyebrow}</Overline>
          <h1 className="mb-3 max-w-3xl text-[32px] font-extrabold leading-[1.07] tracking-[-0.025em] sm:text-[42px]">
            {title}
          </h1>
          <p className="max-w-2xl text-base text-white/85 sm:text-lg">{intro}</p>
          <p className="mt-5 text-sm text-white/60">Last updated {lastUpdated}</p>
        </div>
      </section>

      <main className="bg-surface">
        <div className="mx-auto max-w-[820px] px-4 py-14 sm:px-8 lg:py-[64px]">
          {/* Contents */}
          <nav aria-label="On this page" className="mb-10 rounded-2xl border border-border bg-surface-card p-5 shadow-card">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.1em] text-text-muted">
              On this page
            </p>
            <ol className="grid gap-2 sm:grid-cols-2">
              {sections.map((s, i) => (
                <li key={s.heading}>
                  <a
                    href={`#section-${i + 1}`}
                    className="text-sm text-brand-blue hover:underline"
                  >
                    {i + 1}. {s.heading}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="flex flex-col gap-9">
            {sections.map((s, i) => (
              <section key={s.heading} id={`section-${i + 1}`} className="scroll-mt-24">
                <h2 className="mb-3 text-xl font-extrabold tracking-[-0.02em] text-text-primary sm:text-2xl">
                  {i + 1}. {s.heading}
                </h2>
                {s.body?.map((p, j) => (
                  <p key={j} className="mb-3 text-[15px] leading-[1.7] text-text-secondary">
                    {p}
                  </p>
                ))}
                {s.bullets && (
                  <ul className="mt-2 flex flex-col gap-2">
                    {s.bullets.map((b, j) => (
                      <li key={j} className="flex gap-2.5 text-[15px] leading-[1.6] text-text-secondary">
                        <span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand-blue" />
                        {b}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>

          <div className="mt-12 rounded-2xl border border-border bg-surface-card p-6 shadow-card">
            <h2 className="text-lg font-bold text-text-primary">Questions about this policy?</h2>
            <p className="mt-1.5 text-sm text-text-secondary">
              Email us at{" "}
              <a href="mailto:support@bookmytech.co.uk" className="font-semibold text-brand-blue hover:underline">
                support@bookmytech.co.uk
              </a>{" "}
              or visit the{" "}
              <Link href="/help" className="font-semibold text-brand-blue hover:underline">
                help centre
              </Link>
              .
            </p>
          </div>
        </div>
      </main>

      <Footer />
    </>
  );
}
