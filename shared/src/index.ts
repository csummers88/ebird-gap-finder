/**
 * Shared request/response shapes for the eBird Gap Finder.
 *
 * Both the Express backend and the React frontend import these so the two sides
 * never drift. Keep this module dependency-free (pure types + constants).
 */

// ---- Hard limits enforced by both the UI and the backend (eBird's caps). ----
export const LIMITS = {
  /** eBird `dist` (search radius) caps at 50 km. */
  MAX_DIST_KM: 50,
  MIN_DIST_KM: 1,
  /** eBird `back` (lookback window) caps at 30 days. */
  MAX_BACK_DAYS: 30,
  MIN_BACK_DAYS: 1,
} as const;

export const DEFAULTS = {
  DIST_KM: 25,
  BACK_DAYS: 14,
} as const;

/** Which baseline counts as "already seen". `life` is the MVP; the rest are stretch. */
export type Scope = 'life' | 'year' | 'county';

/** Which eBird feed powers "what's around". */
export type GapSource = 'recent' | 'notable';

// ---- Configuration the frontend needs on load. ----
export interface AppConfig {
  defaultLat: number;
  defaultLng: number;
  /** Whether a life list is currently loaded (so the UI can prompt for upload). */
  hasLifeList: boolean;
  limits: typeof LIMITS;
  defaults: typeof DEFAULTS;
  /** eBird taxonomy version string the server is using, if known. */
  taxonomyVersion: string | null;
}

// ---- Life-list summary returned after CSV upload (or on reload). ----
export interface CountyCount {
  county: string;
  count: number;
}

export interface LifeListSummary {
  /** Distinct species-level codes resolved from the CSV — the actual "seen" set size. */
  speciesCount: number;
  /** Total observation rows parsed (the CSV is one row per sighting, not per species). */
  rowCount: number;
  /** Rows we couldn't resolve to a species code (bad/blank/unknown sci+common name). */
  unmatchedRowCount: number;
  /** A few example unmatched names, for a gentle warning in the UI. */
  unmatchedSamples: string[];
  /** Rows dropped because they were spuh/slash/hybrid (non-species categories). */
  nonSpeciesRowCount: number;
  earliestDate: string | null;
  latestDate: string | null;
  topCounties: CountyCount[];
}

// ---- A single gap: a species reported nearby that you haven't logged. ----
export interface GapObservation {
  locId: string;
  locName: string;
  lat: number;
  lng: number;
  obsDt: string;
  howMany: number | null;
}

export interface GapSpecies {
  speciesCode: string;
  comName: string;
  sciName: string;
  /** ISO-ish datetime of the most recent nearby report (from eBird). */
  lastObsDt: string;
  /** How many distinct recent reports (checklists) contributed to this gap. */
  reportCount: number;
  /** The closest reporting location to the search point. */
  nearestLocName: string;
  nearestLat: number;
  nearestLng: number;
  /** Distance in km from the search point to the nearest report. */
  nearestKm: number;
  /** True if this came from the notable/rarities feed. */
  notable: boolean;
  /** All recent observations of this species (for plotting every marker). */
  observations: GapObservation[];
  /** Link out to the eBird species page. */
  ebirdUrl: string;
}

export interface GapQuery {
  lat: number;
  lng: number;
  distKm: number;
  backDays: number;
  source: GapSource;
  scope: Scope;
}

export interface GapsResponse {
  /** Whether a life list is loaded. If false, `gaps` is empty and the UI prompts upload. */
  hasLifeList: boolean;
  /** Echo of the (clamped) query actually used. */
  query: GapQuery;
  /** Total species reported nearby before subtracting the life list. */
  nearbySpeciesCount: number;
  /** The gaps themselves, sorted by the server (most recent / most reports first). */
  gaps: GapSpecies[];
  /** Whether these results were served from cache. */
  cached: boolean;
}

export interface ApiError {
  error: string;
}
