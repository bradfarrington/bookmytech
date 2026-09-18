// What a mechanic application must be before it is stored — the ONE set of
// rules for the website's wizard (app/actions/submit-application.ts) and the
// mechanic app (POST /api/mobile/v1/applications), Task 71. Pure — no I/O, no
// "server-only" — so it can be tested exhaustively (validate.test.ts).
//
// The wizard checks most of this step by step in the browser, but a browser
// check is advice, not a rule: until Task 71 the server took any business
// type, any specialism, any `docs` string. The mechanic app is a second client
// that can send whatever it likes, so everything the wizard stops, this stops.
//
// The sentences are shown to the applicant verbatim on both clients. Where the
// wizard already had wording for a rule, this uses the same words.

import { ACCEPTED_DOC_MIME, DOC_BY_TYPE, type DocType } from "@/lib/onboarding/docs";
import { SPECIALISMS } from "@/lib/specialisms";

export type ApplicationRefusalCode = "invalid" | "conflict" | "failed";

export interface ApplicationRefusal {
  ok: false;
  code: ApplicationRefusalCode;
  error: string;
}

export function refuseApplication(code: ApplicationRefusalCode, error: string): ApplicationRefusal {
  return { ok: false, code, error };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const POSTCODE_RE = /^[A-Z]{1,2}[0-9][A-Z0-9]?(\s?[0-9][A-Z]{2})?$/i;
const SORT_CODE_RE = /^\d{6}$/;
const ACCOUNT_RE = /^\d{8}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const MIN_YEARS_EXPERIENCE = 0;
export const MAX_YEARS_EXPERIENCE = 70;
export const MIN_RADIUS_MILES = 1;
export const MAX_RADIUS_MILES = 100;

const SPECIALISM_SLUGS: ReadonlySet<string> = new Set(SPECIALISMS.map((s) => s.slug));
const DOC_EXTENSIONS: ReadonlySet<string> = new Set(Object.values(ACCEPTED_DOC_MIME));

/** A client-minted draft id, normalised. Null when it isn't a UUID. */
export function normaliseDraftId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim().toLowerCase();
  return UUID_RE.test(id) ? id : null;
}

export function isApplicationDocType(value: unknown): value is DocType {
  return typeof value === "string" && Object.hasOwn(DOC_BY_TYPE, value);
}

/** Where a draft's document lives in the private `mechanic-docs` bucket. */
export function applicationDocPath(draftId: string, docType: DocType, ext: string): string {
  return `applications/${draftId}/${docType}.${ext}`;
}

/**
 * Is `path` exactly the object an upload for THIS draft and THIS type would
 * have written? `applications/<draftId>/<docType>.<ext>` with one of the
 * extensions we accept, and nothing else — no other draft, no other type, no
 * `..`, no other folder. Without this a crafted submit could point an
 * application at someone else's file, and the admin reviewing it would be
 * shown that person's passport.
 */
export function isOwnApplicationDocPath(path: unknown, draftId: string, docType: DocType): boolean {
  if (typeof path !== "string") return false;
  const prefix = `applications/${draftId}/${docType}.`;
  if (!path.startsWith(prefix)) return false;
  return DOC_EXTENSIONS.has(path.slice(prefix.length));
}

/** What a client sends. Every field is untrusted, so every field is `unknown`. */
export interface ApplicationInput {
  draftId: unknown;
  fullName: unknown;
  email: unknown;
  phone: unknown;
  postcode: unknown;
  /** The wizard sends a string (possibly empty); the app a number or null. */
  yearsExperience: unknown;
  businessType: unknown;
  businessName: unknown;
  businessNumber: unknown;
  vatRegistered: unknown;
  specialisms: unknown;
  serviceRadiusMiles: unknown;
  /** `{ [docType]: path }`, only the documents actually uploaded. */
  docs: unknown;
  bankSortCode: unknown;
  bankAccountNumber: unknown;
  references: unknown;
}

export interface ApplicationReference {
  name: string | null;
  relationship: string | null;
  email: string | null;
  phone: string | null;
}

/** An application that passed every rule, ready to insert. */
export interface ValidApplication {
  draftId: string;
  fullName: string;
  email: string;
  phone: string;
  postcode: string;
  yearsExperience: number | null;
  businessType: "sole_trader" | "limited_company";
  businessName: string;
  businessNumber: string;
  vatRegistered: boolean;
  specialisms: string[];
  serviceRadiusMiles: number;
  docs: Partial<Record<DocType, string>>;
  sortCode: string;
  accountNumber: string;
  references: [ApplicationReference, ApplicationReference];
}

export type ApplicationValidation = ({ ok: true } & { application: ValidApplication }) | ApplicationRefusal;

const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const optional = (v: unknown): string | null => text(v) || null;

function yearsFrom(value: unknown): number | null | "bad" {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && !value.trim()) return null;
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value.trim()) : NaN;
  if (!Number.isInteger(n) || n < MIN_YEARS_EXPERIENCE || n > MAX_YEARS_EXPERIENCE) return "bad";
  return n;
}

function referenceFrom(value: unknown): ApplicationReference {
  const r = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return {
    name: optional(r.name),
    relationship: optional(r.relationship),
    email: optional(r.email)?.toLowerCase() ?? null,
    phone: optional(r.phone),
  };
}

/**
 * The first reason this application can't be stored, or the normalised
 * application. Checked in the wizard's own order — about you, your business,
 * what you work on, documents and bank — so the sentence names the earliest
 * step to go back to.
 */
export function validateApplication(input: ApplicationInput): ApplicationValidation {
  const invalid = (error: string) => refuseApplication("invalid", error);

  const draftId = normaliseDraftId(input.draftId);
  if (!draftId) return invalid("Something went wrong with your application. Please start again.");

  // --- Step 1: about you -----------------------------------------------------
  const fullName = text(input.fullName);
  const email = text(input.email).toLowerCase();
  const phone = text(input.phone);
  const postcode = text(input.postcode).toUpperCase();
  if (!fullName) return invalid("Full name is required.");
  if (!email || !EMAIL_RE.test(email)) return invalid("Enter a valid email address.");
  if (!phone) return invalid("Phone number is required.");
  if (!postcode || !POSTCODE_RE.test(postcode)) return invalid("Enter a valid UK postcode.");

  const years = yearsFrom(input.yearsExperience);
  if (years === "bad") {
    return invalid(
      `Years of experience must be a whole number between ${MIN_YEARS_EXPERIENCE} and ${MAX_YEARS_EXPERIENCE}.`,
    );
  }

  // --- Step 2: your business -------------------------------------------------
  const businessType = input.businessType;
  if (businessType !== "sole_trader" && businessType !== "limited_company") {
    return invalid("Please choose how you operate.");
  }
  const businessName = text(input.businessName);
  if (!businessName) return invalid("Please enter your business name.");
  const businessNumber = text(input.businessNumber);
  if (!businessNumber) {
    return invalid(
      businessType === "limited_company" ? "Please enter your company number." : "Please enter your UTR.",
    );
  }
  const vatRegistered = input.vatRegistered === true;

  // --- Step 3: what you work on ----------------------------------------------
  if (!Array.isArray(input.specialisms)) return invalid("Pick at least one thing you work on.");
  const specialisms = [...new Set(input.specialisms.map(text).filter(Boolean))];
  if (specialisms.length === 0) return invalid("Pick at least one thing you work on.");
  if (specialisms.some((s) => !SPECIALISM_SLUGS.has(s))) {
    return invalid("Something went wrong with the things you work on. Please pick them again.");
  }

  const radius = typeof input.serviceRadiusMiles === "number" ? input.serviceRadiusMiles : Number(input.serviceRadiusMiles);
  if (!Number.isFinite(radius) || radius < MIN_RADIUS_MILES || radius > MAX_RADIUS_MILES) {
    return invalid(`Service radius must be between ${MIN_RADIUS_MILES} and ${MAX_RADIUS_MILES} miles.`);
  }

  // --- Step 4: documents -----------------------------------------------------
  // Documents are deliberately NOT required to submit: they can be supplied
  // later under the 28-day grace period an admin grants at approval. What IS
  // required is that every path sent is this draft's own upload of that type.
  const docs: Partial<Record<DocType, string>> = {};
  if (input.docs !== undefined && input.docs !== null) {
    if (typeof input.docs !== "object" || Array.isArray(input.docs)) {
      return invalid("Something went wrong with your documents. Please upload them again.");
    }
    for (const [type, path] of Object.entries(input.docs as Record<string, unknown>)) {
      if (path === null || path === undefined || path === "") continue;
      if (!isApplicationDocType(type) || !isOwnApplicationDocPath(path, draftId, type)) {
        return invalid("Something went wrong with your documents. Please upload them again.");
      }
      if (type === "vat" && !vatRegistered) {
        return invalid(
          "You've uploaded a VAT registration document but said you're not VAT registered. Remove it, or tick VAT registered.",
        );
      }
      docs[type] = path as string;
    }
  }

  const sortCode = text(input.bankSortCode).replace(/[\s-]/g, "");
  const accountNumber = text(input.bankAccountNumber).replace(/\s/g, "");
  if (!SORT_CODE_RE.test(sortCode)) return invalid("Sort code must be 6 digits.");
  if (!ACCOUNT_RE.test(accountNumber)) return invalid("Account number must be 8 digits.");

  // References are optional entirely; we store whatever was provided.
  const refs = Array.isArray(input.references) ? input.references : [];

  return {
    ok: true,
    application: {
      draftId,
      fullName,
      email,
      phone,
      postcode,
      yearsExperience: years,
      businessType,
      businessName,
      businessNumber,
      vatRegistered,
      specialisms,
      serviceRadiusMiles: Math.round(radius),
      docs,
      sortCode,
      accountNumber,
      references: [referenceFrom(refs[0]), referenceFrom(refs[1])],
    },
  };
}

/**
 * The 409 when the address already has an application. The UNIQUE on
 * `mechanic_applications.email` means it never frees up — a rejected applicant
 * cannot simply apply again — so the sentence says who to contact rather than
 * leaving them at a dead end.
 */
export const DUPLICATE_APPLICATION_MESSAGE =
  "An application with that email already exists. If you've been rejected before or need to update it, email support@bookmytech.co.uk.";
