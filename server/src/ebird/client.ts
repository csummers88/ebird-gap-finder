import { LIMITS } from '@gap/shared';
import { config } from '../config.js';

const BASE = 'https://api.ebird.org/v2';

/** A raw observation as returned by the eBird obs endpoints. */
export interface RawObservation {
  speciesCode: string;
  comName: string;
  sciName: string;
  locId: string;
  locName: string;
  obsDt: string;
  howMany?: number;
  lat: number;
  lng: number;
  obsValid?: boolean;
  obsReviewed?: boolean;
}

/** A raw taxonomy entry from /ref/taxonomy/ebird?fmt=json. */
export interface RawTaxon {
  sciName: string;
  comName: string;
  speciesCode: string;
  category: string;
  taxonOrder: number;
  /** For issf/form/etc.: the species-level code this should be reported as. */
  reportAs?: string;
  familyComName?: string;
  familySciName?: string;
}

export interface RawHotspot {
  locId: string;
  locName: string;
  lat: number;
  lng: number;
  countryCode?: string;
  subnational1Code?: string;
  numSpeciesAllTime?: number;
}

export function clampDist(distKm: number): number {
  if (!Number.isFinite(distKm)) return LIMITS.MIN_DIST_KM;
  return Math.min(LIMITS.MAX_DIST_KM, Math.max(LIMITS.MIN_DIST_KM, Math.round(distKm)));
}

export function clampBack(backDays: number): number {
  if (!Number.isFinite(backDays)) return LIMITS.MIN_BACK_DAYS;
  return Math.min(LIMITS.MAX_BACK_DAYS, Math.max(LIMITS.MIN_BACK_DAYS, Math.round(backDays)));
}

export class EbirdError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'EbirdError';
  }
}

async function get<T>(path: string, params: Record<string, string | number | boolean>): Promise<T> {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  let res: Response;
  try {
    res = await fetch(url, { headers: { 'x-ebirdapitoken': config.ebirdToken } });
  } catch (err) {
    throw new EbirdError(`Could not reach the eBird API: ${(err as Error).message}`, 502);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const hint =
      res.status === 403
        ? ' (check that EBIRD_API_TOKEN is valid)'
        : '';
    throw new EbirdError(
      `eBird API returned ${res.status}${hint}: ${body.slice(0, 200)}`,
      res.status === 403 ? 502 : 502,
    );
  }
  return (await res.json()) as T;
}

export const ebird = {
  /** Full eBird taxonomy (species codes, sci/common names, category, reportAs). Large. */
  async taxonomy(): Promise<RawTaxon[]> {
    return get<RawTaxon[]>('/ref/taxonomy/ebird', { fmt: 'json' });
  },

  /** Most recent sighting of each species within `dist` km of a point, in the last `back` days. */
  async recentNearby(lat: number, lng: number, distKm: number, backDays: number): Promise<RawObservation[]> {
    return get<RawObservation[]>('/data/obs/geo/recent', {
      lat,
      lng,
      dist: clampDist(distKm),
      back: clampBack(backDays),
    });
  },

  /** Notable / rare / out-of-range sightings near a point. `detail=full` gives coords + locName. */
  async notableNearby(lat: number, lng: number, distKm: number, backDays: number): Promise<RawObservation[]> {
    return get<RawObservation[]>('/data/obs/geo/recent/notable', {
      lat,
      lng,
      dist: clampDist(distKm),
      back: clampBack(backDays),
      detail: 'full',
    });
  },

  /**
   * All recent nearby reports of a single species (nearest first), within `dist` km
   * over the last `back` days. Unlike `recentNearby` (one most-recent report per
   * species), this returns a report per reporting location — the data behind a
   * pinned gap's full sighting history. One call per species, so fetch lazily.
   */
  async nearbyObsOfSpecies(
    speciesCode: string,
    lat: number,
    lng: number,
    distKm: number,
    backDays: number,
  ): Promise<RawObservation[]> {
    return get<RawObservation[]>(`/data/nearest/geo/recent/${speciesCode}`, {
      lat,
      lng,
      dist: clampDist(distKm),
      back: clampBack(backDays),
      // Plenty for a single species in a ≤50 km radius; bounds the payload.
      maxResults: 200,
    });
  },

  /** Hotspots near a point (for the trip planner). CSV by default — request JSON. */
  async hotspotsNearby(lat: number, lng: number, distKm: number): Promise<RawHotspot[]> {
    return get<RawHotspot[]>('/ref/hotspot/geo', {
      lat,
      lng,
      dist: clampDist(distKm),
      fmt: 'json',
    });
  },
};
