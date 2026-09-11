"use server";

import { aagQuote, isAagConfigured, isAagSandbox } from "@/lib/aag/client";
import { cheapestLine, flattenQuote, type AagQuoteLine } from "@/lib/aag/quote";
import type { AagVehicleDetails } from "@/lib/aag/types";
import { requireAdmin } from "@/lib/auth/require-admin";
import { normaliseReg } from "@/lib/utils";

// Admin-only AAG sandbox check (Task 40). One read-only quote for one
// registration and one GenArt product group, rendered on
// /admin/parts/aag-check so Gareth can see real prices and branch stock
// without a terminal. Nothing here writes anywhere and nothing orders.
//
// The AAG credentials are platform secrets, so the check is gated on the
// admin role explicitly rather than relying on the page's layout — a server
// action is callable by anyone who can reach the site.

export type AagCheckResult =
  | {
      ok: true;
      sandbox: boolean;
      reg: string;
      genart: string;
      vehicle: AagVehicleDetails | null;
      lines: AagQuoteLine[];
      cheapestProductId: string | null;
    }
  | { ok: false; error: string };

export async function checkAagQuoteAction(input: {
  reg: string;
  genart: string;
}): Promise<AagCheckResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;

  const reg = normaliseReg((input.reg ?? "").trim());
  const genart = (input.genart ?? "").trim();
  if (!reg) return { ok: false, error: "Enter a registration." };
  if (!/^\d{1,6}$/.test(genart)) return { ok: false, error: "Enter a numeric TecDoc GenArt id (82 = brake discs)." };
  if (!isAagConfigured()) {
    return { ok: false, error: "AAG isn't configured on this environment — add the AAG_* values first." };
  }

  const body = await aagQuote(reg, genart);
  if (!body) {
    return {
      ok: false,
      error:
        "AAG didn't return a quote. The status banner above shows what it last told us; the server log has the detail.",
    };
  }
  const lines = flattenQuote(body);
  return {
    ok: true,
    sandbox: isAagSandbox(),
    reg,
    genart,
    vehicle: body.VehicleDetails?.[0] ?? null,
    lines,
    cheapestProductId: cheapestLine(lines)?.productId ?? null,
  };
}
