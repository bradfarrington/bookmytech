// Resolution Center domain constants — plain module (no I/O), importable by
// client + server. The Resolution Center is the INTERNAL mechanic ↔ admin
// channel for raising issues about a specific job (see 0032_resolution_center).

export type ResolutionStatus = "open" | "in_progress" | "resolved" | "closed";
export type ResolutionRole = "mechanic" | "admin";

export const RESOLUTION_STATUS_LABELS: Record<ResolutionStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
  closed: "Closed",
};

// Tailwind pill tones per status (matches the disputes palette).
export const RESOLUTION_STATUS_TONES: Record<ResolutionStatus, string> = {
  open: "bg-amber-50 text-amber-800",
  in_progress: "bg-blue-50 text-brand-blue",
  resolved: "bg-green-50 text-success",
  closed: "bg-surface text-text-muted",
};

// Statuses an admin can move a case into from the workbench.
export const ADMIN_RESOLVABLE_STATUSES: ResolutionStatus[] = [
  "open",
  "in_progress",
  "resolved",
  "closed",
];

export const MIN_DESCRIPTION_CHARS = 20;
export const MAX_DESCRIPTION_CHARS = 2000;

/** Short human-readable job reference, shared with the mechanic job pages. */
export function bookingShortRef(bookingId: string): string {
  return bookingId.slice(0, 8).toUpperCase();
}
