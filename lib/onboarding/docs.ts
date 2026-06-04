// Shared document definitions for the mechanic onboarding flow (Task 07).
// Plain module (no "use server" / no "server-only") so it can be imported by
// both the client wizard and the server actions / auto-screen checks.

export type DocType =
  | "photo_id"
  | "public_liability_insurance"
  | "trade_insurance"
  | "qualification"
  | "vat";

export interface DocDef {
  type: DocType;
  /** Maps to the doc_* column on mechanic_applications. */
  column:
    | "doc_photo_id"
    | "doc_public_liability_insurance"
    | "doc_trade_insurance"
    | "doc_qualification"
    | "doc_vat";
  label: string;
  hint: string;
  /** vat is only required when the applicant is VAT registered. */
  conditional?: boolean;
}

export const DOC_DEFS: readonly DocDef[] = [
  {
    type: "photo_id",
    column: "doc_photo_id",
    label: "Photo ID",
    hint: "Passport or driving licence",
  },
  {
    type: "public_liability_insurance",
    column: "doc_public_liability_insurance",
    label: "Public liability insurance",
    hint: "Certificate (PDF or image)",
  },
  {
    type: "trade_insurance",
    column: "doc_trade_insurance",
    label: "Trade insurance",
    hint: "Certificate (PDF or image)",
  },
  {
    type: "qualification",
    column: "doc_qualification",
    label: "Trade qualification",
    hint: "NVQ, IMI, City & Guilds, etc.",
  },
  {
    type: "vat",
    column: "doc_vat",
    label: "VAT registration document",
    hint: "Only if you're VAT registered",
    conditional: true,
  },
] as const;

export const DOC_BY_TYPE: Record<DocType, DocDef> = Object.fromEntries(
  DOC_DEFS.map((d) => [d.type, d]),
) as Record<DocType, DocDef>;

// Accepted upload formats and size cap, shared by the client picker and the
// server upload action so the rules can't drift.
export const ACCEPTED_DOC_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
export const ACCEPTED_DOC_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp";
export const MAX_DOC_BYTES = 10 * 1024 * 1024; // 10 MB
// Auto-screen flags insurance files larger than this (Stage 2).
export const INSURANCE_MAX_OK_BYTES = 5 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Active-mechanic document types (Stage 3, mechanic_documents table). Distinct
// key set from the application doc columns — these track renewable, expiring
// documents on file for an approved mechanic.
// ---------------------------------------------------------------------------
export type MechanicDocType =
  | "public_liability_insurance"
  | "trade_insurance"
  | "qualification"
  | "id"
  | "vat";

export interface MechanicDocDef {
  type: MechanicDocType;
  label: string;
  /** Whether an expiry date is expected (insurance renews; ID/qual may not). */
  expires: boolean;
}

export const MECHANIC_DOC_DEFS: readonly MechanicDocDef[] = [
  { type: "public_liability_insurance", label: "Public liability insurance", expires: true },
  { type: "trade_insurance", label: "Trade insurance", expires: true },
  { type: "qualification", label: "Trade qualification", expires: false },
  { type: "id", label: "Photo ID", expires: true },
  { type: "vat", label: "VAT registration", expires: false },
] as const;

export const MECHANIC_DOC_LABEL: Record<MechanicDocType, string> = Object.fromEntries(
  MECHANIC_DOC_DEFS.map((d) => [d.type, d.label]),
) as Record<MechanicDocType, string>;

// Documents that, when expired, must take a mechanic offline (can't receive
// new jobs until current). Qualifications/VAT don't gate dispatch.
export const DISPATCH_GATING_DOC_TYPES: MechanicDocType[] = [
  "public_liability_insurance",
  "trade_insurance",
];
