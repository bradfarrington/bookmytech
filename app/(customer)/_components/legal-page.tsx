import Link from "next/link";
import { ArrowRight, CalendarDays, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CustomerNav } from "@/components/ui/customer-nav";
import { Icon } from "@/components/ui/icon";
import { SectionHeading } from "@/components/ui/section-heading";
import { SectionWatermark } from "@/components/ui/section-watermark";
import { Footer } from "./footer";

/**
 * One structural element inside a legal section. The long-form documents
 * (Task 29) need more than paragraphs + one bullet list: sub-headings, tables,
 * numbered steps, address blocks and the emoji "promise" cards.
 */
export type LegalBlock =
  | { type: "p"; text: string }
  | { type: "h3"; text: string }
  | { type: "bullets"; items: string[] }
  | { type: "numbered"; items: { title?: string; text: string }[] }
  | { type: "table"; head: string[]; rows: string[][] }
  | { type: "address"; lines: string[] }
  | { type: "promise"; items: { emoji: string; title: string; text: string }[] };

export type LegalSection = {
  heading: string;
  /** Plain paragraphs of body copy. */
  body?: string[];
  /** Optional bullet list rendered under the paragraphs. */
  bullets?: string[];
  /** Richer content, rendered in order after `body` and `bullets`. */
  blocks?: LegalBlock[];
};

export interface LegalPageProps {
  /** Overline shown above the title, e.g. "Legal". */
  eyebrow: string;
  title: string;
  /** Short standfirst under the title. */
  intro: string;
  lastUpdated: string;
  /** Un-numbered blocks shown above the contents (company details, scope). */
  preamble?: LegalBlock[];
  sections: LegalSection[];
}

const PARA = "mb-3 text-[15px] leading-[1.7] text-text-secondary";

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="mb-3 mt-1 flex flex-col gap-2">
      {items.map((b, j) => (
        <li key={j} className="flex gap-2.5 text-[15px] leading-[1.6] text-text-secondary">
          <span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand-blue" />
          {b}
        </li>
      ))}
    </ul>
  );
}

function Block({ block }: { block: LegalBlock }) {
  switch (block.type) {
    case "p":
      return <p className={PARA}>{block.text}</p>;
    case "h3":
      return (
        <h3 className="mb-1.5 mt-5 text-base font-bold tracking-[-0.01em] text-text-primary">
          {block.text}
        </h3>
      );
    case "bullets":
      return <Bullets items={block.items} />;
    case "numbered":
      return (
        <ol className="mb-3 mt-1 flex flex-col gap-2.5">
          {block.items.map((it, j) => (
            <li key={j} className="flex gap-3 text-[15px] leading-[1.6] text-text-secondary">
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-blue/10 text-xs font-bold text-brand-blue">
                {j + 1}
              </span>
              <span>
                {it.title && <span className="font-semibold text-text-primary">{it.title} </span>}
                {it.text}
              </span>
            </li>
          ))}
        </ol>
      );
    case "table":
      return (
        <div className="mb-4 mt-2 overflow-x-auto rounded-xl border border-border bg-white">
          <table className="w-full min-w-[420px] text-left text-sm">
            <thead>
              <tr className="bg-surface">
                {block.head.map((h, j) => (
                  <th
                    key={j}
                    scope="col"
                    className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (
                    <td
                      key={j}
                      className={
                        j === 0
                          ? "border-t border-border px-4 py-2.5 font-medium text-text-primary"
                          : "border-t border-border px-4 py-2.5 text-text-secondary"
                      }
                    >
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "address":
      return (
        <address className="mb-3 text-[15px] not-italic leading-[1.6] text-text-secondary">
          {block.lines.map((l, j) => (
            <span key={j} className="block">
              {l}
            </span>
          ))}
        </address>
      );
    case "promise":
      return (
        <div className="mb-3 mt-2 grid gap-3 sm:grid-cols-2">
          {block.items.map((it) => (
            <div key={it.title} className="rounded-xl border border-border bg-surface p-4">
              <p className="mb-1 flex items-center gap-2 text-sm font-bold text-text-primary">
                <span aria-hidden>{it.emoji}</span>
                {it.title}
              </p>
              <p className="text-sm leading-[1.6] text-text-secondary">{it.text}</p>
            </div>
          ))}
        </div>
      );
  }
}

const sectionId = (index: number) => `section-${index + 1}`;

// Shared chrome + typography for the policy pages (Terms, Privacy, Cookies,
// Mechanic Terms, Cancellation Policy). Keeps each page file to its content model.
//
// Task 46: the marketing page pattern. A gradient hero; on desktop a sticky,
// scrollable "On this page" list beside the document (on phones the list folds
// into a disclosure above it); the document in one white card; and a contact
// band on pale blue. Section anchors stay `#section-N`, so existing links
// between the documents keep working.
export function LegalPage({
  eyebrow,
  title,
  intro,
  lastUpdated,
  preamble,
  sections,
}: LegalPageProps) {
  const contentsLabel = "On this page";
  return (
    <>
      <CustomerNav />
      <main>
        <section className="relative overflow-hidden bg-brand-gradient-deep text-white">
          <div aria-hidden className="hero-glow pointer-events-none absolute inset-0" />
          <div className="relative mx-auto max-w-content px-4 pb-16 pt-14 sm:px-6 sm:pb-20 sm:pt-[88px]">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/75">{eyebrow}</p>
            <h1 className="mb-4 mt-3 max-w-3xl font-display text-[clamp(34px,5vw,56px)] font-extrabold leading-[1.04] tracking-[-0.028em]">
              {title}
            </h1>
            <p className="max-w-2xl text-[17px] leading-[1.55] text-white/80">{intro}</p>
            <p className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/85">
              <Icon icon={CalendarDays} size={13} strokeWidth={2.2} />
              Last updated {lastUpdated}
            </p>
          </div>
        </section>

        {/* overflow-clip, not hidden: hidden would stop the contents list sticking. */}
        <section className="relative overflow-clip bg-surface">
          <div className="relative mx-auto grid max-w-content gap-10 px-4 py-12 sm:px-6 sm:py-16 min-[1000px]:grid-cols-[260px_minmax(0,1fr)] min-[1000px]:gap-12">
            <aside className="hidden min-[1000px]:block">
              <nav
                aria-label={contentsLabel}
                className="sticky top-[92px] max-h-[calc(100vh-120px)] overflow-y-auto pr-2 [scrollbar-width:thin]"
              >
                <p className="mb-2 px-3 text-[11px] font-bold uppercase tracking-[0.14em] text-text-muted">
                  {contentsLabel}
                </p>
                <ol className="flex flex-col gap-0.5">
                  {sections.map((s, i) => (
                    <li key={s.heading}>
                      <a
                        href={`#${sectionId(i)}`}
                        className="flex gap-2 rounded-lg px-3 py-1.5 text-[13px] leading-snug text-text-secondary transition-colors hover:bg-white hover:text-text-primary"
                      >
                        <span className="w-5 shrink-0 font-semibold tabular-nums text-brand-blue">{i + 1}</span>
                        {s.heading}
                      </a>
                    </li>
                  ))}
                </ol>
              </nav>
            </aside>

            <div className="min-w-0 max-w-[820px]">
              {preamble && preamble.length > 0 && (
                <div className="mb-6 rounded-[20px] border border-blue-100 bg-blue-50/60 p-5 sm:p-6">
                  {preamble.map((b, i) => (
                    <Block key={i} block={b} />
                  ))}
                </div>
              )}

              {/* Long documents (60 sections) would push the copy below the fold
                  on a phone, so the list is a closed disclosure there. */}
              <details className="mb-6 rounded-[20px] border border-border bg-white p-5 shadow-card min-[1000px]:hidden">
                <summary className="cursor-pointer text-[11px] font-bold uppercase tracking-[0.14em] text-text-muted">
                  {contentsLabel} ({sections.length} sections)
                </summary>
                <ol className="mt-3 grid gap-2 sm:grid-cols-2">
                  {sections.map((s, i) => (
                    <li key={s.heading}>
                      <a href={`#${sectionId(i)}`} className="text-sm text-brand-blue hover:underline">
                        {i + 1}. {s.heading}
                      </a>
                    </li>
                  ))}
                </ol>
              </details>

              <article className="rounded-[24px] border border-border bg-white px-5 py-8 shadow-card sm:px-10 sm:py-10">
                {sections.map((s, i) => (
                  <section
                    key={s.heading}
                    id={sectionId(i)}
                    className="scroll-mt-[92px] border-t border-border-subtle pt-8 first:border-t-0 first:pt-0 [&:not(:first-child)]:mt-8"
                  >
                    <h2 className="mb-4 flex items-start gap-3 font-display text-[22px] font-extrabold leading-tight tracking-[-0.02em] text-text-primary sm:text-2xl">
                      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 font-sans text-xs font-bold text-brand-blue">
                        {i + 1}
                      </span>
                      {s.heading}
                    </h2>
                    {s.body?.map((p, j) => (
                      <p key={j} className={PARA}>
                        {p}
                      </p>
                    ))}
                    {s.bullets && <Bullets items={s.bullets} />}
                    {s.blocks?.map((b, j) => (
                      <Block key={j} block={b} />
                    ))}
                  </section>
                ))}
              </article>
            </div>
          </div>
        </section>

        <section className="relative overflow-hidden border-t border-blue-100 bg-[linear-gradient(180deg,#eff6ff_0%,#e0ebff_100%)]">
          <SectionWatermark />
          <div className="relative mx-auto max-w-content px-4 py-14 sm:px-6 sm:py-[88px]">
            <SectionHeading
              eyebrow="Questions"
              title="Something here unclear?"
              lead="Email our support team or visit the help centre, and we'll talk you through it."
              className="mb-8"
            />
            <div className="flex flex-wrap justify-center gap-3">
              <a href="mailto:support@bookmytech.co.uk">
                <Button variant="primary" size="lg" iconLeft={Mail} className="font-bold">
                  support@bookmytech.co.uk
                </Button>
              </a>
              <Link href="/help">
                <Button
                  variant="ghost"
                  size="lg"
                  iconRight={ArrowRight}
                  className="bg-white font-bold text-text-primary hover:border-text-primary hover:bg-white"
                >
                  Visit the help centre
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
