import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import type { ParsedLifeList } from '../csv/parse.js';

/**
 * Single-user life-list store. Holds at most one parsed life list (there is one
 * user — whoever runs the tool). Behind an interface so persistence is swappable;
 * never multi-tenant.
 */
export interface LifeListStore {
  get(): ParsedLifeList | null;
  set(list: ParsedLifeList): void;
  clear(): void;
}

class MemoryStore implements LifeListStore {
  private current: ParsedLifeList | null = null;
  get() {
    return this.current;
  }
  set(list: ParsedLifeList) {
    this.current = list;
  }
  clear() {
    this.current = null;
  }
}

// ---- JSON serialization (Sets aren't JSON-native) ----

interface SerializedLifeList {
  species: string[];
  byYear: [number, string[]][];
  byCounty: [string, string[]][];
  summary: ParsedLifeList['summary'];
}

function serialize(list: ParsedLifeList): SerializedLifeList {
  return {
    species: [...list.species],
    byYear: [...list.byYear].map(([y, s]) => [y, [...s]]),
    byCounty: [...list.byCounty].map(([c, s]) => [c, [...s]]),
    summary: list.summary,
  };
}

function deserialize(s: SerializedLifeList): ParsedLifeList {
  return {
    species: new Set(s.species),
    byYear: new Map(s.byYear.map(([y, arr]) => [y, new Set(arr)])),
    byCounty: new Map(s.byCounty.map(([c, arr]) => [c, new Set(arr)])),
    summary: s.summary,
  };
}

/** Persists the life list to ./data/lifelist.json so it survives restarts. */
class JsonStore implements LifeListStore {
  private current: ParsedLifeList | null = null;
  private readonly file = path.join(config.dataDir, 'lifelist.json');

  constructor() {
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      this.current = deserialize(JSON.parse(raw) as SerializedLifeList);
    } catch {
      this.current = null; // no file yet, or unreadable — start empty
    }
  }

  get() {
    return this.current;
  }

  set(list: ParsedLifeList) {
    this.current = list;
    try {
      fs.mkdirSync(config.dataDir, { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(serialize(list)));
    } catch (err) {
      console.warn('Could not persist life list:', (err as Error).message);
    }
  }

  clear() {
    this.current = null;
    try {
      fs.rmSync(this.file, { force: true });
    } catch {
      /* ignore */
    }
  }
}

export function createStore(): LifeListStore {
  return config.storageBackend === 'json' ? new JsonStore() : new MemoryStore();
}
