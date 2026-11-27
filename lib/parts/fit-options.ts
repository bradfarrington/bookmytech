// Showing a part's equipment versions to a mechanic (Task 87). Pure, and safe
// in client components: the mechanic's job page, the admin's, and the text of
// a mechanic's suggested extra parts.
//
// booking_parts.fit_options (migration 0093) is jsonb, read back as `unknown`:
// readFitOptions checks its shape rather than trusting it.

import type { EquipmentKey, FitDependsOn, FitOption, FitOptions } from "./repair-part-choice";

const KEYS: readonly EquipmentKey[] = ["air_con", "stop_start", "electric_handbrake"];

function isKey(value: unknown): value is EquipmentKey {
  return value === "air_con" || value === "stop_start" || value === "electric_handbrake";
}

function isDependsOn(value: unknown): value is FitDependsOn {
  return isKey(value) || value === "car";
}

/** A stored fit_options value, or null when absent or not the shape we write. Pure. */
export function readFitOptions(raw: unknown): FitOptions | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const dependsOn = Array.isArray(value.dependsOn) ? value.dependsOn.filter(isDependsOn) : [];
  const options = Array.isArray(value.options)
    ? value.options.flatMap((o): FitOption[] => {
        if (!o || typeof o !== "object") return [];
        const opt = o as Record<string, unknown>;
        if (typeof opt.partNumber !== "string" || !opt.partNumber) return [];
        const forRaw = (opt.for && typeof opt.for === "object" ? opt.for : {}) as Record<string, unknown>;
        const forKinds: FitOption["for"] = {};
        for (const key of KEYS) if (typeof forRaw[key] === "boolean") forKinds[key] = forRaw[key] as boolean;
        return [
          {
            supplier: "aag",
            partNumber: opt.partNumber,
            brand: typeof opt.brand === "string" ? opt.brand : null,
            description: typeof opt.description === "string" ? opt.description : null,
            for: forKinds,
            label: typeof opt.label === "string" ? opt.label : "",
          },
        ];
      })
    : [];
  if (dependsOn.length === 0 || options.length < 2) return null;
  const answeredRaw = (value.answered && typeof value.answered === "object" ? value.answered : {}) as Record<string, unknown>;
  const answered: Partial<Record<EquipmentKey, boolean>> = {};
  for (const key of dependsOn) if (isKey(key) && typeof answeredRaw[key] === "boolean") answered[key] = answeredRaw[key] as boolean;
  return { dependsOn, options, ...(Object.keys(answered).length > 0 ? { answered } : {}) };
}

const NAME: Record<EquipmentKey, string> = { air_con: "air-con", stop_start: "stop-start", electric_handbrake: "an electronic handbrake" };

/** "air-con", "air-con and stop-start". */
function names(keys: readonly EquipmentKey[]): string {
  return keys.map((k) => NAME[k]).join(" and ");
}

/** The equipment the customer could be asked about, without "car". */
function equipmentOf(fit: FitOptions): EquipmentKey[] {
  return fit.dependsOn.filter(isKey);
}

/** Whether the mechanic must check the car before buying: a car detail, or equipment the customer didn't confirm. Pure. */
export function fitOptionsUnsure(fit: FitOptions): boolean {
  return fit.dependsOn.includes("car") || equipmentOf(fit).some((key) => fit.answered?.[key] === undefined);
}

/** What the customer said, in a sentence: "The customer said the car has air-con." Null when nothing. Pure. */
export function customerSaid(fit: FitOptions): string | null {
  const said = equipmentOf(fit).filter((key) => fit.answered?.[key] !== undefined);
  if (said.length === 0) return null;
  const parts = said.map((key) => `${fit.answered?.[key] ? "has" : "doesn't have"} ${NAME[key]}`);
  return `The customer said the car ${parts.join(" and ")}.`;
}

/** The heading over the versions: what to check, and why. Pure. */
export function fitOptionsHeading(fit: FitOptions): string {
  if (fit.dependsOn.includes("car")) return "Check which version fits this car before buying: NAPA lists more than one.";
  const unknown = equipmentOf(fit).filter((key) => fit.answered?.[key] === undefined);
  if (unknown.length > 0) return `Check ${names(unknown)} before buying: we don't know which this car has.`;
  return `${customerSaid(fit) ?? ""} If not, buy the other version.`.trim();
}

/** The line under the versions when the mechanic must check: who can tell them. Null when they needn't. Pure. */
export function fitOptionsFooter(fit: FitOptions): string | null {
  if (!fitOptionsUnsure(fit)) return null;
  return fit.dependsOn.includes("car") ? "Check the car on arrival before fitting." : "Ask the customer in the chat, or check on arrival.";
}

/** Whether an option is the one the line was charged as. */
export function isChargedOption(option: FitOption, chargedPartNumber: string | null | undefined): boolean {
  return !!chargedPartNumber && option.partNumber === chargedPartNumber;
}

/**
 * One line for text-only places (a suggested part's description): "check
 * air-con: With air-con GAT5PK1680 / Without air-con GAT5PK1650". Null when
 * there's nothing to check. Pure.
 */
export function fitOptionsNote(fit: FitOptions | null | undefined): string | null {
  if (!fit || fit.options.length < 2) return null;
  const versions = fit.options.map((o) => `${o.label} ${o.partNumber}`).join(" / ");
  const equipment = equipmentOf(fit);
  return `check ${equipment.length > 0 ? names(equipment) : "which fits"}: ${versions}`;
}
