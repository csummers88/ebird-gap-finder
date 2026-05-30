import { describe, it, expect } from 'vitest';
import { buildIndex } from './taxonomy.js';
import { normalizeName, binomial } from './normalize.js';
import type { RawTaxon } from '../ebird/client.js';

// A small synthetic taxonomy covering the tricky categories.
const TAXA: RawTaxon[] = [
  { speciesCode: 'norcar', sciName: 'Cardinalis cardinalis', comName: 'Northern Cardinal', category: 'species', taxonOrder: 1 },
  { speciesCode: 'daejun', sciName: 'Junco hyemalis', comName: 'Dark-eyed Junco', category: 'species', taxonOrder: 2 },
  // issf (subspecies group) that should collapse up to Dark-eyed Junco:
  { speciesCode: 'daejun1', sciName: 'Junco hyemalis hyemalis/carolinensis', comName: 'Dark-eyed Junco (Slate-colored)', category: 'issf', taxonOrder: 3, reportAs: 'daejun' },
  { speciesCode: 'mallar3', sciName: 'Anas platyrhynchos', comName: 'Mallard', category: 'species', taxonOrder: 4 },
  // hybrid — must be dropped, never a gap or a life-list entry:
  { speciesCode: 'x00001', sciName: 'Anas platyrhynchos x rubripes', comName: 'Mallard x American Black Duck (hybrid)', category: 'hybrid', taxonOrder: 5 },
  // spuh — must be dropped:
  { speciesCode: 'gullsp', sciName: 'Larus sp.', comName: 'gull sp.', category: 'spuh', taxonOrder: 6 },
  // slash — must be dropped:
  { speciesCode: 'y00001', sciName: 'Aythya marila/affinis', comName: 'Greater/Lesser Scaup', category: 'slash', taxonOrder: 7 },
  // a species with a diacritic in its name, to exercise normalization:
  { speciesCode: 'rorhel', sciName: 'Acrocephalus scirpaceus', comName: 'Reed Warbler', category: 'species', taxonOrder: 8 },
];

const idx = buildIndex(TAXA);

describe('normalizeName / binomial', () => {
  it('strips diacritics, lowercases, collapses whitespace', () => {
    expect(normalizeName('  Júnco   hyemális ')).toBe('junco hyemalis');
  });
  it('reduces subspecies + group annotations to the binomial', () => {
    expect(binomial(normalizeName('Junco hyemalis hyemalis'))).toBe('junco hyemalis');
    expect(binomial(normalizeName('Junco hyemalis [Slate-colored Group]'))).toBe('junco hyemalis');
    expect(binomial(normalizeName('Anas platyrhynchos/rubripes'))).toBe('anas platyrhynchos');
  });
});

describe('resolveName', () => {
  it('matches an exact species scientific name', () => {
    expect(idx.resolveName('Cardinalis cardinalis', 'Northern Cardinal')).toEqual({ code: 'norcar', matched: true });
  });

  it('collapses an issf subspecies group to its parent species', () => {
    // Exact issf name:
    expect(idx.resolveName('Junco hyemalis hyemalis/carolinensis', '')).toEqual({ code: 'daejun', matched: true });
    // A trinomial not in the taxonomy falls back to the binomial -> species:
    expect(idx.resolveName('Junco hyemalis cismontanus', '')).toEqual({ code: 'daejun', matched: true });
  });

  it('drops hybrid / spuh / slash (matched but non-species)', () => {
    expect(idx.resolveName('Anas platyrhynchos x rubripes', 'Mallard x American Black Duck')).toEqual({ code: null, matched: true });
    expect(idx.resolveName('Larus sp.', 'gull sp.')).toEqual({ code: null, matched: true });
    expect(idx.resolveName('Aythya marila/affinis', 'Greater/Lesser Scaup')).toEqual({ code: null, matched: true });
  });

  it('falls back to common name when the scientific name is unknown', () => {
    expect(idx.resolveName('Bogus latinus', 'Northern Cardinal')).toEqual({ code: 'norcar', matched: true });
  });

  it('returns null for a name it cannot resolve at all', () => {
    expect(idx.resolveName('Completely unknown', 'Nonexistent Bird')).toBeNull();
  });

  it('matches despite messy whitespace/diacritics', () => {
    expect(idx.resolveName('  Cardinalis   cardinalis ', '')).toEqual({ code: 'norcar', matched: true });
  });
});

describe('resolveCodeToSpecies (API side)', () => {
  it('keeps species codes as-is', () => {
    expect(idx.resolveCodeToSpecies('mallar3')).toBe('mallar3');
  });
  it('collapses issf codes to the parent species', () => {
    expect(idx.resolveCodeToSpecies('daejun1')).toBe('daejun');
  });
  it('drops hybrid/spuh/slash codes', () => {
    expect(idx.resolveCodeToSpecies('x00001')).toBeNull();
    expect(idx.resolveCodeToSpecies('gullsp')).toBeNull();
    expect(idx.resolveCodeToSpecies('y00001')).toBeNull();
  });
  it('returns null for an unknown code', () => {
    expect(idx.resolveCodeToSpecies('nope')).toBeNull();
  });
});
