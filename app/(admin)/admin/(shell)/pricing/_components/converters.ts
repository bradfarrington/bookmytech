import { formatPrice, parsePrice } from "@/lib/utils";

// Shared display/parse converters for the inline pricing editors. Values are
// stored in pence (integers) or as rate decimals (0.15 = 15%); these turn them
// into the strings the cells show and edit.

export const pounds = {
  toInput: (pence: number) => (pence / 100).toFixed(2),
  toDisplay: (pence: number | null) => (pence == null ? "—" : formatPrice(pence)),
  parse: (raw: string) => parsePrice(raw),
};

export const percent = {
  toInput: (rate: number) => String(Math.round(rate * 1000) / 10), // 0.15 → "15"
  toDisplay: (rate: number | null) =>
    rate == null ? "—" : `${Math.round(rate * 1000) / 10}%`,
  parse: (raw: string): number | null => {
    const n = Number(raw.replace("%", "").trim());
    if (!Number.isFinite(n) || n < 0 || n > 90) return null;
    return Math.round(n * 10) / 1000; // "15" → 0.15
  },
};

export const multiplier = {
  toInput: (m: number) => String(m),
  toDisplay: (m: number | null) => (m == null ? "—" : `×${m.toFixed(3)}`),
  parse: (raw: string): number | null => {
    const n = Number(raw.replace("×", "").trim());
    if (!Number.isFinite(n) || n < 0.1 || n > 5) return null;
    return Math.round(n * 1000) / 1000;
  },
};
