// How a typed repair search is understood (Task 74). Pure, so it is unit-tested
// and shared by the HaynesPro walk, combined repairs and products.
//
// Customers don't type HaynesPro's words. They type "pads" for "Brake pad",
// "dpf" for "diesel particulate filter", "water pump" for "coolant pump", and
// "change my brake pads" for "Renew the front brake pads". So a query becomes a
// list of TERMS, each satisfied by any of its alternatives, matched word by
// word on a crude stem (so "pads" finds "pad" and "brakes" finds "brake"). The
// LAST word typed also matches as a prefix, so "brak" still finds "brake" while
// the customer is typing; every other word must match whole, or "con" would
// match "control" and "pad" would match "paddle".
//
// Verbs ("replace", "change", "check", "fix") are WEAK: a job that has them
// ranks higher, but a job without them is still found, and they never steer
// the walk — "renew" is under every group.

/** One word to find: its stem, and whether a longer word starting with it will do. */
export interface TermWord {
  stem: string;
  prefix: boolean;
}

export interface SearchTerm {
  /** Any one alternative satisfies the term; each is a list of words that must ALL appear. */
  alternatives: TermWord[][];
  /** A verb: improves the rank when present, never required. */
  weak: boolean;
}

export interface SearchQuery {
  /** The query as typed, lower-cased with punctuation flattened — for whole-phrase matches. */
  phrase: string;
  terms: SearchTerm[];
}

/** Words that carry nothing in a repair search. */
const STOP_WORDS = new Set([
  "a", "an", "the", "my", "our", "your", "car", "cars", "vehicle", "van", "and", "of", "for",
  "to", "on", "in", "with", "please", "need", "needs", "needed", "i", "im", "is", "it", "me",
  "do", "does", "want", "would", "like", "get", "got", "job", "doing", "done", "some",
]);

/** Verb families: each word stands for the whole family, as weak alternatives. */
const VERB_FAMILIES: string[][] = [
  ["renew", "replace", "replacement", "replacing", "replaced", "change", "changing", "changed", "swap", "swapping", "new", "fit", "fitted", "fitting"],
  ["check", "checking", "inspect", "inspection", "test", "testing", "look"],
  ["repair", "repairing", "fix", "fixing", "fixed", "sort", "mend"],
];

/**
 * Customer words → HaynesPro's words. Keys are one word or a phrase of words
 * as typed (phrases are matched first, longest first); each value lists the
 * alternatives, every one a phrase whose words must all appear. The key
 * itself always stays an alternative, so nothing that matched before stops
 * matching. Targets checked against four reference cars' trees (2026-11-13).
 */
const SYNONYMS: Record<string, string[]> = {
  dpf: ["diesel particulate", "particulate", "dpf"],
  "diesel particulate filter": ["particulate", "dpf"],
  regen: ["regeneration", "regenerate"],
  cambelt: ["timing belt"],
  "cam belt": ["timing belt"],
  "water pump": ["coolant pump"],
  "fan belt": ["ancillary drive belt", "ancillary belt"],
  "aux belt": ["ancillary drive belt", "ancillary belt"],
  "auxiliary belt": ["ancillary drive belt", "ancillary belt"],
  "serpentine belt": ["ancillary drive belt", "ancillary belt"],
  "alternator belt": ["ancillary drive belt", "ancillary belt"],
  aircon: ["air con", "air conditioning"],
  "air con": ["air conditioning", "aircon"],
  regas: ["air con", "air conditioning"],
  "re gas": ["air con", "air conditioning"],
  "tie rod": ["track rod"],
  "drop link": ["stabiliser link", "anti roll bar link"],
  "drop links": ["stabiliser link", "anti roll bar link"],
  "abs sensor": ["wheel speed sensor"],
  lambda: ["oxygen sensor"],
  "o2 sensor": ["oxygen sensor"],
  "coil pack": ["ignition coil"],
  handbrake: ["parking brake"],
  "hand brake": ["parking brake", "handbrake"],
  headlamp: ["headlight"],
  "rear light": ["tail light"],
  "back light": ["tail light"],
  "stop light": ["brake light"],
  antifreeze: ["coolant", "anti freeze"],
  "anti freeze": ["coolant", "antifreeze"],
  gearbox: ["transmission"],
  "back box": ["rear silencer"],
  backbox: ["rear silencer"],
  "exhaust box": ["silencer"],
  tracking: ["wheel alignment", "toe"],
  geometry: ["wheel alignment", "toe"],
  headgasket: ["head gasket"],
  wishbone: ["control arm"],
  "control arm": ["wishbone"],
  rotor: ["brake disc"],
  rotors: ["brake disc"],
  tire: ["tyre"],
  tires: ["tyre"],
  dmf: ["dual mass flywheel", "flywheel"],
  "dual mass": ["flywheel"],
  "cv boot": ["cv joint boot", "drive shaft gaiter"],
  "cabin filter": ["pollen filter"],
  "pollen filter": ["cabin filter"],
  "oil change": ["engine oil", "oil filter", "oil change"],
};

/**
 * A crude English stem: enough that a plural and its singular meet. Both the
 * query and the text go through it, so it only needs to be consistent.
 */
export function stem(word: string): string {
  const w = word.toLowerCase();
  if (w.length <= 3) return w;
  if (w.endsWith("ies") && w.length > 4) return `${w.slice(0, -3)}y`;
  if (w.endsWith("sses")) return w.slice(0, -2);
  if (/(ches|shes|xes|zes)$/.test(w)) return w.slice(0, -2);
  if (/(ss|us|is)$/.test(w)) return w;
  if (w.endsWith("s")) return w.slice(0, -1);
  return w;
}

/** Lower-case words, punctuation as a separator ("air-con" is "air con"). */
export function wordsOf(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

const stemsOf = (text: string): string[] => wordsOf(text).map(stem);
const exact = (text: string): TermWord[] => stemsOf(text).map((s) => ({ stem: s, prefix: false }));

const VERB_INDEX = new Map<string, string[]>();
for (const family of VERB_FAMILIES) {
  const stems = [...new Set(family.map(stem))];
  for (const word of family) VERB_INDEX.set(word, stems);
}

/** Synonym keys as word arrays, longest first so "drop links" beats "drop". */
const SYNONYM_KEYS = Object.keys(SYNONYMS)
  .map((key) => ({ key, words: wordsOf(key) }))
  .sort((a, b) => b.words.length - a.words.length);

/** Parse once per search; the walk tests thousands of names against it. */
export function parseSearchQuery(query: string): SearchQuery {
  const raw = wordsOf(query);
  const phrase = raw.join(" ");
  const meaningful = raw.filter((w) => !STOP_WORDS.has(w));
  // A query of nothing but stop words still searches for what was typed.
  const words = meaningful.length > 0 ? meaningful : raw;

  const terms: SearchTerm[] = [];
  for (let i = 0; i < words.length; ) {
    const synonym = SYNONYM_KEYS.find(
      ({ words: keyWords }) => keyWords.every((w, j) => words[i + j] === w),
    );
    if (synonym) {
      terms.push({ alternatives: [synonym.key, ...SYNONYMS[synonym.key]].map(exact), weak: false });
      i += synonym.words.length;
      continue;
    }
    const word = words[i];
    const verbs = VERB_INDEX.get(word);
    // Only the word still being typed can be a fragment of a longer one.
    const typing = i === words.length - 1 && raw[raw.length - 1] === word;
    terms.push(
      verbs
        ? { alternatives: verbs.map((v) => [{ stem: v, prefix: false }]), weak: true }
        : { alternatives: [[{ stem: stem(word), prefix: typing }]], weak: false },
    );
    i += 1;
  }
  return { phrase, terms };
}

/** A text prepared for matching: its stems, computed once. */
export type Haystack = readonly string[];

export const haystackOf = (text: string): Haystack => stemsOf(text);

function hasWord(haystack: Haystack, word: TermWord): boolean {
  if (!word.prefix) return haystack.includes(word.stem);
  for (const w of haystack) if (w.startsWith(word.stem)) return true;
  return false;
}

export function termMatches(term: SearchTerm, haystack: Haystack): boolean {
  return term.alternatives.some((alt) => alt.every((w) => hasWord(haystack, w)));
}

/** The terms that must match: the strong ones, or every term when all are verbs. */
function requiredTerms(query: SearchQuery): SearchTerm[] {
  const strong = query.terms.filter((t) => !t.weak);
  return strong.length > 0 ? strong : query.terms;
}

/**
 * How well a description matches, lower being better, or null for no match:
 *   0 — starts with the phrase as typed
 *   1 — contains the phrase as typed
 *   2 — every term matches, verbs included
 *   3 — every term but the verbs matches
 */
export function matchRank(description: string, query: SearchQuery): number | null {
  if (query.terms.length === 0) return null;
  const flat = wordsOf(description).join(" ");
  if (query.phrase && flat.startsWith(query.phrase)) return 0;
  if (query.phrase && flat.includes(query.phrase)) return 1;
  const haystack = haystackOf(description);
  if (query.terms.every((t) => termMatches(t, haystack))) return 2;
  if (requiredTerms(query).every((t) => termMatches(t, haystack))) return 3;
  return null;
}

/** How many terms a job must match — what a group needs to be worth opening. */
export function requiredTermCount(query: SearchQuery): number {
  return requiredTerms(query).length;
}

/**
 * How many of the query's steering terms a group's text contains — its own
 * name, or everything beneath it when the vocabulary knows the group. Verbs
 * never count: "renew" is under every group.
 */
export function affinityFor(text: string | Haystack, query: SearchQuery): number {
  const haystack = typeof text === "string" ? haystackOf(text) : text;
  return requiredTerms(query).reduce((n, t) => n + (termMatches(t, haystack) ? 1 : 0), 0);
}
