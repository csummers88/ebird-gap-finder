import { parse } from 'csv-parse';
import { Readable } from 'node:stream';
import type { LifeListSummary } from '@gap/shared';
import type { TaxonomyIndex } from '../species/taxonomy.js';

/** The parsed life list: the species-code set plus derivations for stretch scopes. */
export interface ParsedLifeList {
  /** All species-level codes the user has ever logged. The MVP "seen" baseline. */
  species: Set<string>;
  /** species codes seen per calendar year (for the year-list scope, stretch). */
  byYear: Map<number, Set<string>>;
  /** species codes seen per "State/Province|County" key (for county scope, stretch). */
  byCounty: Map<string, Set<string>>;
  summary: LifeListSummary;
}

interface RawRow {
  [key: string]: string;
}

const UNMATCHED_SAMPLE_CAP = 12;

/** Pull a column value defensively — eBird headers are stable but trim just in case. */
function col(row: RawRow, name: string): string {
  const v = row[name];
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * Parse a MyEBirdData.csv buffer/stream into a life list. Streams rather than
 * loading everything as objects up front, and never throws on a bad row — it
 * counts it as unmatched and keeps going.
 */
export function parseLifeList(input: Buffer | Readable, taxonomy: TaxonomyIndex): Promise<ParsedLifeList> {
  const species = new Set<string>();
  const byYear = new Map<number, Set<string>>();
  const byCounty = new Map<string, Set<string>>();
  const countyCounts = new Map<string, number>();
  const unmatchedSamples: string[] = [];

  let rowCount = 0;
  let unmatchedRowCount = 0;
  let nonSpeciesRowCount = 0;
  let earliest: string | null = null;
  let latest: string | null = null;

  const parser = parse({
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    relax_column_count: true,
    trim: true,
    bom: true,
  });

  const source = Buffer.isBuffer(input) ? Readable.from(input) : input;

  return new Promise<ParsedLifeList>((resolve, reject) => {
    parser.on('readable', () => {
      let record: RawRow | null;
      while ((record = parser.read() as RawRow | null) !== null) {
        rowCount++;
        const sci = col(record, 'Scientific Name');
        const com = col(record, 'Common Name');

        const resolved = taxonomy.resolveName(sci, com);
        if (!resolved) {
          unmatchedRowCount++;
          if (unmatchedSamples.length < UNMATCHED_SAMPLE_CAP) {
            const label = com || sci;
            if (label && !unmatchedSamples.includes(label)) unmatchedSamples.push(label);
          }
          continue;
        }
        if (resolved.code === null) {
          // Matched a real taxon, but it's spuh/slash/hybrid — not a species.
          nonSpeciesRowCount++;
          continue;
        }

        const code = resolved.code;
        species.add(code);

        // Date is "YYYY-MM-DD"; track range + per-year set.
        const date = col(record, 'Date');
        if (/^\d{4}-\d{2}-\d{2}/.test(date)) {
          if (!earliest || date < earliest) earliest = date;
          if (!latest || date > latest) latest = date;
          const year = Number(date.slice(0, 4));
          if (Number.isFinite(year)) {
            let set = byYear.get(year);
            if (!set) byYear.set(year, (set = new Set()));
            set.add(code);
          }
        }

        // County rollups for the county scope + the summary's top counties.
        const county = col(record, 'County');
        const state = col(record, 'State/Province');
        if (county) {
          const key = state ? `${county}, ${state}` : county;
          countyCounts.set(key, (countyCounts.get(key) ?? 0) + 1);
          let set = byCounty.get(key);
          if (!set) byCounty.set(key, (set = new Set()));
          set.add(code);
        }
      }
    });

    parser.on('error', (err) => reject(err));

    parser.on('end', () => {
      const topCounties = [...countyCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([county, count]) => ({ county, count }));

      const summary: LifeListSummary = {
        speciesCount: species.size,
        rowCount,
        unmatchedRowCount,
        unmatchedSamples,
        nonSpeciesRowCount,
        earliestDate: earliest,
        latestDate: latest,
        topCounties,
      };
      resolve({ species, byYear, byCounty, summary });
    });

    source.pipe(parser);
  });
}
