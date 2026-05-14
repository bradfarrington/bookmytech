import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Normalises a UK reg plate to upper-case with a single space between the
// area code and the rest, e.g. "lb21xyz" -> "LB21 XYZ". Returns the raw
// uppercased value if it doesn't look like a standard plate; callers can do
// their own validation on top.
export function normaliseReg(input: string): string {
  const cleaned = input.replace(/\s+/g, "").toUpperCase();
  // Modern UK format: 2 letters + 2 digits + 3 letters. Insert a space after
  // the first 4 chars when the length permits.
  if (/^[A-Z]{2}\d{2}[A-Z]{3}$/.test(cleaned)) {
    return `${cleaned.slice(0, 4)} ${cleaned.slice(4)}`;
  }
  return cleaned;
}

// £45.99 is stored as 4599 pence. Formats with a £ prefix; whole-pound
// amounts are shown without the trailing .00 (e.g. £45 not £45.00).
export function formatPrice(pence: number): string {
  if (!Number.isFinite(pence)) return "—";
  const pounds = pence / 100;
  return pounds % 1 === 0
    ? `£${pounds.toFixed(0)}`
    : `£${pounds.toFixed(2)}`;
}

// Parses a £-shaped string ("£45.99", "45.99", "  £45 ") into integer pence.
// Returns null when the input doesn't parse to a non-negative number — the
// server action surfaces a friendly error.
export function parsePrice(input: string): number | null {
  const clean = input.trim().replace(/^£/, "").replace(/,/g, "").trim();
  if (clean === "") return null;
  const num = Number(clean);
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.round(num * 100);
}

// Lower-cases, hyphenates and strips punctuation to produce a URL-safe slug.
// "Front Brake Pads (Premium)" → "front-brake-pads-premium".
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
