import { PARKING_OPTIONS, type ParkingType } from "@/lib/bookings/parking";

// Saved addresses (Task 49): the shape both clients use, and the checks the
// website runs before it writes. The table enforces the same limits itself
// (migration 0072), because the app writes to it directly. These exist so the
// website can say which field is wrong instead of relaying a constraint name.

export type AddressKind = "home" | "work" | "other";

export const ADDRESS_KIND_OPTIONS: ReadonlyArray<{ value: AddressKind; label: string }> = [
  { value: "home", label: "Home" },
  { value: "work", label: "Work" },
  { value: "other", label: "Other" },
];

/** Mirrors the CHECKs and the per-customer cap in 0072. */
export const ADDRESS_LIMITS = {
  label: 40,
  note: 80,
  line: 120,
  instructions: 500,
  perCustomer: 20,
} as const;

/** A saved address: the app's `SavedAddress`, plus the special instructions. */
export interface SavedAddress {
  id: string;
  label: string;
  kind: AddressKind;
  note: string | null;
  addressLine1: string;
  addressLine2: string | null;
  postcode: string;
  parkingType: ParkingType | null;
  specialInstructions: string | null;
  isDefault: boolean;
}

export type AddressInput = Omit<SavedAddress, "id" | "isDefault">;

export interface CustomerAddressRow {
  id: string;
  label: string;
  kind: string;
  note: string | null;
  address_line_1: string;
  address_line_2: string | null;
  postcode: string;
  parking_type: string | null;
  special_instructions: string | null;
  is_default: boolean;
}

export const ADDRESS_COLUMNS =
  "id, label, kind, note, address_line_1, address_line_2, postcode, parking_type, special_instructions, is_default";

const POSTCODE_SHAPE = /^[A-Z]{1,2}[0-9][A-Z0-9]? [0-9][A-Z]{2}$/;

/** "ng127gg" → "NG12 7GG". The same rule as `normalise_uk_postcode` in 0072. */
export function normaliseUkPostcode(value: string): string {
  return value
    .replace(/\s+/g, "")
    .toUpperCase()
    .replace(/^(.+)([0-9][A-Z]{2})$/, "$1 $2");
}

export function isFullUkPostcode(value: string): boolean {
  return POSTCODE_SHAPE.test(normaliseUkPostcode(value));
}

function isKind(value: unknown): value is AddressKind {
  return ADDRESS_KIND_OPTIONS.some((option) => option.value === value);
}

function isParking(value: unknown): value is ParkingType {
  return PARKING_OPTIONS.some((option) => option.value === value);
}

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

export type AddressValidation = { ok: true; value: AddressInput } | { ok: false; error: string };

/** Check and tidy what a form sent. Every error is a sentence for the customer. */
export function validateAddressInput(raw: Record<string, unknown>): AddressValidation {
  const label = text(raw.label);
  if (!label) return { ok: false, error: "Give this address a name, like Home or Work." };
  if (label.length > ADDRESS_LIMITS.label) {
    return { ok: false, error: `Keep the name to ${ADDRESS_LIMITS.label} characters or fewer.` };
  }

  const note = text(raw.note);
  if (note.length > ADDRESS_LIMITS.note) {
    return { ok: false, error: `Keep the note to ${ADDRESS_LIMITS.note} characters or fewer.` };
  }

  const addressLine1 = text(raw.addressLine1);
  const addressLine2 = text(raw.addressLine2);
  if (!addressLine1) return { ok: false, error: "Enter the first line of the address." };
  if (addressLine1.length > ADDRESS_LIMITS.line || addressLine2.length > ADDRESS_LIMITS.line) {
    return { ok: false, error: `Keep each address line to ${ADDRESS_LIMITS.line} characters or fewer.` };
  }

  const rawPostcode = text(raw.postcode);
  if (!rawPostcode) return { ok: false, error: "Enter the postcode." };
  const postcode = normaliseUkPostcode(rawPostcode);
  if (!POSTCODE_SHAPE.test(postcode)) {
    return { ok: false, error: "Enter a full UK postcode, like NG12 7GG." };
  }

  const parking = text(raw.parkingType);
  if (parking && !isParking(parking)) {
    return { ok: false, error: "Choose where your mechanic can park." };
  }

  const specialInstructions = text(raw.specialInstructions);
  if (specialInstructions.length > ADDRESS_LIMITS.instructions) {
    return {
      ok: false,
      error: `Keep the instructions to ${ADDRESS_LIMITS.instructions} characters or fewer.`,
    };
  }

  return {
    ok: true,
    value: {
      label,
      kind: isKind(raw.kind) ? raw.kind : "other",
      note: note || null,
      addressLine1,
      addressLine2: addressLine2 || null,
      postcode,
      parkingType: parking ? (parking as ParkingType) : null,
      specialInstructions: specialInstructions || null,
    },
  };
}

export function addressFromRow(row: CustomerAddressRow): SavedAddress {
  return {
    id: row.id,
    label: row.label,
    kind: isKind(row.kind) ? row.kind : "other",
    note: row.note,
    addressLine1: row.address_line_1,
    addressLine2: row.address_line_2,
    postcode: row.postcode,
    parkingType: isParking(row.parking_type) ? row.parking_type : null,
    specialInstructions: row.special_instructions,
    isDefault: row.is_default,
  };
}

export function rowFromAddressInput(input: AddressInput) {
  return {
    label: input.label,
    kind: input.kind,
    note: input.note,
    address_line_1: input.addressLine1,
    address_line_2: input.addressLine2,
    postcode: input.postcode,
    parking_type: input.parkingType,
    special_instructions: input.specialInstructions,
  };
}

/** "12 Acacia Avenue, Flat 2, NG12 7GG" */
export function addressOneLine(
  address: Pick<SavedAddress, "addressLine1" | "addressLine2" | "postcode">,
): string {
  return [address.addressLine1, address.addressLine2, address.postcode].filter(Boolean).join(", ");
}
