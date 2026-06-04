// Basic auto-screening for mechanic applications (Task 07 Stage 2).
//
// Not OCR — just file-presence + format + size checks, as the task scopes it.
// Each item maps to one row in the admin verification checklist. The admin can
// manually flip any item to "verified" after viewing (persisted in the
// application's `verification` jsonb), which overrides the auto verdict.
//
// Plain module (no server-only) so it can be unit-imported anywhere.

import { INSURANCE_MAX_OK_BYTES } from "@/lib/onboarding/docs";

export type AutoVerdict = "pass" | "fail" | "manual" | "na";

export interface ChecklistItemResult {
  /** Stable key, also used as the manual-verify flag name. */
  key: string;
  label: string;
  /** Auto-screen verdict before any manual override. */
  verdict: AutoVerdict;
  note: string;
  /** doc_* column whose file backs this item, if any (for the View button). */
  docColumn?: string;
}

export interface AutoScreenInput {
  doc_photo_id: string | null;
  doc_public_liability_insurance: string | null;
  doc_trade_insurance: string | null;
  doc_qualification: string | null;
  doc_vat: string | null;
  vat_registered: boolean;
  /** Decrypted bank values (server decrypts before calling). */
  bankSortCode: string | null;
  bankAccountNumber: string | null;
  reference_1_email: string | null;
  reference_1_phone: string | null;
  reference_2_email: string | null;
  reference_2_phone: string | null;
  /** Object sizes in bytes keyed by storage path, for the < 5 MB insurance rule. */
  sizes: Record<string, number>;
}

const SORT_CODE_RE = /^\d{6}$/;
const ACCOUNT_RE = /^\d{8}$/;

function insuranceItem(
  key: string,
  label: string,
  path: string | null,
  sizes: Record<string, number>,
): ChecklistItemResult {
  if (!path) return { key, label, verdict: "fail", note: "No file uploaded.", docColumn: key };
  const size = sizes[path];
  if (size != null && size > INSURANCE_MAX_OK_BYTES) {
    return {
      key,
      label,
      verdict: "manual",
      note: `File is ${(size / 1024 / 1024).toFixed(1)} MB (over 5 MB) — review manually.`,
      docColumn: key,
    };
  }
  return { key, label, verdict: "pass", note: "Certificate present, size OK.", docColumn: key };
}

function presenceItem(
  key: string,
  label: string,
  path: string | null,
): ChecklistItemResult {
  return path
    ? { key, label, verdict: "manual", note: "File present — verify contents.", docColumn: key }
    : { key, label, verdict: "fail", note: "No file uploaded.", docColumn: key };
}

export function runAutoScreen(input: AutoScreenInput): ChecklistItemResult[] {
  const items: ChecklistItemResult[] = [];

  // 1. Photo ID
  items.push(presenceItem("doc_photo_id", "Photo ID", input.doc_photo_id));

  // 2. Public liability insurance
  items.push(
    insuranceItem(
      "doc_public_liability_insurance",
      "Public liability insurance",
      input.doc_public_liability_insurance,
      input.sizes,
    ),
  );

  // 3. Trade insurance
  items.push(
    insuranceItem(
      "doc_trade_insurance",
      "Trade insurance",
      input.doc_trade_insurance,
      input.sizes,
    ),
  );

  // 4. Trade qualification
  items.push(presenceItem("doc_qualification", "Trade qualification", input.doc_qualification));

  // 5. Bank account details — format check
  {
    const sortOk = !!input.bankSortCode && SORT_CODE_RE.test(input.bankSortCode);
    const accOk = !!input.bankAccountNumber && ACCOUNT_RE.test(input.bankAccountNumber);
    items.push({
      key: "bank",
      label: "Bank account details",
      verdict: sortOk && accOk ? "pass" : "fail",
      note:
        sortOk && accOk
          ? "Valid 6-digit sort code and 8-digit account number."
          : "Sort code / account number format invalid.",
    });
  }

  // 6. VAT registration (if applicable)
  if (input.vat_registered) {
    items.push(presenceItem("doc_vat", "VAT registration", input.doc_vat));
  } else {
    items.push({
      key: "doc_vat",
      label: "VAT registration",
      verdict: "na",
      note: "Applicant is not VAT registered.",
    });
  }

  // 7. Two professional references
  {
    const r1 = !!input.reference_1_email && !!input.reference_1_phone;
    const r2 = !!input.reference_2_email && !!input.reference_2_phone;
    items.push({
      key: "references",
      label: "Two professional references",
      verdict: r1 && r2 ? "pass" : "fail",
      note:
        r1 && r2
          ? "Both references have an email and phone."
          : "One or both references are missing contact details.",
    });
  }

  return items;
}

export interface AutoScreenSummary {
  total: number;
  autoVerified: number;
  needManual: number;
}

/** Top-of-detail summary: "5 of 7 items auto-verified. 2 need manual review." */
export function summarise(items: ChecklistItemResult[]): AutoScreenSummary {
  const relevant = items.filter((i) => i.verdict !== "na");
  const autoVerified = relevant.filter((i) => i.verdict === "pass").length;
  const needManual = relevant.filter(
    (i) => i.verdict === "manual" || i.verdict === "fail",
  ).length;
  return { total: relevant.length, autoVerified, needManual };
}
