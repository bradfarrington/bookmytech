// What an LKQ component actually covers, shown as real parts (Task 45).
//
// A HaynesPro part group's name says what it is ("Actuator, eccentric shaft
// (variable valve lift)"). An LKQ component name ("Inlet Valve") is a short
// label whose coverage is the unknown, so matching one to the other by name is
// guesswork. LKQ's real parts for a real car are not: a picture, a fitting
// position and a size make a wrong match obvious. These helpers turn LKQ's
// catalogue reply into one small shape for the matcher to show.
//
// Pure — no I/O, no prices (this is about WHAT a part is, not what it costs),
// safe to import from a client component.

import { fitmentLabels, fitmentOf } from "@/lib/lkq/fitment";
import type { AdsPartsReply } from "@/lib/lkq/types";

export interface PartExample {
  key: string;
  imageUrl: string | null;
  title: string;
  /** Fitting position, engine code, size — what tells two similar parts apart. */
  details: string[];
}

export type ExamplesPanel =
  | { state: "ok"; examples: PartExample[]; total: number }
  | { state: "empty" | "unavailable"; message: string };

/** Enough to recognise a component; more is scrolling, not evidence. */
export const EXAMPLE_LIMIT = 8;

function httpUrl(value: string | null | undefined): string | null {
  const url = String(value ?? "").trim();
  return /^https?:\/\//i.test(url) ? url : null;
}

function tidy(text: string | null | undefined): string {
  return String(text ?? "").replace(/\s+/g, " ").trim();
}

/** Pictures first, so the first few shown are the easiest to recognise. */
export function examplesPanel(examples: readonly PartExample[], emptyMessage: string): ExamplesPanel {
  if (examples.length === 0) return { state: "empty", message: emptyMessage };
  const ordered = [...examples.filter((e) => e.imageUrl), ...examples.filter((e) => !e.imageUrl)];
  return { state: "ok", examples: ordered.slice(0, EXAMPLE_LIMIT), total: examples.length };
}

/**
 * One example per LKQ catalogue part. ADS carries no brand or description —
 * only the component name, a TecDoc picture and labelled fitment columns.
 */
export function adsPartExamples(reply: AdsPartsReply | null | undefined, componentName: string): PartExample[] {
  const labels = fitmentLabels(reply);
  const byNumber = new Map<string, PartExample>();
  for (const part of reply?.Parts ?? []) {
    const number = String(part?.PartNumber ?? "").trim();
    if (!number || byNumber.has(number)) continue;
    byNumber.set(number, {
      key: number,
      imageUrl: httpUrl(part.ImagePath),
      title: tidy(part.ComponentName) || tidy(part.Component) || componentName,
      details: fitmentOf(part, labels)
        // "SupplierName: ECP" is on every LKQ part and says nothing about it.
        .filter((f) => f.label !== "SupplierName")
        .map((f) => `${f.label}: ${f.value}`),
    });
  }
  return [...byNumber.values()];
}
