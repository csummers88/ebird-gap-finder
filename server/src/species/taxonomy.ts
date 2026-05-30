import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { ebird, type RawTaxon } from '../ebird/client.js';
import { binomial, normalizeName } from './normalize.js';

const CACHE_FILE = () => path.join(config.cacheDir, 'taxonomy.json');
// Refetch the taxonomy at most this often. It changes ~annually, so this is generous.
const TAXONOMY_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface SpeciesInfo {
  speciesCode: string;
  comName: string;
  sciName: string;
}

/**
 * The taxonomy index: everything species-matching needs, built once from the raw
 * taxonomy and cached on disk. All lookups resolve to *species-level* codes.
 */
export class TaxonomyIndex {
  /** speciesCode -> the raw taxon (any category). */
  private byCode = new Map<string, RawTaxon>();
  /** normalized full sci name -> speciesCode of that exact taxon. */
  private bySciName = new Map<string, string>();
  /** normalized binomial -> species-level speciesCode (only category === 'species'). */
  private byBinomial = new Map<string, string>();
  /** normalized common name -> species-level speciesCode (fallback only). */
  private byComName = new Map<string, string>();
  /** species-level code -> display info. */
  private speciesInfo = new Map<string, SpeciesInfo>();

  constructor(private readonly taxa: RawTaxon[]) {
    for (const t of taxa) this.byCode.set(t.speciesCode, t);
    for (const t of taxa) {
      const sci = normalizeName(t.sciName);
      // First writer wins for exact sci-name; species entries are listed once.
      if (!this.bySciName.has(sci)) this.bySciName.set(sci, t.speciesCode);

      if (t.category === 'species') {
        const bin = binomial(sci);
        if (!this.byBinomial.has(bin)) this.byBinomial.set(bin, t.speciesCode);
        const com = normalizeName(t.comName);
        if (!this.byComName.has(com)) this.byComName.set(com, t.speciesCode);
        this.speciesInfo.set(t.speciesCode, {
          speciesCode: t.speciesCode,
          comName: t.comName,
          sciName: t.sciName,
        });
      }
    }
  }

  /**
   * Resolve any taxon code to its species-level code by following `reportAs`
   * until we hit a `species` entry. Returns null for spuh/slash/hybrid (and any
   * non-species taxon with no species parent) — those are dropped from both the
   * life list and the gap candidates.
   */
  resolveCodeToSpecies(code: string): string | null {
    let current = this.byCode.get(code);
    const seen = new Set<string>();
    while (current) {
      if (current.category === 'species') return current.speciesCode;
      if (!current.reportAs || seen.has(current.speciesCode)) break;
      seen.add(current.speciesCode);
      current = this.byCode.get(current.reportAs);
    }
    return null;
  }

  /**
   * Resolve a CSV row (scientific name preferred, common name fallback) to a
   * species-level code. Returns:
   *   { code }            — resolved to a species
   *   { code: null, ... } — matched a taxon but it's non-species (spuh/slash/hybrid)
   *   null                — no match at all (truly unknown name)
   */
  resolveName(sciName: string, comName: string): { code: string | null; matched: boolean } | null {
    const sci = normalizeName(sciName ?? '');
    if (sci) {
      const exact = this.bySciName.get(sci);
      if (exact) return { code: this.resolveCodeToSpecies(exact), matched: true };
      const bin = this.byBinomial.get(binomial(sci));
      if (bin) return { code: bin, matched: true };
    }
    const com = normalizeName(comName ?? '');
    if (com) {
      const byCom = this.byComName.get(com);
      if (byCom) return { code: byCom, matched: true };
    }
    return null;
  }

  getSpeciesInfo(code: string): SpeciesInfo | undefined {
    return this.speciesInfo.get(code);
  }

  get speciesCount(): number {
    return this.speciesInfo.size;
  }
}

// ---- Loading + caching ----

interface CachedTaxonomy {
  fetchedAt: number;
  taxa: RawTaxon[];
}

let cachedIndex: TaxonomyIndex | null = null;

function readDiskCache(): CachedTaxonomy | null {
  try {
    const raw = fs.readFileSync(CACHE_FILE(), 'utf8');
    const parsed = JSON.parse(raw) as CachedTaxonomy;
    if (!parsed.taxa?.length) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeDiskCache(taxa: RawTaxon[]): void {
  try {
    fs.mkdirSync(config.cacheDir, { recursive: true });
    const payload: CachedTaxonomy = { fetchedAt: Date.now(), taxa };
    fs.writeFileSync(CACHE_FILE(), JSON.stringify(payload));
  } catch (err) {
    console.warn('Could not write taxonomy cache:', (err as Error).message);
  }
}

/**
 * Get the taxonomy index, building it from (in order): the in-process cache, a
 * fresh-enough disk cache, or a live eBird fetch (which then populates both).
 */
export async function getTaxonomy(forceRefresh = false): Promise<TaxonomyIndex> {
  if (cachedIndex && !forceRefresh) return cachedIndex;

  if (!forceRefresh) {
    const disk = readDiskCache();
    if (disk && Date.now() - disk.fetchedAt < TAXONOMY_TTL_MS) {
      cachedIndex = new TaxonomyIndex(disk.taxa);
      return cachedIndex;
    }
  }

  const taxa = await ebird.taxonomy();
  writeDiskCache(taxa);
  cachedIndex = new TaxonomyIndex(taxa);
  return cachedIndex;
}

/** Test/seam helper: build an index directly from taxa without any I/O. */
export function buildIndex(taxa: RawTaxon[]): TaxonomyIndex {
  return new TaxonomyIndex(taxa);
}
