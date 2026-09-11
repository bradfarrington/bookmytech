// Types for the LKQ Euro Car Parts integration (Task 42).
//
// Transcribed from docs/06-lkq-parts-api.md, which records what the LIVE test
// service actually returns — not what the supplied documentation claims. Where
// the two disagree the service wins; §2 of that doc lists five contradictions.
//
// Money: LKQ sends decimal pounds as strings ("31.67"). Everything is converted
// to integer pence at the edge in price.ts, so nothing downstream sees a float.

/** LKQECP API Plus — SOAP pricing, stock and (unimplemented) ordering. */
export interface LkqEcpConfig {
  sysId: string;
  pcId: string;
  password: string;
  account: string;
  /** Blank = the account's home branch. */
  branch: string;
  priceUrl: string;
}

/** ADS Vehicle & Parts — REST catalogue. METERED. */
export interface LkqAdsConfig {
  username: string;
  password: string;
  appId: string;
  apiKey: string;
  language: string;
  loggedInUser: string;
  vehicleUrl: string;
  partsUrl: string;
  /** The parts host demands the key here; the vehicle host reads the body. */
  authHeader: string;
  authScheme: string;
  erpAccount: string;
  erpBranch: string;
}

/**
 * One part to price. Either an ECP part number (8-digit as ADS returns it, or
 * the full 9-character variant), or a type + code lookup.
 */
export type LkqPartRef =
  | { supplierPartNo: string; type?: never; code?: never }
  | { type: "MANUF" | "OEM" | "TECHDOC"; code: string; supplierPartNo?: never };

/**
 * One flattened `<Part>` row. Money in integer pence, stock as a nullable count.
 *
 * A null stock figure means NO NUMBER WAS GIVEN, not zero — part 101690288 comes
 * back with every level blank while 333330020 reports NDCFree 195. Rendering a
 * blank as "0 in stock" would be a lie.
 */
export interface LkqPriceRow {
  /** The 9-character variant, e.g. "10459026X". */
  supplierPartNo: string;
  /** First 8 characters — the ADS catalogue number this laddered from. */
  basePartNo: string;
  shortCode: string;
  /** Supersession marker stripped out; see supersededTo. */
  description: string;
  /** "104592468" parsed out of a "S/S TO 104592468" description. */
  supersededTo: string | null;
  brand: string | null;
  /** OES | AMQ | PQ | VM | ICP | RF */
  quality: string | null;
  qualityDesc: string | null;
  /** THIS ACCOUNT'S price — the only figure that may drive costing. */
  showPricePence: number | null;
  /** Manufacturer RRP. 0 is meaningful here: "no published RRP". */
  retailPricePence: number | null;
  net1PricePence: number | null;
  /** Present only on surcharged parts. NEVER summed into showPrice — see docs §3. */
  surchargePence: number | null;
  branchFree: number | null;
  buddyFree: number | null;
  rdcFree: number | null;
  ndcFree: number | null;
  companyFree: number | null;
}

export interface LkqAccount {
  number: string;
  name: string;
  currency: string;
}

/**
 * The result of a GetPrice call. `notFound` carries the part numbers LKQ
 * answered £0.00 for — see isNotFound in price.ts. They are deliberately kept
 * OUT of `rows` so a phantom free part cannot reach a screen.
 */
export interface LkqPriceResult {
  rows: LkqPriceRow[];
  notFound: string[];
  account: LkqAccount | null;
  branch: string | null;
}

/**
 * One attribute from the ADS vehicle lookup.
 *
 * The list is a MULTIMAP, not a dictionary: names repeat with differently-cased
 * values (Fuel = "PETROL" and "Petrol"; BodyStyle = "4 DOOR SALOON" and
 * "Saloon"). Never build an object keyed by Name — it silently loses entries.
 */
export interface AdsAttribute {
  Name: string;
  Value: string;
  DisplayName?: string;
  DisplayValue?: string;
  Source?: string;
}

/** Fitment columns are labelled by the reply itself, never by a guessed constant. */
export interface AdsColumn {
  UniqueName?: string;
  BindingName?: string;
  DisplayName?: string;
  IsVisible?: boolean;
  ContainsData?: boolean;
}

/**
 * One part from the ADS catalogue.
 *
 * NB it carries NO description and NO brand — only a part number and fitment
 * columns. Every human-readable word comes from the ECP pricing call, so an ADS
 * part with no ECP match can only be rendered as a bare number.
 */
export interface AdsPart {
  PartNumber?: string;
  SupplierId?: string;
  ComponentNumber?: string;
  ComponentName?: string;
  Component?: string;
  QuantityOfFit?: number;
  ImagePath?: string | null;
  DynamicProperties?: Record<string, string> | null;
}

export interface AdsPartsReply {
  IsValid?: boolean;
  Parts?: AdsPart[];
  Configuration?: { Columns?: AdsColumn[] } | null;
  SearchGuid?: string;
}

export interface AdsComponent {
  ComponentNumber: string;
  ComponentName: string;
  ComponentSource: string;
}

/** Error codes from the Pricing/Availability doc §10. 0 = no error. */
export const LKQ_ERROR_CODES: Readonly<Record<number, string>> = {
  0: "No error",
  100: "Unspecified error",
  101: "Database connection error",
  102: "Invalid request XML",
  103: "Invalid system identifier",
  104: "Invalid password",
  105: "PC name not found",
  106: "Invalid branch",
  107: "Product not found",
  108: "Database read error",
  109: "Database write error",
  110: "Unable to create XML response",
  111: "System setup error",
  112: "No K8 session found",
  113: "Gateway failure",
  114: "User not in SOP",
  115: "No session found",
  116: "Account not allowed",
  117: "Branch not allowed",
  118: "User not allowed",
  119: "Function not available",
  120: "Incoming data error",
};

/** Quality codes from the Pricing/Availability doc §9. */
export const LKQ_QUALITY: Readonly<Record<string, string>> = {
  AMQ: "Aftermarket quality",
  ICP: "Independently certified part",
  OES: "Original equipment supplier",
  PQ: "Premium quality",
  RF: "Refurbished",
  VM: "Vehicle manufacturer part",
};

/**
 * Codes that mean "our credentials or account are wrong", as opposed to "LKQ is
 * having a bad day". Drives the health banner's wording.
 */
export const LKQ_AUTH_ERROR_CODES: readonly number[] = [103, 104, 105, 114, 116, 117, 118];

/** Codes that mean the session token is stale and one re-mint is worth trying. */
export const LKQ_SESSION_ERROR_CODES: readonly number[] = [112, 115];
