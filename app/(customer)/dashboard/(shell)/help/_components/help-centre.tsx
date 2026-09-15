"use client";

import { useState } from "react";
import { CalendarX, ChevronDown, ChevronRight, Lock, Mail, ScrollText, Search } from "lucide-react";
import { FAQ_GROUPS } from "@/app/(customer)/help/faqs";
import { ListCard, ListRow, Panel, Section, Tile } from "@/components/dashboard/ui";
import { TextInput } from "../../settings/_components/field";

// Search, the email contact and the FAQ articles. Search filters in the
// browser: an article matches when every word typed appears in its topic,
// question or answer.

const SUPPORT_EMAIL = "support@bookmytech.co.uk";

export function HelpCentre() {
  const [query, setQuery] = useState("");
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);

  const groups = FAQ_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => {
      const text = `${group.heading} ${item.question} ${item.answer}`.toLowerCase();
      return terms.every((term) => text.includes(term));
    }),
  })).filter((group) => group.items.length > 0);

  return (
    <>
      <TextInput
        type="search"
        icon={Search}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search articles…"
        aria-label="Search articles"
      />

      <Section title="Get in touch">
        <Panel padding="none">
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="flex items-center gap-3 px-3.5 py-3 transition-colors hover:bg-surface"
          >
            <Tile icon={Mail} />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold leading-[21px] text-text-primary">Email our support team</div>
              <div className="mt-0.5 break-all text-xs leading-4 text-text-muted">{SUPPORT_EMAIL}</div>
            </div>
            <ChevronRight size={18} className="shrink-0 text-text-disabled" aria-hidden />
          </a>
        </Panel>
      </Section>

      {groups.length === 0 ? (
        <Panel className="text-center">
          <div className="text-sm font-bold text-text-primary">
            No articles match &ldquo;{query.trim()}&rdquo;
          </div>
          <div className="mt-1 text-[13px] leading-[19px] text-text-secondary">
            Try other words, or email us at{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold text-brand-blue hover:text-brand-blue-dark">
              {SUPPORT_EMAIL}
            </a>
            .
          </div>
        </Panel>
      ) : (
        groups.map((group) => (
          <Section key={group.id} title={group.heading}>
            <ListCard>
              {group.items.map((item) => (
                <details key={item.question} className="group">
                  <summary className="flex cursor-pointer list-none items-start gap-2.5 px-3.5 py-3 transition-colors hover:bg-surface [&::-webkit-details-marker]:hidden">
                    <Tile icon={group.icon} size="sm" />
                    <span className="min-w-0 flex-1 pt-1.5 text-sm font-bold leading-5 text-text-primary">
                      {item.question}
                    </span>
                    <ChevronDown
                      size={16}
                      className="mt-2 shrink-0 text-text-muted transition-transform group-open:rotate-180"
                      aria-hidden
                    />
                  </summary>
                  <p className="pb-3.5 pl-14 pr-3.5 text-[13px] leading-[19px] text-text-secondary">{item.answer}</p>
                </details>
              ))}
            </ListCard>
          </Section>
        ))
      )}

      <Section title="Terms and privacy">
        <ListCard>
          <ListRow href="/terms" icon={ScrollText} title="Terms and conditions" />
          <ListRow href="/privacy" icon={Lock} title="Privacy policy" />
          <ListRow href="/cancellation-policy" icon={CalendarX} title="Cancellation policy" />
        </ListCard>
      </Section>
    </>
  );
}
