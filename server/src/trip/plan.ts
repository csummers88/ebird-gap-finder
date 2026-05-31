import type { GapSpecies, RankedHotspot, RankedHotspotSpecies } from '@gap/shared';
import type { RawHotspot } from '../ebird/client.js';
import { haversineKm } from '../gaps/compute.js';

export interface TripPlanResult {
  hotspots: RankedHotspot[];
  /** Unseen species whose most-recent report didn't land on a known nearby hotspot. */
  unattributedSpeciesCount: number;
}

/**
 * Attribute each gap sighting to the hotspot it was reported at, then rank
 * hotspots by how many distinct unseen species you could pick up there.
 *
 * Attribution reuses the observations already fetched for the gap view (no
 * extra eBird calls): every GapObservation carries a `locId`, which is the
 * join key to a hotspot's `locId`. The eBird nearby feed returns only the
 * single most-recent report per species, so a species is placed only at the
 * hotspot where it was last reported; species whose last report was at a
 * personal location (or a hotspot outside the radius) match nothing and are
 * counted in `unattributedSpeciesCount` rather than silently dropped.
 */
export function rankHotspots(
  gaps: GapSpecies[],
  hotspots: RawHotspot[],
  origin: { lat: number; lng: number },
): TripPlanResult {
  const byLocId = new Map<string, RawHotspot>();
  for (const h of hotspots) byLocId.set(h.locId, h);

  // hotspot locId -> (speciesCode -> its most-recent attributed report)
  const attributed = new Map<string, Map<string, RankedHotspotSpecies>>();
  let unattributedSpeciesCount = 0;

  for (const gap of gaps) {
    let placed = false;
    for (const obs of gap.observations) {
      if (!byLocId.has(obs.locId)) continue;
      placed = true;

      let species = attributed.get(obs.locId);
      if (!species) attributed.set(obs.locId, (species = new Map()));

      const existing = species.get(gap.speciesCode);
      // Dedupe per species per hotspot, keeping the most-recent report date.
      if (!existing || obs.obsDt > existing.lastObsDt) {
        species.set(gap.speciesCode, {
          speciesCode: gap.speciesCode,
          comName: gap.comName,
          sciName: gap.sciName,
          lastObsDt: obs.obsDt,
          ebirdUrl: gap.ebirdUrl,
        });
      }
    }
    if (!placed) unattributedSpeciesCount += 1;
  }

  const ranked: RankedHotspot[] = [];
  for (const [locId, species] of attributed) {
    const h = byLocId.get(locId)!;
    const speciesList = [...species.values()].sort((a, b) =>
      a.lastObsDt < b.lastObsDt ? 1 : a.lastObsDt > b.lastObsDt ? -1 : 0,
    );
    ranked.push({
      locId,
      locName: h.locName,
      lat: h.lat,
      lng: h.lng,
      distanceKm: Math.round(haversineKm(origin.lat, origin.lng, h.lat, h.lng) * 10) / 10,
      unseenCount: speciesList.length,
      species: speciesList,
      ebirdUrl: `https://ebird.org/hotspot/${locId}`,
    });
  }

  // Most unseen species first; ties broken by most-recent sighting, then nearer,
  // then name (deterministic).
  ranked.sort((a, b) => {
    if (a.unseenCount !== b.unseenCount) return b.unseenCount - a.unseenCount;
    const aRecent = a.species[0]?.lastObsDt ?? '';
    const bRecent = b.species[0]?.lastObsDt ?? '';
    if (aRecent !== bRecent) return aRecent < bRecent ? 1 : -1;
    if (a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm;
    return a.locName < b.locName ? -1 : a.locName > b.locName ? 1 : 0;
  });

  return { hotspots: ranked, unattributedSpeciesCount };
}
