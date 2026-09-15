import { daysBetweenKeys, londonDateKey } from "@/lib/slots";
import { motAlert, normaliseRegistration, type MotAlert } from "@/lib/garage/status";

// How a garage vehicle reads on the Garage and History screens (Task 48).
// Pure, so it's unit-tested; the rules about WHEN an MOT warns live in
// lib/garage/status.ts and are only worded here.

/** Words DVLA sends in capitals that are meant to stay that way. */
const KEEP_UPPERCASE = new Set([
  "AMG", "BMW", "BYD", "CDI", "DAF", "DS", "EV", "GMC", "GT", "GTD", "GTI", "HSE", "KTM", "LDV", "MG", "RS", "SUV", "TDI", "TSI", "VW",
]);

/**
 * DVLA sends makes, models, colours and fuel types in capitals: "LAND ROVER"
 * reads as "Land Rover", "MERCEDES-BENZ" as "Mercedes-Benz". Model codes with
 * digits ("A3", "320D") and known acronyms stay as they are, and anything
 * already in mixed case is left alone.
 */
export function titleCaseDvla(value: string | null | undefined): string | null {
  const text = value?.trim().replace(/\s+/g, " ");
  if (!text) return null;
  if (text !== text.toUpperCase()) return text;
  return text
    .split(" ")
    .map((word) => {
      if (KEEP_UPPERCASE.has(word) || /\d/.test(word)) return word;
      return word.toLowerCase().replace(/(^|-)([a-z])/g, (_, sep: string, letter: string) => sep + letter.toUpperCase());
    })
    .join(" ");
}

export interface VehicleNaming {
  nickname: string | null;
  make: string | null;
  model: string | null;
  colour: string | null;
  yearOfManufacture: number | null;
  displayRegistration: string;
}

/** "Ford Focus", or null when DVLA gave neither. */
export function makeAndModel(vehicle: Pick<VehicleNaming, "make" | "model">): string | null {
  return [titleCaseDvla(vehicle.make), titleCaseDvla(vehicle.model)].filter(Boolean).join(" ") || null;
}

/** The card's title: the nickname, else the make and model, else the plate. */
export function vehicleTitle(vehicle: VehicleNaming): string {
  return vehicle.nickname?.trim() || makeAndModel(vehicle) || vehicle.displayRegistration;
}

/** The line under the title. The make and model only appear here when a nickname took the title. */
export function vehicleCaption(vehicle: VehicleNaming): string | null {
  const parts = [
    vehicle.nickname?.trim() ? makeAndModel(vehicle) : null,
    titleCaseDvla(vehicle.colour),
    vehicle.yearOfManufacture ? String(vehicle.yearOfManufacture) : null,
  ];
  return parts.filter(Boolean).join(" · ") || null;
}

/** "YYYY-MM-DD" from DVLA → "12 Dec 2026". Null for anything else. */
export function formatDvlaDate(date: string | null | undefined): string | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const [y, m, d] = date.split("-").map(Number);
  const at = new Date(Date.UTC(y, m - 1, d, 12));
  if (Number.isNaN(at.getTime())) return null;
  return at.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export type StatTone = "good" | "warn" | "bad" | "plain" | "unset";

export interface Stat {
  value: string;
  tone: StatTone;
}

/** The MOT stat: its expiry date, amber when it's due soon and red once it has run out. */
export function motStat(motExpiryDate: string | null, now: Date = new Date()): Stat {
  const date = formatDvlaDate(motExpiryDate);
  if (!date) return { value: "Not set", tone: "unset" };
  const alert = motAlert(motExpiryDate, now);
  return { value: date, tone: alert?.kind === "expired" ? "bad" : alert ? "warn" : "good" };
}

/** The MOT warning's wording, or null when there's nothing to say. */
export function motAlertTitle(alert: MotAlert): string | null {
  if (!alert) return null;
  if (alert.kind === "expired") return "MOT expired";
  if (alert.days === 0) return "MOT due today";
  return `MOT due in ${alert.days} ${alert.days === 1 ? "day" : "days"}`;
}

/** DVLA's tax status in a word: "Taxed", "Untaxed" or "SORN". */
export function taxStat(taxStatus: string | null): Stat {
  const status = taxStatus?.trim();
  if (!status) return { value: "Not set", tone: "unset" };
  const lower = status.toLowerCase();
  if (lower === "sorn") return { value: "SORN", tone: "bad" };
  // Negatives first: "Not Taxed for on Road Use" and "Untaxed" both contain "taxed".
  if (lower.startsWith("not") || lower.includes("untaxed")) return { value: "Untaxed", tone: "bad" };
  if (lower.includes("taxed")) return { value: "Taxed", tone: "good" };
  return { value: titleCaseDvla(status) ?? status, tone: "plain" };
}

/** "Today", "Yesterday", "5 days ago", "3 weeks ago", "6 months ago", "2 years ago", by London calendar day. */
export function timeAgo(iso: string | null | undefined, now: Date = new Date()): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  const days = daysBetweenKeys(londonDateKey(at), londonDateKey(now));
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  const years = Math.floor(days / 365);
  return years === 1 ? "1 year ago" : `${years} years ago`;
}

interface BookingForLastJob {
  vehicleReg: string;
  status: string;
  completedAt: string | null;
  scheduledAt: string | null;
}

/** Each registration's most recent completed booking, as an ISO instant, keyed as the garage stores plates. */
export function lastCompletedByRegistration(bookings: BookingForLastJob[]): Map<string, string> {
  const latest = new Map<string, string>();
  for (const booking of bookings) {
    if (booking.status !== "completed") continue;
    const at = booking.completedAt ?? booking.scheduledAt;
    if (!at || Number.isNaN(new Date(at).getTime())) continue;
    const registration = normaliseRegistration(booking.vehicleReg ?? "");
    if (!registration) continue;
    const previous = latest.get(registration);
    if (!previous || new Date(at).getTime() > new Date(previous).getTime()) latest.set(registration, at);
  }
  return latest;
}

/** The booking flow's first step for this plate. /book/vehicle reads `reg`. */
export function bookVehicleHref(registration: string): string {
  return `/book/vehicle?reg=${encodeURIComponent(normaliseRegistration(registration))}`;
}
