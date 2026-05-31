import { describe, it, expect } from 'vitest';
import { rankHotspots } from './plan.js';
import type { GapSpecies, GapObservation } from '@gap/shared';
import type { RawHotspot } from '../ebird/client.js';

const origin = { lat: 40.7, lng: -74.0 };

function hotspot(p: Partial<RawHotspot> & Pick<RawHotspot, 'locId'>): RawHotspot {
  return { locName: `Hotspot ${p.locId}`, lat: 40.71, lng: -74.0, ...p };
}

function ob(p: Partial<GapObservation> & Pick<GapObservation, 'locId'>): GapObservation {
  return { locName: 'Somewhere', lat: 40.71, lng: -74.0, obsDt: '2026-05-20 08:00', howMany: 1, ...p };
}

function gap(speciesCode: string, observations: GapObservation[], p: Partial<GapSpecies> = {}): GapSpecies {
  const last = observations.reduce((m, o) => (o.obsDt > m ? o.obsDt : m), '');
  return {
    speciesCode,
    comName: speciesCode,
    sciName: `Genus ${speciesCode}`,
    lastObsDt: last,
    reportCount: observations.length,
    nearestLocName: observations[0]?.locName ?? '',
    nearestLat: observations[0]?.lat ?? 0,
    nearestLng: observations[0]?.lng ?? 0,
    nearestKm: 1,
    notable: false,
    observations,
    ebirdUrl: `https://ebird.org/species/${speciesCode}`,
    ...p,
  };
}

describe('rankHotspots', () => {
  it('attributes a gap sighting to its hotspot by locId', () => {
    const gaps = [gap('mallar3', [ob({ locId: 'L1' })])];
    const { hotspots, unattributedSpeciesCount } = rankHotspots(gaps, [hotspot({ locId: 'L1' })], origin);
    expect(unattributedSpeciesCount).toBe(0);
    expect(hotspots).toHaveLength(1);
    expect(hotspots[0]!.unseenCount).toBe(1);
    expect(hotspots[0]!.species[0]!.speciesCode).toBe('mallar3');
    expect(hotspots[0]!.ebirdUrl).toBe('https://ebird.org/hotspot/L1');
  });

  it('dedupes a species reported twice at the same hotspot, keeping the most-recent date', () => {
    const gaps = [
      gap('mallar3', [
        ob({ locId: 'L1', obsDt: '2026-05-18 07:00' }),
        ob({ locId: 'L1', obsDt: '2026-05-22 07:00' }),
      ]),
    ];
    const { hotspots } = rankHotspots(gaps, [hotspot({ locId: 'L1' })], origin);
    expect(hotspots[0]!.unseenCount).toBe(1);
    expect(hotspots[0]!.species[0]!.lastObsDt).toBe('2026-05-22 07:00');
  });

  it('ranks hotspots by distinct unseen species, most first', () => {
    const gaps = [
      gap('a', [ob({ locId: 'L1' })]),
      gap('b', [ob({ locId: 'L1' })]),
      gap('c', [ob({ locId: 'L2' })]),
    ];
    const { hotspots } = rankHotspots(
      gaps,
      [hotspot({ locId: 'L1' }), hotspot({ locId: 'L2' })],
      origin,
    );
    expect(hotspots.map((h) => h.locId)).toEqual(['L1', 'L2']);
    expect(hotspots[0]!.unseenCount).toBe(2);
  });

  it('breaks ties by most-recent sighting, then distance, then name', () => {
    // Both hotspots have one species; L_recent has the newer sighting.
    const gaps = [
      gap('a', [ob({ locId: 'Lold', obsDt: '2026-05-10 07:00' })]),
      gap('b', [ob({ locId: 'Lrecent', obsDt: '2026-05-28 07:00' })]),
    ];
    const { hotspots } = rankHotspots(
      gaps,
      [hotspot({ locId: 'Lold' }), hotspot({ locId: 'Lrecent' })],
      origin,
    );
    expect(hotspots.map((h) => h.locId)).toEqual(['Lrecent', 'Lold']);
  });

  it('drops hotspots with zero unseen species', () => {
    const gaps = [gap('a', [ob({ locId: 'L1' })])];
    const { hotspots } = rankHotspots(
      gaps,
      [hotspot({ locId: 'L1' }), hotspot({ locId: 'L2' })],
      origin,
    );
    expect(hotspots.map((h) => h.locId)).toEqual(['L1']);
  });

  it('counts a species at every hotspot it was reported at', () => {
    const gaps = [gap('a', [ob({ locId: 'L1' }), ob({ locId: 'L2' })])];
    const { hotspots, unattributedSpeciesCount } = rankHotspots(
      gaps,
      [hotspot({ locId: 'L1' }), hotspot({ locId: 'L2' })],
      origin,
    );
    expect(unattributedSpeciesCount).toBe(0);
    expect(hotspots).toHaveLength(2);
    expect(hotspots.every((h) => h.unseenCount === 1)).toBe(true);
  });

  it('counts species at non-hotspot locations as unattributed', () => {
    const gaps = [
      gap('a', [ob({ locId: 'L1' })]), // hotspot
      gap('b', [ob({ locId: 'Lpersonal' })]), // not in hotspot set
    ];
    const { hotspots, unattributedSpeciesCount } = rankHotspots(gaps, [hotspot({ locId: 'L1' })], origin);
    expect(hotspots).toHaveLength(1);
    expect(unattributedSpeciesCount).toBe(1);
  });

  it('rounds hotspot distance to one decimal', () => {
    const gaps = [gap('a', [ob({ locId: 'L1' })])];
    const { hotspots } = rankHotspots(gaps, [hotspot({ locId: 'L1', lat: 41.2, lng: -74.0 })], origin);
    const km = hotspots[0]!.distanceKm;
    expect(km).toBeGreaterThan(0);
    expect(Math.round(km * 10) / 10).toBe(km);
  });

  it('returns nothing for empty gaps or empty hotspots', () => {
    expect(rankHotspots([], [hotspot({ locId: 'L1' })], origin).hotspots).toHaveLength(0);
    const r = rankHotspots([gap('a', [ob({ locId: 'L1' })])], [], origin);
    expect(r.hotspots).toHaveLength(0);
    expect(r.unattributedSpeciesCount).toBe(1);
  });

  it('is deterministic for fully-tied hotspots (sorts by name)', () => {
    const gaps = [
      gap('a', [ob({ locId: 'Lb', obsDt: '2026-05-20 07:00' })]),
      gap('b', [ob({ locId: 'La', obsDt: '2026-05-20 07:00' })]),
    ];
    const { hotspots } = rankHotspots(
      gaps,
      [hotspot({ locId: 'Lb', locName: 'Beta', lat: 40.71, lng: -74 }), hotspot({ locId: 'La', locName: 'Alpha', lat: 40.71, lng: -74 })],
      origin,
    );
    expect(hotspots.map((h) => h.locName)).toEqual(['Alpha', 'Beta']);
  });
});
