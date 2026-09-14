// Matching a TecDoc part group to an LKQ component by name (Task 45).
//
// HaynesPro names the part groups a repair uses in TecDoc's style ("Slave
// cylinder, clutch"); LKQ names its components its own way ("Clutch Slave
// Cylinder"). No supplier API maps one to the other, so matching compares the
// SET of words in each name, order and punctuation ignored.
//
// Measured on one car (BM19WKO, 107 part groups, 2026-09-14): 27 had exactly
// one identical-words LKQ component and those were right; 3 had two
// (LKQ lists some names twice); 40 were close and about half right ("Tie rod
// end" → "Inner Tie Rod" is wrong, "Track Rod End" is right); 37 were weak and
// mostly wrong. So only the unambiguous identical case is ever treated as a
// match without a person, and even that is labelled "auto-matched", not
// "confirmed". Everything else is a suggestion for the admin.
//
// Pure: no I/O. Suggestions are computed on read and never stored, so a better
// matcher improves every unreviewed group at once.

import { componentByNumber, LKQ_COMPONENTS } from "@/lib/lkq/components";
import type { AdsComponent } from "@/lib/lkq/types";

const STOP_WORDS = new Set(["the", "and", "for", "of", "a", "with"]);

function stem(word: string): string {
  if (word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (/(sses|xes|ches|shes)$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

/** The comparable words of a name: lower case, punctuation split, stop words dropped, plurals folded. */
export function nameWords(name: string): Set<string> {
  return new Set(
    String(name ?? "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w && !STOP_WORDS.has(w))
      .map(stem),
  );
}

/** Shared words over all words (Jaccard): 1 = the same words, 0 = none in common. */
export function nameMatchScore(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared++;
  return shared / (a.size + b.size - shared);
}

interface IndexedComponent {
  component: AdsComponent;
  words: Set<string>;
}

const indexes = new WeakMap<readonly AdsComponent[], IndexedComponent[]>();

function indexed(components: readonly AdsComponent[]): IndexedComponent[] {
  let index = indexes.get(components);
  if (!index) {
    index = components.map((component) => ({ component, words: nameWords(component.ComponentName) }));
    indexes.set(components, index);
  }
  return index;
}

export interface ComponentSuggestion {
  component: AdsComponent;
  score: number;
}

/** The closest LKQ components by name, best first; ties go to the shorter, more generic name. */
export function suggestComponents(
  description: string,
  limit = 3,
  components: readonly AdsComponent[] = LKQ_COMPONENTS,
): ComponentSuggestion[] {
  const words = nameWords(description);
  if (words.size === 0) return [];
  return indexed(components)
    .map(({ component, words: other }) => ({ component, score: nameMatchScore(words, other) }))
    .filter((s) => s.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.component.ComponentName.length - b.component.ComponentName.length ||
        a.component.ComponentNumber.localeCompare(b.component.ComponentNumber),
    )
    .slice(0, limit);
}

/** The one LKQ component with exactly the same words, or null when there is none or more than one. */
export function autoMatchComponent(
  description: string,
  components: readonly AdsComponent[] = LKQ_COMPONENTS,
): AdsComponent | null {
  const words = nameWords(description);
  if (words.size === 0) return null;
  const identical = indexed(components).filter(({ words: other }) => nameMatchScore(words, other) === 1);
  return identical.length === 1 ? identical[0].component : null;
}

// ---------------------------------------------------------------------------
// A stored row, and what it means.
// ---------------------------------------------------------------------------

export type PartGroupStatus = "unreviewed" | "confirmed" | "no_match";

/** A row of `part_group_links` (migration 0066). */
export interface PartGroupLinkRow {
  genart_id: number;
  description: string;
  sample_repair: string | null;
  status: PartGroupStatus;
  lkq_component: string | null;
  reviewed_at: string | null;
  first_seen_at: string;
}

export type ResolvedPartGroupLink =
  /** An admin chose this component. */
  | { kind: "confirmed"; component: AdsComponent }
  /** Nobody has reviewed it, but exactly one LKQ component has the same words. */
  | { kind: "auto"; component: AdsComponent }
  /** An admin said LKQ has nothing equivalent. */
  | { kind: "no_match" }
  /** Nobody has reviewed it and no name matches unambiguously. */
  | { kind: "unmatched" }
  /** Confirmed against a component number LKQ's list no longer contains. */
  | { kind: "stale"; componentNumber: string };

export function resolvePartGroupLink(
  row: Pick<PartGroupLinkRow, "status" | "lkq_component" | "description">,
  components: readonly AdsComponent[] = LKQ_COMPONENTS,
): ResolvedPartGroupLink {
  if (row.status === "no_match") return { kind: "no_match" };
  if (row.status === "confirmed" && row.lkq_component) {
    const component =
      components === LKQ_COMPONENTS
        ? componentByNumber(row.lkq_component)
        : (components.find((c) => c.ComponentNumber === row.lkq_component) ?? null);
    return component ? { kind: "confirmed", component } : { kind: "stale", componentNumber: row.lkq_component };
  }
  const auto = autoMatchComponent(row.description, components);
  return auto ? { kind: "auto", component: auto } : { kind: "unmatched" };
}
