import type { GapSpecies, GapObservation, Scope } from '@gap/shared';
import type { RawObservation } from '../ebird/client.js';
import type { TaxonomyIndex } from '../species/taxonomy.js';
import type { ParsedLifeList } from '../csv/parse.js';

/** Great-circle distance in km between two lat/lng points. */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Pick the "seen" baseline for the requested scope.
 *  - life:   every species ever logged (the default)
 *  - year:   species logged in `currentYear`
 *  - county: handled by the caller (needs a county arg); falls back to life here
 */
export function seenSet(list: ParsedLifeList, scope: Scope, currentYear: number): Set<string> {
  if (scope === 'year') return list.byYear.get(currentYear) ?? new Set<string>();
  // 'county' scope is wired up with a county selector in the stretch phase; until
  // then it behaves like the life list.
  return list.species;
}

export interface ComputeResult {
  gaps: GapSpecies[];
  nearbySpeciesCount: number;
}

/**
 * The core diff. Resolve every observation to a species code, group by species,
 * subtract the seen set, and shape each remaining species into a GapSpecies with
 * display + map info. Operates entirely on species codes (CLAUDE.md rule #1).
 */
export function computeGaps(
  observations: RawObservation[],
  seen: Set<string>,
  taxonomy: TaxonomyIndex,
  origin: { lat: number; lng: number },
  notable: boolean,
): ComputeResult {
  // species code -> its observations (only true species survive; spuh/slash/hybrid dropped)
  const grouped = new Map<string, RawObservation[]>();
  for (const obs of observations) {
    const code = taxonomy.resolveCodeToSpecies(obs.speciesCode);
    if (!code) continue;
    let arr = grouped.get(code);
    if (!arr) grouped.set(code, (arr = []));
    arr.push(obs);
  }

  const nearbySpeciesCount = grouped.size;
  const gaps: GapSpecies[] = [];

  for (const [code, obsList] of grouped) {
    if (seen.has(code)) continue; // already on the life list — not a gap

    const info = taxonomy.getSpeciesInfo(code);
    const first = obsList[0]!;

    let nearest = first;
    let nearestKm = haversineKm(origin.lat, origin.lng, first.lat, first.lng);
    let lastObsDt = first.obsDt;

    for (const o of obsList) {
      const km = haversineKm(origin.lat, origin.lng, o.lat, o.lng);
      if (km < nearestKm) {
        nearestKm = km;
        nearest = o;
      }
      if (o.obsDt > lastObsDt) lastObsDt = o.obsDt;
    }

    const observationsOut: GapObservation[] = obsList.map((o) => ({
      locId: o.locId,
      locName: o.locName,
      lat: o.lat,
      lng: o.lng,
      obsDt: o.obsDt,
      howMany: typeof o.howMany === 'number' ? o.howMany : null,
    }));

    gaps.push({
      speciesCode: code,
      comName: info?.comName ?? first.comName,
      sciName: info?.sciName ?? first.sciName,
      lastObsDt,
      reportCount: obsList.length,
      nearestLocName: nearest.locName,
      nearestLat: nearest.lat,
      nearestLng: nearest.lng,
      nearestKm: Math.round(nearestKm * 10) / 10,
      notable,
      observations: observationsOut,
      ebirdUrl: `https://ebird.org/species/${code}`,
    });
  }

  // Most recent first; ties broken by more reports, then nearer.
  gaps.sort((a, b) => {
    if (a.lastObsDt !== b.lastObsDt) return a.lastObsDt < b.lastObsDt ? 1 : -1;
    if (a.reportCount !== b.reportCount) return b.reportCount - a.reportCount;
    return a.nearestKm - b.nearestKm;
  });

  return { gaps, nearbySpeciesCount };
}
