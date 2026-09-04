// The list of HaynesPro repairs a customer is booking, as it travels through
// the funnel (Task 24). Pure — no "server-only" — because client components
// (the slot picker, the rebook control) build URLs with it too.
//
// On the wire it is one query param, `repairs=a,b,c`. The pre-Task-24 form,
// `repair=a`, is still accepted everywhere so old links, emails and rebook
// URLs keep working; nothing writes it any more.

export const MAX_REPAIRS_PER_BOOKING = 8;

/** Trim, drop blanks, dedupe (first occurrence wins). No cap. */
export function dedupeRepairIds(ids: readonly (string | null | undefined)[]): string[] {
  const out: string[] = [];
  for (const raw of ids) {
    const id = (raw ?? "").trim();
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

/** `dedupeRepairIds`, then the first MAX_REPAIRS_PER_BOOKING. */
export function normaliseRepairIds(ids: readonly (string | null | undefined)[]): string[] {
  return dedupeRepairIds(ids).slice(0, MAX_REPAIRS_PER_BOOKING);
}

type ParamValue = string | string[] | null | undefined;

function firstValue(value: ParamValue): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

/**
 * The repair ids in a page's search params (or a URLSearchParams). `repairs`
 * wins; the legacy `repair` is honoured when it is the only one present.
 */
export function parseRepairIds(
  params: { repairs?: ParamValue; repair?: ParamValue } | URLSearchParams,
): string[] {
  const read = (key: "repairs" | "repair"): string =>
    params instanceof URLSearchParams ? (params.get(key) ?? "") : firstValue(params[key]);
  const list = read("repairs");
  if (list.trim()) return normaliseRepairIds(list.split(","));
  const single = read("repair");
  return single.trim() ? normaliseRepairIds([single]) : [];
}

/** `"repairs=a%2Cb"` for a URL, or `""` when there is nothing to carry. */
export function repairsQuery(ids: readonly string[]): string {
  const clean = normaliseRepairIds(ids);
  return clean.length ? `repairs=${encodeURIComponent(clean.join(","))}` : "";
}

/**
 * A `repairNodeIds` field off a JSON body: absent (or an empty array) → `[]`;
 * an array of strings → deduped ids (NOT capped — the route decides whether
 * too many is an error); anything else → `null`, meaning refuse the request.
 */
export function readRepairIdList(value: unknown): string[] | null {
  if (value == null) return [];
  if (!Array.isArray(value) || !value.every((v) => typeof v === "string")) return null;
  return dedupeRepairIds(value as string[]);
}

/**
 * The ids in a booking/checkout input: the list when it is present and
 * non-empty, else the single legacy field, else nothing. Deduped, NOT capped —
 * the caller decides whether too many is an error or a trim.
 */
export function repairIdsFromInput(input: {
  repairNodeId?: string | null;
  repairNodeIds?: readonly string[] | null;
}): string[] {
  const many = input.repairNodeIds ? dedupeRepairIds(input.repairNodeIds) : [];
  if (many.length) return many;
  return input.repairNodeId ? dedupeRepairIds([input.repairNodeId]) : [];
}
