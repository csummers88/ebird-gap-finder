import { describe, it, expect } from 'vitest';
import { parseLifeList } from './parse.js';
import { buildIndex } from '../species/taxonomy.js';
import type { RawTaxon } from '../ebird/client.js';

const TAXA: RawTaxon[] = [
  { speciesCode: 'norcar', sciName: 'Cardinalis cardinalis', comName: 'Northern Cardinal', category: 'species', taxonOrder: 1 },
  { speciesCode: 'daejun', sciName: 'Junco hyemalis', comName: 'Dark-eyed Junco', category: 'species', taxonOrder: 2 },
  { speciesCode: 'daejun1', sciName: 'Junco hyemalis hyemalis', comName: 'Dark-eyed Junco (Slate-colored)', category: 'issf', taxonOrder: 3, reportAs: 'daejun' },
  { speciesCode: 'gullsp', sciName: 'Larus sp.', comName: 'gull sp.', category: 'spuh', taxonOrder: 4 },
];
const idx = buildIndex(TAXA);

const CSV = `Submission ID,Common Name,Scientific Name,Taxonomic Order,Count,State/Province,County,Location,Latitude,Longitude,Date,Time
S1,Northern Cardinal,Cardinalis cardinalis,1,2,US-NY,New York,Backyard,40.78,-73.97,2024-01-15,08:00
S2,"Dark-eyed Junco (Slate-colored)",Junco hyemalis hyemalis,3,4,US-NY,New York,Park,40.79,-73.96,2025-02-20,09:00
S3,Northern Cardinal,Cardinalis cardinalis,1,1,US-NY,Kings,Lake,40.66,-73.97,2026-03-01,07:30
S4,gull sp.,Larus sp.,4,10,US-NY,New York,Lake,40.70,-73.95,2026-03-02,07:30
S5,Mystery Bird,Unknownus latinus,99,1,US-NY,New York,Yard,40.70,-73.95,2026-03-03,07:30`;

describe('parseLifeList', () => {
  it('builds a species-code set, collapsing subspecies and dropping non-species + unknown rows', async () => {
    const result = await parseLifeList(Buffer.from(CSV), idx);

    // norcar (x2 rows -> 1 species) + daejun (from the slate-colored issf row)
    expect([...result.species].sort()).toEqual(['daejun', 'norcar']);
    expect(result.summary.speciesCount).toBe(2);
    expect(result.summary.rowCount).toBe(5);
    expect(result.summary.nonSpeciesRowCount).toBe(1); // the gull sp.
    expect(result.summary.unmatchedRowCount).toBe(1); // the mystery bird
    expect(result.summary.unmatchedSamples).toContain('Mystery Bird');

    expect(result.summary.earliestDate).toBe('2024-01-15');
    // Latest date comes from resolved-species rows only; the gull (non-species) and
    // mystery (unmatched) rows on 03-02/03-03 don't contribute to the range.
    expect(result.summary.latestDate).toBe('2026-03-01');

    // per-year derivation for the year scope
    expect([...(result.byYear.get(2026) ?? [])]).toEqual(['norcar']);
    expect([...(result.byYear.get(2025) ?? [])]).toEqual(['daejun']);

    // top counties counts matched/non-species rows attributed to a county
    const newYork = result.summary.topCounties.find((c) => c.county.startsWith('New York'));
    expect(newYork?.count).toBe(2); // cardinal + junco (gull/mystery don't resolve to species, not counted)
  });
});
