// Minimal types for the HaynesPro Data Exchange operations Task 16 uses.
// The API returns far more fields than this — extend as needed. Shapes were
// verified against live REST JSON replies on 2026-07-09 (see
// docs/04-supplier-apis.md §3).

/** Item of decodeVINV4 / findCarTypesByDetailsV3 — a candidate car type. */
export interface HpCarType {
  id: number | null;
  name?: string | null;
  fullName?: string | null;
  /** 3 = Type (the bookable level). */
  level?: number | string | null;
  engineCode?: string | null;
  capacity?: number | null;
  output?: number | null;
  fuelType?: string | string[] | null;
  /** Years (V3+): "1997" — older ops return "1997-01". */
  madeFrom?: string | null;
  madeUntil?: string | null;
  /** decodeVINV4 embeds the matching repair-time types directly. */
  repairTimeTypes?: HpRepairtimeType[] | null;
  status?: HpStatus | null;
}

export interface HpRepairtimeType {
  make?: string | null;
  model?: string | null;
  type?: string | null;
  output?: number | null;
  madeFrom?: string | null;
  madeUntil?: string | null;
  repairtimeTypeId: number | null;
  typeCategory?: string | null;
  rootNodeId?: string | null;
  status?: HpStatus | null;
}

/** Node of the repair-times tree (getRepairtimeNodesByGenartsV4 returns leaves). */
export interface HpRepairtimeNode {
  id?: string | null;
  awNumber?: string | null;
  description?: string | null;
  /** Time as an integer = hours × 100 (70 = 0.7h). Null on group nodes. */
  value?: number | null;
  hasSubnodes?: boolean | null;
  hasInfoGroups?: boolean | null;
  genarts?: Array<{ id?: number | null; description?: string | null }> | null;
  status?: HpStatus | null;
}

export interface HpMaintenanceSystem {
  id?: number | null;
  name?: string | null;
  maintenancePeriods?: HpMaintenancePeriod[] | null;
  status?: HpStatus | null;
}

export interface HpMaintenancePeriod {
  id?: number | null;
  name?: string | null;
  times?: HpTime[] | null;
}

export interface HpTime {
  /** Integer = hours × 100. */
  value?: number | null;
  /** COMPUTED_TIME | COMMERCIAL_TIME | REGIONAL_TIME. */
  type?: string | null;
  /** When several time types exist, exactly one is flagged selected. */
  selected?: boolean | null;
}

export interface HpStatus {
  statusCode?: number | null;
  confirmationLink?: string | null;
}

/**
 * Node of getIdentificationTreeV2. Levels: ROOT → MAKE → MODEL → TYPE.
 * `image` is an svgz URL on haynespro-assets.com (served as image/svg+xml +
 * gzip with open CORS — renders in a plain <img>). Makes carry NO images.
 */
export interface HpTreeNode {
  id: number | null;
  level?: string | null;
  name?: string | null;
  fullName?: string | null;
  madeFrom?: string | null;
  madeUntil?: string | null;
  engineCode?: string | null;
  fuelType?: string | string[] | null;
  capacity?: number | null;
  output?: number | null;
  image?: string | null;
  superElementId?: number | null;
  subElements?: HpTreeNode[] | null;
  status?: HpStatus | null;
}

/** Item of getStoryOverview — one repair manual available for the car type. */
export interface HpStoryOverviewItem {
  name?: string | null;
  storyId: number | null;
  order?: number | null;
  status?: HpStatus | null;
}

export interface HpMimeData {
  /** Absolute image URL (jpg or svgz) on haynespro-assets.com. */
  mimeDataName?: string | null;
}

/** Recursive line of getStoryInfoV6 / getIdLocationV3 story bodies. */
export interface HpStoryLine {
  id?: number | null;
  name?: string | null;
  order?: number | null;
  remark?: string | null;
  subStoryLines?: HpStoryLine[] | null;
  mimeData?: HpMimeData | null;
  paragraphContent?: string | null;
  status?: HpStatus | null;
}

export interface HpStoryInfo {
  name?: string | null;
  storyLines?: HpStoryLine[] | null;
  status?: HpStatus | null;
}

/** Recursive row of getAdjustmentsV7 / getLubricantCapacitiesV4. */
export interface HpAdjustment {
  name?: string | null;
  value?: string | null;
  unit?: string | null;
  remark?: string | null;
  order?: number | null;
  subAdjustments?: HpAdjustment[] | null;
  status?: HpStatus | null;
}
