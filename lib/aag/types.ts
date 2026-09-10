// Types for the AAG (Alliance Automotive Group) Sales API v2 — the parts
// pricing / ordering API behind Gareth's trade account (Task 40).
//
// Transcribed from "AAG Sales API v2 — Customer Integration Document" v1.07
// (Data Contract Customer.pdf). Every field is optional or nullable on purpose:
// the document's examples are illustrative, several fields are marked "not
// yet available" or "currently not available to all accounts", and nothing
// here has been verified against a live reply yet — see docs/05-aag-parts-api.md
// for what the sandbox actually returned once the probes ran.
//
// Money: AAG quotes `CostPrice` and `Surcharge` as pounds with pence as a
// decimal (11.21). lib/aag/quote.ts converts to integer pence at the edge;
// nothing downstream should ever see a float.

/** Every reply carries this. SuccessFlag is the truth — NOT the HTTP status. */
export interface AagHeader {
  SuccessFlag?: boolean | null;
  Message?: string | null;
  /** "ISE00nn" — see the error table in the manual / describeAagError. */
  ErrorCode?: string | null;
}

export interface AagEnvelope<TBody> {
  Header?: AagHeader | null;
  Body?: TBody | null;
}

// --- /api/quote -------------------------------------------------------------

export interface AagQuoteRequest {
  /** TecDoc GenArt id as a string — "82" brake discs, "402" brake pads. */
  CustomerProductGroup: string;
  /** Registration, uppercase, no spaces. */
  VRM: string;
  IncludeVehicleDetails?: boolean;
}

export interface AagAvailability {
  /** Needed to order from this location. */
  AagLocationId?: number | null;
  /** "LV Subs" | "FPS" | "Apec" | "Platinum". */
  AagBusinessUnit?: string | null;
  BranchCode?: string | null;
  LocationName?: string | null;
  /** "Local" | "Buddy" | "RDC" | "NDC" — case varies in the examples. */
  LocationType?: string | null;
  QtyInStock?: number | null;
  /** "13:00", "N/A", "14:15 NWD" — a display string, not a time. */
  EstDeliveryTime?: string | null;
  /** 1 = quickest delivery; use it by default. */
  Priority?: number | null;
}

export interface AagProductOption {
  /** Line-level quote ref ("AAGQ1/1"); must be echoed on enquiry / order. */
  RequestLineId?: string | null;
  DisplayOrder?: number | null;
  /** AAG's product id / part number ("NPAPBD8077"). */
  ProductId?: string | null;
  Brand?: string | null;
  BrandLogoUrl?: string | null;
  /** "Premium" | "Standard" | "Budget". */
  BrandRating?: string | null;
  CustomerPartNumber?: string | null;
  /** "OK FOR SUPPLY" | "Unknown" | "UNKNOWN" — whether we may buy it. */
  CustomerLockoutRating?: string | null;
  /** Unit of issue — round order quantities up to this. */
  RecMinOrdQty?: number | null;
  /** Pounds, decimal. */
  CostPrice?: number | null;
  /** Core charge, pounds. "Not available to all accounts." */
  Surcharge?: number | null;
  Availability?: AagAvailability[] | null;
}

export interface AagArticleProperty {
  Name?: string | null;
  Value?: string | null;
}

export interface AagArticle {
  /** The catalogue that supplied the article ("Apec", "WIX"). */
  ArticleProvider?: string | null;
  ArticleDescription?: string | null;
  /** GenArt ids this article belongs to. */
  CustomerProductGroup?: string[] | null;
  /** "FR", "RR", "" … */
  FittingPosition?: string | null;
  /** MAM Autocat group ("BDIS"). */
  AutocatProductGroup?: string | null;
  ImageUrl?: string | null;
  ArticleProperties?: AagArticleProperty[] | null;
  /** The buyable products that satisfy this article. */
  ProductOptions?: AagProductOption[] | null;
}

export interface AagVehicleDetails {
  Vrm?: string | null;
  Vin?: string | null;
  EngineNo?: string | null;
  EngineSize?: string | null;
  Fuel?: string | null;
  Make?: string | null;
  Model?: string | null;
  YearOfManufacture?: string | null;
  /** "20141006". */
  DateRegistered?: string | null;
}

export interface AagQuoteBody {
  Articles?: AagArticle[] | null;
  VehicleDetails?: AagVehicleDetails[] | null;
}

export type AagQuoteResponse = AagEnvelope<AagQuoteBody>;

// --- /api/quote/classic -----------------------------------------------------

export interface AagQuoteClassicRequest {
  ProductGroupCodes: string[];
  VRM: string;
  IncludeVehicleDetails?: boolean;
}

export interface AagClassicStock {
  AAGLocationId?: number | null;
  BranchCode?: string | null;
  BranchName?: string | null;
  Count?: number | null;
  Notes?: string | null;
  /** Delivery SLA as a display string ("10:54"). */
  DeliveryNotes?: string | null;
}

export interface AagClassicProduct {
  ProductId?: string | null;
  Description?: string | null;
  RequestLineId?: string | null;
  MfgCode?: string | null;
  CustomerPartNumber?: string | null;
  CustomerLockoutRating?: string | null;
  Supplier?: {
    SupplierCode?: string | null;
    SupplierName?: string | null;
    BrandLogoFileName?: string | null;
  } | null;
  /** Pounds, decimal. */
  CostPrice?: number | null;
  PerQuantity?: number | null;
  Stock?: AagClassicStock[] | null;
  CustomerProductGroup?: string | null;
  Fitment?: string | null;
  ImageUrl?: string | null;
  IsKit?: boolean | null;
  /** "Premium" | "Standard" | "Budget". */
  ProductRating?: string | null;
  ProductDetails?: AagArticleProperty[] | null;
}

/**
 * The classic quote's body. The manual lists SuccessFlag / ErrorCode / Message
 * on this body as "not yet available", so a classic reply may have no Header
 * block at all — parseAagEnvelope treats a missing Header as success.
 */
export interface AagQuoteClassicBody {
  QuoteId?: string | null;
  CorrelationId?: string | null;
  Products?: AagClassicProduct[] | null;
  VehicleDetails?: AagVehicleDetails[] | null;
}

export type AagQuoteClassicResponse = AagEnvelope<AagQuoteClassicBody>;

// --- /api/product/info ------------------------------------------------------

export interface AagProductInfoRequest {
  Products: Array<{ ProductId: string }>;
}

export interface AagProductInfo {
  RequestLineId?: string | null;
  DisplayOrder?: number | null;
  CustomerProductGroup?: string[] | null;
  AutocatProductGroup?: string | null;
  ProductId?: string | null;
  ProductDescription?: string | null;
  Brand?: string | null;
  BrandLogoUrl?: string | null;
  BrandRating?: string | null;
  CustomerPartNumber?: string | null;
  CustomerLockoutRating?: string | null;
  RecMinOrdQty?: number | null;
  CostPrice?: number | null;
  Surcharge?: number | null;
}

export interface AagProductInfoBody {
  Products?: AagProductInfo[] | null;
  ProductsNotFound?: Array<{ ProductId?: string | null; Message?: string | null; message?: string | null }> | null;
}

export type AagProductInfoResponse = AagEnvelope<AagProductInfoBody>;

// --- Shared -----------------------------------------------------------------

/**
 * The GenArt ids the manual uses in its examples, for the admin check page's
 * picker. Not an AAG-published list — the full set they accept is an open
 * question in docs/05-aag-parts-api.md.
 */
export const AAG_EXAMPLE_GENARTS: ReadonlyArray<{ id: string; label: string }> = [
  { id: "82", label: "Brake discs" },
  { id: "402", label: "Brake pads" },
  { id: "8", label: "Air filter" },
  { id: "3357", label: "Brake fluid" },
  { id: "273", label: "Wishbone / control arm" },
  { id: "1", label: "Battery" },
  { id: "479", label: "Clutch" },
  { id: "307", label: "Cambelt" },
];
