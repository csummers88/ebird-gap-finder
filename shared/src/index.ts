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

// ---- Lazily-loaded full report set for a single gap (one extra eBird call). ----
// The gap list/map run on eBird's one-most-recent-report-per-species feed; when a
// user pins a gap we fetch all of that species' recent nearby reports and merge
// these fields back onto the GapSpecies. Same shape the cheap path produces.
export interface GapReports {
  speciesCode: string;
  observations: GapObservation[];
  reportCount: number;
  lastObsDt: string;
  nearestLocName: string;
  nearestLat: number;
  nearestLng: number;
  nearestKm: number;
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

// ---- Trip planner: nearby hotspots ranked by how many unseen species you could add. ----
export interface RankedHotspotSpecies {
  speciesCode: string;
  comName: string;
  sciName: string;
  /** ISO-ish datetime of the most recent report of this species at this hotspot. */
  lastObsDt: string;
  ebirdUrl: string;
}

export interface RankedHotspot {
  locId: string;
  locName: string;
  lat: number;
  lng: number;
  /** Distance in km from the search point to the hotspot. */
  distanceKm: number;
  /** Number of distinct unseen species attributed to this hotspot. */
  unseenCount: number;
  /** The unseen species, most-recent first. */
  species: RankedHotspotSpecies[];
  /** Link out to the eBird hotspot page. */
  ebirdUrl: string;
}

export interface TripPlannerResponse {
  /** Whether a life list is loaded. If false, `hotspots` is empty and the UI prompts upload. */
  hasLifeList: boolean;
  /** Echo of the (clamped) query actually used. */
  query: GapQuery;
  /** Nearby hotspots, ranked by distinct unseen species (most first). */
  hotspots: RankedHotspot[];
  /**
   * Unseen species whose most-recent nearby report wasn't at a known hotspot
   * (a personal location, or a hotspot outside the searched radius). The eBird
   * feed gives only the single most-recent report per species, so this is an
   * honest count of what the ranking can't place — surfaced, not hidden.
   */
  unattributedSpeciesCount: number;
  /** Whether the underlying observations were served from cache. */
  cached: boolean;
}

export interface ApiError {
  error: string;
}
