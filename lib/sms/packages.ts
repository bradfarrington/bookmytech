// SMS credit top-up packages — the single source of truth for resale pricing
// (the agency billing the Book My Tech owner via GoCardless). The browser only
// names which package it wants; the price is read authoritatively from here in
// the createCheckout server action, and again from the GoCardless payment
// metadata in the webhook. Edit pricing here.
//
// 10p / credit.
export interface CreditPackage {
  credits: number;
  pricePence: number;
  /** Marks the visually-highlighted card in the panel. */
  popular?: boolean;
}

export const CREDIT_PACKAGES: readonly CreditPackage[] = [
  { credits: 50, pricePence: 500 },
  { credits: 100, pricePence: 1000, popular: true },
  { credits: 250, pricePence: 2500 },
  { credits: 500, pricePence: 5000 },
];

export function findPackage(credits: number): CreditPackage | undefined {
  return CREDIT_PACKAGES.find((p) => p.credits === credits);
}
