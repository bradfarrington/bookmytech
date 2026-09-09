// What changed between the job as booked and as revised (Task 37). Pure —
// unit-tested. Feeds the mechanic's preview, the customer's approval page,
// the emails, the event payload and (Task 38) the follow-on quote for the
// work that was taken off.

import { formatPrice } from "@/lib/utils";
import type { RevisionLine, RevisionPart, RevisionSnapshot } from "./snapshot";

export type RevisionDirection = "more" | "less" | "same";

export interface RevisionDiff {
  lines: { added: RevisionLine[]; removed: RevisionLine[]; kept: RevisionLine[] };
  parts: { added: RevisionPart[]; removed: RevisionPart[]; kept: RevisionPart[] };
  /** after − before. */
  differencePence: number;
  direction: RevisionDirection;
  /** Visit length moved (hours), when it did. */
  durationChange: number;
}

const partKey = (p: RevisionPart) => p.id ?? `new:${p.partId ?? p.name.trim().toLowerCase()}:${p.unitPence}:${p.quantity}`;

export function diffRevision(before: RevisionSnapshot, after: RevisionSnapshot): RevisionDiff {
  const beforeNodes = new Set(before.lines.map((l) => l.nodeId));
  const afterNodes = new Set(after.lines.map((l) => l.nodeId));
  const beforeParts = new Set(before.parts.map(partKey));
  const afterParts = new Set(after.parts.map(partKey));
  const differencePence = after.totalPence - before.totalPence;
  return {
    lines: {
      added: after.lines.filter((l) => !beforeNodes.has(l.nodeId)),
      removed: before.lines.filter((l) => !afterNodes.has(l.nodeId)),
      kept: after.lines.filter((l) => beforeNodes.has(l.nodeId)),
    },
    parts: {
      added: after.parts.filter((p) => !beforeParts.has(partKey(p))),
      removed: before.parts.filter((p) => !afterParts.has(partKey(p))),
      kept: after.parts.filter((p) => beforeParts.has(partKey(p))),
    },
    differencePence,
    direction: differencePence > 0 ? "more" : differencePence < 0 ? "less" : "same",
    durationChange: Math.round((after.serviceDurationHours - before.serviceDurationHours) * 100) / 100,
  };
}

export function hasChanges(diff: RevisionDiff): boolean {
  return (
    diff.lines.added.length > 0 ||
    diff.lines.removed.length > 0 ||
    diff.parts.added.length > 0 ||
    diff.parts.removed.length > 0
  );
}

/** "£23.40 more — you'll authorise it on your card" / "£18.00 less — released from your hold when the job's done". */
export function customerDirectionSentence(differencePence: number): string {
  if (differencePence > 0)
    return `${formatPrice(differencePence)} more than you booked — you'll authorise the difference on your card now, and nothing is charged until the job is complete.`;
  if (differencePence < 0)
    return `${formatPrice(-differencePence)} less than you booked — only the new total is charged when the job is complete, and the rest of your pre-authorisation is released.`;
  return "The same price as you booked.";
}

/** What the mechanic sees under the preview. */
export function mechanicDirectionSentence(differencePence: number): string {
  if (differencePence > 0)
    return `Customer pays ${formatPrice(differencePence)} more — they'll authorise it on their card when they approve. Don't start the new work until it shows Approved.`;
  if (differencePence < 0)
    return `Customer pays ${formatPrice(-differencePence)} less — the difference is released from their hold when you complete the job. They still need to approve the change.`;
  return "Same price — the customer still needs to approve the change of work.";
}

/** Short, signed: "+£23.40" / "−£18.00" / "no change". */
export function differenceLabel(differencePence: number): string {
  if (differencePence > 0) return `+${formatPrice(differencePence)}`;
  if (differencePence < 0) return `−${formatPrice(-differencePence)}`;
  return "no change";
}

function lineText(l: RevisionLine): string {
  const name = l.itemLabel ? `${l.description} · ${l.itemLabel}` : l.description;
  return l.kind === "product" ? `${name} · fixed price ${formatPrice(l.linePence)}` : `${name} · ${l.chargedHours} h`;
}
function partText(p: RevisionPart): string {
  return `${p.name}${p.quantity > 1 ? ` × ${p.quantity}` : ""} · ${formatPrice(p.linePence)}`;
}

/** Packed "a|b|c" lists for the email renderer. */
export function packDiff(diff: RevisionDiff): { removed: string; added: string; kept: string } {
  const pack = (items: string[]) => items.join("|");
  return {
    removed: pack([...diff.lines.removed.map(lineText), ...diff.parts.removed.map(partText)]),
    added: pack([...diff.lines.added.map(lineText), ...diff.parts.added.map(partText)]),
    kept: pack([...diff.lines.kept.map(lineText), ...diff.parts.kept.map(partText)]),
  };
}

/**
 * Task 38: the work a revision took off, as quote lines for a follow-on visit
 * — labour with the HaynesPro node and its book time, parts as parts — so the
 * return visit is quoted at what was taken off.
 */
export function followOnLinesFromRevision(diff: RevisionDiff): Array<{
  kind: "labour" | "part";
  description: string;
  hours: number | null;
  quantity: number;
  unitPence: number | null;
  nodeId: string | null;
  partId: string | null;
}> {
  return [
    ...diff.lines.removed
      .filter((l) => l.kind === "job" && l.chargedHours > 0)
      .map((l) => ({
        kind: "labour" as const,
        description: l.itemLabel ? `${l.description} (${l.itemLabel})` : l.description,
        hours: l.chargedHours,
        quantity: 1,
        unitPence: null,
        nodeId: l.nodeId,
        partId: null,
      })),
    ...diff.parts.removed.map((p) => ({
      kind: "part" as const,
      description: p.name,
      hours: null,
      quantity: p.quantity,
      unitPence: p.unitPence,
      nodeId: null,
      partId: p.partId,
    })),
  ];
}
