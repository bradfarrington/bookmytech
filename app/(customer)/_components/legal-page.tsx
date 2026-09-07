import Link from "next/link";
import { CustomerNav } from "@/components/ui/customer-nav";
import { Overline } from "@/components/ui/overline";
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
        <h3 className="mb-1.5 mt-4 text-base font-bold tracking-[-0.01em] text-text-primary">
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
        <div className="mb-4 mt-2 overflow-x-auto rounded-xl border border-border bg-surface-card">
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
            <div key={it.title} className="rounded-xl border border-border bg-surface-card p-4">
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

function ContentsList({ sections }: { sections: LegalSection[] }) {
  return (
    <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {sections.map((s, i) => (
        <li key={s.heading}>
          <a href={`#section-${i + 1}`} className="text-sm text-brand-blue hover:underline">
            {i + 1}. {s.heading}
          </a>
        </li>
      ))}
    </ol>
  );
}

// Shared chrome + typography for the policy pages (Terms, Privacy, Cookies,
// Mechanic Terms, Cancellation Policy). Keeps each page file to its content model.
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
          {preamble && preamble.length > 0 && (
            <div className="mb-8 rounded-2xl border border-border bg-surface-card p-5 shadow-card sm:p-6">
              {preamble.map((b, i) => (
                <Block key={i} block={b} />
              ))}
            </div>
          )}

          {/* Contents. Long documents (60 sections) would push the copy below the
              fold on a phone, so the list is collapsed there and open on wider screens. */}
          <details className="mb-10 rounded-2xl border border-border bg-surface-card p-5 shadow-card sm:hidden">
            <summary className="cursor-pointer text-[11px] font-bold uppercase tracking-[0.1em] text-text-muted">
              {contentsLabel} ({sections.length} sections)
            </summary>
            <div className="mt-3">
              <ContentsList sections={sections} />
            </div>
          </details>
          <nav
            aria-label={contentsLabel}
            className="mb-10 hidden rounded-2xl border border-border bg-surface-card p-5 shadow-card sm:block"
          >
            <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.1em] text-text-muted">
              {contentsLabel}
            </p>
            <ContentsList sections={sections} />
          </nav>

          <div className="flex flex-col gap-9">
            {sections.map((s, i) => (
              <section key={s.heading} id={`section-${i + 1}`} className="scroll-mt-24">
                <h2 className="mb-3 text-xl font-extrabold tracking-[-0.02em] text-text-primary sm:text-2xl">
                  {i + 1}. {s.heading}
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
