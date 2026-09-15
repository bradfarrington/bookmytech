// How a saved card reads on Payment methods (Task 48, Task 53). Pure, so it's
// unit-tested.

const BRAND_LABELS: Record<string, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "American Express",
  american_express: "American Express",
  discover: "Discover",
  diners: "Diners Club",
  diners_club: "Diners Club",
  jcb: "JCB",
  unionpay: "UnionPay",
};

/** Stripe's `card.brand` ("amex") → "American Express". Anything else is "Card". */
export function cardBrandLabel(brand: string | null | undefined): string {
  const key = (brand ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  return BRAND_LABELS[key] ?? "Card";
}

/** 12, 2028 → "12/28". */
export function cardExpiry(month: number, year: number): string {
  if (!Number.isInteger(month) || !Number.isInteger(year) || month < 1 || month > 12 || year < 0) return "";
  return `${String(month).padStart(2, "0")}/${String(year % 100).padStart(2, "0")}`;
}

/** A card is good until the end of its expiry month. */
export function isCardExpired(month: number, year: number, now: Date = new Date()): boolean {
  if (!Number.isInteger(month) || !Number.isInteger(year)) return false;
  const nowYear = now.getUTCFullYear();
  const nowMonth = now.getUTCMonth() + 1;
  return year < nowYear || (year === nowYear && month < nowMonth);
}

export type SetupReturn = "succeeded" | "processing" | "failed";

/**
 * Back from a 3-D Secure detour, Stripe adds `setup_intent`,
 * `setup_intent_client_secret` and `redirect_status` to the return URL.
 * Null when this isn't such a return.
 */
export function setupReturnStatus(params: Record<string, string | string[] | undefined>): SetupReturn | null {
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  if (!first(params.setup_intent)) return null;
  const status = first(params.redirect_status);
  if (status === "succeeded" || status === "processing") return status;
  return "failed";
}
