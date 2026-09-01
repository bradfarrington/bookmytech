// Comparing a DVLA make string with a HaynesPro make name.
//
// Its own module, importing NOTHING, because both sides need it: the server
// uses it as the guard on a manual vehicle correction, and the customer's
// picker uses it to seed itself with the make DVLA already knows — and a client
// component cannot import `./vehicle-picker` without dragging the HaynesPro
// client and the pricing engine into the browser bundle.

/**
 * DVLA make strings and HaynesPro make names for the same manufacturer.
 * Everything else is handled by normalisation plus the prefix rule below;
 * these are the pairs where neither is a prefix of the other.
 */
const MAKE_ALIASES: Record<string, string> = {
  VW: "VOLKSWAGEN",
  MERCEDES: "MERCEDESBENZ",
  MERC: "MERCEDESBENZ",
  LDV: "MAXUSLDV",
  GWM: "GREATWALLGWM",
};

/** Uppercase, de-accent, letters and digits only: "CITROËN" and "Citroen" agree. */
export function normaliseMake(raw: string | null | undefined): string {
  const stripped = (raw ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "");
  return MAKE_ALIASES[stripped] ?? stripped;
}

/**
 * Does a vehicle's make agree with the make DVLA holds for the registration?
 *
 * **This is the guard that makes a manual correction safe to expose.** The
 * vehicle cache is keyed on reg alone with no customer scoping, so a correction
 * moves that plate's price for everyone who books it, on the website too. That
 * is right when it is the right car — and an open door otherwise. DVLA is
 * authoritative on MAKE; it is the variant that is ambiguous. So a Ranger may
 * be repointed at any other Ford, and never at a 911.
 *
 * Either-direction prefix, not equality, because the two sources spell the same
 * manufacturer differently: DVLA's "MG MOTOR UK LTD" against HaynesPro's "MG",
 * "GREAT WALL" against "GREAT WALL (GWM)", "DS AUTOMOBILES" against "DS".
 * Checked against the live 89-make list on 2026-09-01: **no HaynesPro make name
 * is a prefix of another** (the near misses — ALPINA/ALPINE, VOLKSWAGEN/VOLVO —
 * both diverge), so the prefix rule cannot let one make masquerade as another.
 * Pure — unit-tested.
 */
export function makesMatch(
  dvlaMake: string | null | undefined,
  hpMake: string | null | undefined,
): boolean {
  const a = normaliseMake(dvlaMake);
  const b = normaliseMake(hpMake);
  if (!a || !b) return false;
  return a.startsWith(b) || b.startsWith(a);
}
