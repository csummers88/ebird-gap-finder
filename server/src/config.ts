import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The server script runs with cwd = server/, but `.env` lives at the repo root
// (per the README). Load the root .env explicitly so it's found regardless of how
// the process is launched, then also load any .env in the cwd (won't override).
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
loadEnv({ path: path.join(repoRoot, '.env') });
loadEnv();

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  ebirdToken: process.env.EBIRD_API_TOKEN?.trim() ?? '',
  // Neutral, well-known birding default (Central Park, NYC). Override in .env.
  defaultLat: num('DEFAULT_LAT', 40.7829),
  defaultLng: num('DEFAULT_LNG', -73.9654),
  port: num('PORT', 3000),
  storageBackend: (process.env.STORAGE_BACKEND?.trim() || 'memory') as 'memory' | 'json',
  // Anchor cache/data at the repo root (not server/) so they're consistent and
  // match .gitignore regardless of the launch directory. Absolute CACHE_DIR wins.
  cacheDir: path.resolve(repoRoot, process.env.CACHE_DIR?.trim() || '.cache'),
  dataDir: path.resolve(repoRoot, 'data'),
  obsCacheTtlSeconds: num('OBS_CACHE_TTL_SECONDS', 300),
};

export function assertToken(): void {
  if (!config.ebirdToken) {
    throw new Error(
      'EBIRD_API_TOKEN is not set. Copy .env.example to .env and add your free key ' +
        'from https://ebird.org/api/keygen',
    );
  }
}
