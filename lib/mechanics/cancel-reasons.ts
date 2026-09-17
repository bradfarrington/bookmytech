// Why a mechanic hands a job back. `value` is what is stored in
// `bookings.cancellation_reason` and the `cancelled` event; `label` is the
// website's longer wording. One list for the website's picker
// (jobs/[id]/_components/job-actions.tsx) and the mechanic app, which gets the
// values from GET /api/mobile/v1/mechanic/bookings/[id]/job.

export const CANCEL_REASONS = [
  { value: "Vehicle or parts issue", label: "Vehicle / parts issue" },
  { value: "Scheduling clash", label: "Scheduling clash / double-booked" },
  { value: "Unwell", label: "Unwell / unavailable" },
  { value: "Customer unreachable", label: "Customer unreachable" },
  { value: "Outside my area", label: "Too far / outside my area" },
  { value: "Other", label: "Other" },
] as const;

/** "Unwell: back Thursday" — the one string `cancelOwnJobFor` takes. */
export function joinCancelReason(reason: string, detail?: string | null): string {
  const extra = (detail ?? "").trim();
  return extra ? `${reason}: ${extra}` : reason;
}
