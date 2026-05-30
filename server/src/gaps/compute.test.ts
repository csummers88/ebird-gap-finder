import { describe, it, expect } from 'vitest';
import { computeGaps, haversineKm, seenSet } from './compute.js';
import { buildIndex } from '../species/taxonomy.js';
import type { RawTaxon, RawObservation } from '../ebird/client.js';
import type { ParsedLifeList } from '../csv/parse.js';

const TAXA: RawTaxon[] = [
  { speciesCode: 'norcar', sciName: 'Cardinalis cardinalis', comName: 'Northern Cardinal', category: 'species', taxonOrder: 1 },
  { speciesCode: 'daejun', sciName: 'Junco hyemalis', comName: 'Dark-eyed Junco', category: 'species', taxonOrder: 2 },
  { speciesCode: 'daejun1', sciName: 'Junco hyemalis hyemalis', comName: 'Dark-eyed Junco (Slate-colored)', category: 'issf', taxonOrder: 3, reportAs: 'daejun' },
  { speciesCode: 'mallar3', sciName: 'Anas platyrhynchos', comName: 'Mallard', category: 'species', taxonOrder: 4 },
  { speciesCode: 'gullsp', sciName: 'Larus sp.', comName: 'gull sp.', category: 'spuh', taxonOrder: 5 },
];
const idx = buildIndex(TAXA);

function obs(p: Partial<RawObservation> & Pick<RawObservation, 'speciesCode'>): RawObservation {
  return {
    comName: 'x', sciName: 'x', locId: 'L1', locName: 'Somewhere',
    obsDt: '2026-05-20 08:00', lat: 40.7, lng: -74.0, ...p,
  };
}

describe('haversineKm', () => {
  it('is ~0 for the same point and positive otherwise', () => {
    expect(haversineKm(40.7, -74, 40.7, -74)).toBeCloseTo(0, 5);
    expect(haversineKm(40.7, -74, 40.8, -74)).toBeGreaterThan(10);
  });
});

describe('computeGaps', () => {
  const origin = { lat: 40.7, lng: -74.0 };

  it('returns species reported nearby that are not in the seen set', () => {
    const seen = new Set(['norcar']); // already seen the cardinal
    const observations = [
      obs({ speciesCode: 'norcar' }),
      obs({ speciesCode: 'mallar3' }),
      obs({ speciesCode: 'daejun' }),
    ];
    const { gaps, nearbySpeciesCount } = computeGaps(observations, seen, idx, origin, false);
    expect(nearbySpeciesCount).toBe(3);
    expect(gaps.map((g) => g.speciesCode).sort()).toEqual(['daejun', 'mallar3']);
  });

  it('collapses an issf observation onto its parent species before diffing', () => {
    const seen = new Set(['daejun']); // junco is on the life list
    // Reported at the slate-colored subspecies level — must still count as seen.
    const { gaps } = computeGaps([obs({ speciesCode: 'daejun1' })], seen, idx, origin, false);
    expect(gaps).toHaveLength(0);
  });

  it('drops spuh/slash/hybrid observations entirely', () => {
    const seen = new Set<string>();
    const { gaps, nearbySpeciesCount } = computeGaps([obs({ speciesCode: 'gullsp' })], seen, idx, origin, false);
    expect(nearbySpeciesCount).toBe(0);
    expect(gaps).toHaveLength(0);
  });

  it('aggregates reports: count, most-recent date, and nearest location', () => {
    const seen = new Set<string>();
    const observations = [
      obs({ speciesCode: 'mallar3', obsDt: '2026-05-18 07:00', lat: 41.2, lng: -74.0, locName: 'Far Pond' }),
      obs({ speciesCode: 'mallar3', obsDt: '2026-05-22 07:00', lat: 40.71, lng: -74.0, locName: 'Near Marsh' }),
    ];
    const { gaps } = computeGaps(observations, seen, idx, origin, false);
    expect(gaps).toHaveLength(1);
    const g = gaps[0]!;
    expect(g.reportCount).toBe(2);
    expect(g.lastObsDt).toBe('2026-05-22 07:00');
    expect(g.nearestLocName).toBe('Near Marsh');
    expect(g.comName).toBe('Mallard'); // display name from taxonomy, not the obs stub
    expect(g.ebirdUrl).toBe('https://ebird.org/species/mallar3');
  });

  it('sorts most-recent first', () => {
    const seen = new Set<string>();
    const observations = [
      obs({ speciesCode: 'norcar', obsDt: '2026-05-10 07:00' }),
      obs({ speciesCode: 'mallar3', obsDt: '2026-05-28 07:00' }),
    ];
    const { gaps } = computeGaps(observations, seen, idx, origin, false);
    expect(gaps.map((g) => g.speciesCode)).toEqual(['mallar3', 'norcar']);
  });
});

describe('seenSet (scope)', () => {
  const list: ParsedLifeList = {
    species: new Set(['norcar', 'mallar3', 'daejun']),
    byYear: new Map([
      [2026, new Set(['norcar'])],
      [2025, new Set(['mallar3', 'daejun'])],
    ]),
    byCounty: new Map(),
    summary: {} as ParsedLifeList['summary'],
  };

  it('life scope returns the full life list', () => {
    expect([...seenSet(list, 'life', 2026)].sort()).toEqual(['daejun', 'mallar3', 'norcar']);
  });
  it('year scope returns only the current year', () => {
    expect([...seenSet(list, 'year', 2026)]).toEqual(['norcar']);
    expect([...seenSet(list, 'year', 2024)]).toEqual([]); // no observations that year
  });
});
