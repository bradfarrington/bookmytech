// What the mechanic may charge when the customer declines the revised job
// (Task 37). Pure — unit-tested.

import { splitCommission } from "@/lib/quotes/pricing";
import { formatPrice } from "@/lib/utils";
import type { OnSiteCharge } from "./status";

export interface OnSiteFeeOption {
  kind: OnSiteCharge;
  label: string;
  hint: string;
  pence: number;
}

export function onSiteFeeOptions(fees: { diagnosticPence: number; enRoutePence: number }): OnSiteFeeOption[] {
  return [
    {
      kind: "diagnostic",
      label: `Charge the on-site diagnostic (${formatPrice(fees.diagnosticPence)})`,
      hint: "You looked at the car and told them what it needs.",
      pence: Math.max(0, Math.round(fees.diagnosticPence)),
    },
    {
      kind: "cancellation",
      label: `Charge the cancellation fee (${formatPrice(fees.enRoutePence)})`,
      hint: "The en-route fee — you travelled to them.",
      pence: Math.max(0, Math.round(fees.enRoutePence)),
    },
    {
      kind: "none",
      label: "End with no charge",
      hint: "Their whole pre-authorisation is released.",
      pence: 0,
    },
  ];
}

export function onSiteFeeFor(kind: OnSiteCharge, fees: { diagnosticPence: number; enRoutePence: number }): number {
  return onSiteFeeOptions(fees).find((o) => o.kind === kind)?.pence ?? 0;
}

/** The fee is split at the booking's rate like any other charge (owner decision 2026-09-09). */
export function feePayout(feePence: number, commissionRate: number): { platformFeePence: number; mechanicPayoutPence: number } {
  return splitCommission(Math.max(0, Math.round(feePence)), commissionRate);
}

export const ON_SITE_FEE_LABEL: Record<OnSiteCharge, string> = {
  diagnostic: "On-site diagnostic fee",
  cancellation: "Cancellation fee (mechanic on site)",
  none: "No charge",
};
