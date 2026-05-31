import express, { type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import {
  DEFAULTS,
  LIMITS,
  type AppConfig,
  type GapSource,
  type GapReports,
  type GapsResponse,
  type Scope,
  type TripPlannerResponse,
} from '@gap/shared';
import { config } from './config.js';
import {
  clampBack,
  clampDist,
  ebird,
  EbirdError,
  type RawHotspot,
  type RawObservation,
} from './ebird/client.js';
import { getTaxonomy } from './species/taxonomy.js';
import { parseLifeList } from './csv/parse.js';
import { createStore } from './store/index.js';
import { TtlCache } from './gaps/cache.js';
import { computeGaps, haversineKm, seenSet, summarizeObservations } from './gaps/compute.js';
import { rankHotspots } from './trip/plan.js';

const store = createStore();
const obsCache = new TtlCache<RawObservation[]>(config.obsCacheTtlSeconds * 1000);
// Hotspots change rarely; reuse the same TTL as observations.
const hotspotCache = new TtlCache<RawHotspot[]>(config.obsCacheTtlSeconds * 1000);
// All recent reports for a single pinned species; keyed by species + rounded query.
const speciesObsCache = new TtlCache<RawObservation[]>(config.obsCacheTtlSeconds * 1000);

// 80 MB covers a very heavy birder's export with headroom.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 80 * 1024 * 1024 } });

function asNumber(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function roundCoord(n: number): number {
  return Math.round(n * 100) / 100; // ~2dp, matching eBird's own rounding
}

/** Fetch observations for a query, using the TTL cache keyed by rounded params. */
async function fetchObservations(
  source: GapSource,
  lat: number,
  lng: number,
  distKm: number,
  backDays: number,
): Promise<{ obs: RawObservation[]; cached: boolean }> {
  const key = `${source}:${roundCoord(lat)}:${roundCoord(lng)}:${distKm}:${backDays}`;
  const hit = obsCache.get(key);
  if (hit) return { obs: hit, cached: true };

  const obs =
    source === 'notable'
      ? await ebird.notableNearby(lat, lng, distKm, backDays)
      : await ebird.recentNearby(lat, lng, distKm, backDays);
  obsCache.set(key, obs);
  return { obs, cached: false };
}

/** Fetch all recent reports of one species near a point, cached by species + rounded params. */
async function fetchSpeciesObs(
  speciesCode: string,
  lat: number,
  lng: number,
  distKm: number,
  backDays: number,
): Promise<{ obs: RawObservation[]; cached: boolean }> {
  const key = `${speciesCode}:${roundCoord(lat)}:${roundCoord(lng)}:${distKm}:${backDays}`;
  const hit = speciesObsCache.get(key);
  if (hit) return { obs: hit, cached: true };
  const obs = await ebird.nearbyObsOfSpecies(speciesCode, lat, lng, distKm, backDays);
  speciesObsCache.set(key, obs);
  return { obs, cached: false };
}

/** Fetch nearby hotspots for the trip planner, cached by rounded location + radius. */
async function fetchHotspots(lat: number, lng: number, distKm: number): Promise<RawHotspot[]> {
  const key = `${roundCoord(lat)}:${roundCoord(lng)}:${distKm}`;
  const hit = hotspotCache.get(key);
  if (hit) return hit;
  const hotspots = await ebird.hotspotsNearby(lat, lng, distKm);
  hotspotCache.set(key, hotspots);
  return hotspots;
}

export function createApp() {
  const app = express();
  app.use(express.json());

  const api = express.Router();

  // ---- App configuration the frontend needs on load. ----
  api.get('/config', async (_req, res) => {
    let taxonomyVersion: string | null = null;
    // Don't fail config if the taxonomy/key isn't ready; the UI degrades gracefully.
    const body: AppConfig = {
      defaultLat: config.defaultLat,
      defaultLng: config.defaultLng,
      hasLifeList: store.get() !== null,
      limits: LIMITS,
      defaults: DEFAULTS,
      taxonomyVersion,
    };
    res.json(body);
  });

  // ---- Life-list summary (or 204 if none loaded). ----
  api.get('/lifelist', (_req, res) => {
    const list = store.get();
    if (!list) return res.status(204).end();
    res.json(list.summary);
  });

  api.delete('/lifelist', (_req, res) => {
    store.clear();
    res.status(204).end();
  });

  // ---- Upload + parse MyEBirdData.csv. ----
  api.post('/lifelist', upload.single('file'), async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No CSV file uploaded (field "file").' });
      const taxonomy = await getTaxonomy();
      const parsed = await parseLifeList(req.file.buffer, taxonomy);
      store.set(parsed);
      res.json(parsed.summary);
    } catch (err) {
      next(err);
    }
  });

  // ---- The gap diff: what's reported nearby that you haven't logged. ----
  api.get('/gaps', async (req, res, next) => {
    try {
      const lat = asNumber(req.query.lat, config.defaultLat);
      const lng = asNumber(req.query.lng, config.defaultLng);
      const distKm = clampDist(asNumber(req.query.distKm, DEFAULTS.DIST_KM));
      const backDays = clampBack(asNumber(req.query.backDays, DEFAULTS.BACK_DAYS));
      const source: GapSource = req.query.source === 'notable' ? 'notable' : 'recent';
      const scope: Scope =
        req.query.scope === 'year' ? 'year' : req.query.scope === 'county' ? 'county' : 'life';

      const list = store.get();
      const query = { lat, lng, distKm, backDays, source, scope };

      if (!list) {
        const empty: GapsResponse = {
          hasLifeList: false,
          query,
          nearbySpeciesCount: 0,
          gaps: [],
          cached: false,
        };
        return res.json(empty);
      }

      const taxonomy = await getTaxonomy();
      const { obs, cached } = await fetchObservations(source, lat, lng, distKm, backDays);
      const currentYear = new Date().getFullYear();
      const seen = seenSet(list, scope, currentYear);
      const { gaps, nearbySpeciesCount } = computeGaps(
        obs,
        seen,
        taxonomy,
        { lat, lng },
        source === 'notable',
      );

      const body: GapsResponse = {
        hasLifeList: true,
        query,
        nearbySpeciesCount,
        gaps,
        cached,
      };
      res.json(body);
    } catch (err) {
      next(err);
    }
  });

  // ---- All recent reports for one pinned species (one lazy eBird call per gap). ----
  api.get('/gaps/:speciesCode/reports', async (req, res, next) => {
    try {
      // eBird species codes are lowercase-alphanumeric (e.g. "amerob", "rethaw1").
      const speciesCode = String(req.params.speciesCode);
      if (!/^[a-z0-9]{4,12}$/.test(speciesCode)) {
        return res.status(400).json({ error: 'Invalid species code.' });
      }
      const lat = asNumber(req.query.lat, config.defaultLat);
      const lng = asNumber(req.query.lng, config.defaultLng);
      const distKm = clampDist(asNumber(req.query.distKm, DEFAULTS.DIST_KM));
      const backDays = clampBack(asNumber(req.query.backDays, DEFAULTS.BACK_DAYS));
      const origin = { lat, lng };

      const { obs } = await fetchSpeciesObs(speciesCode, lat, lng, distKm, backDays);
      // The nearest-obs feed sorts by distance but isn't strictly bounded by `dist`;
      // clamp to the searched radius so reports never fall outside the map circle.
      const inRadius = obs.filter((o) => haversineKm(lat, lng, o.lat, o.lng) <= distKm);

      // No reports in range is a normal state (the cheap feed's single report may sit
      // just outside, or it's since aged out) — return an empty set, not an error.
      const body: GapReports = inRadius.length
        ? { speciesCode, ...summarizeObservations(inRadius, origin) }
        : {
            speciesCode,
            observations: [],
            reportCount: 0,
            lastObsDt: '',
            nearestLocName: '',
            nearestLat: lat,
            nearestLng: lng,
            nearestKm: 0,
          };
      res.json(body);
    } catch (err) {
      next(err);
    }
  });

  // ---- Trip planner: nearby hotspots ranked by how many unseen species you could add. ----
  api.get('/trip-planner', async (req, res, next) => {
    try {
      const lat = asNumber(req.query.lat, config.defaultLat);
      const lng = asNumber(req.query.lng, config.defaultLng);
      const distKm = clampDist(asNumber(req.query.distKm, DEFAULTS.DIST_KM));
      const backDays = clampBack(asNumber(req.query.backDays, DEFAULTS.BACK_DAYS));
      const scope: Scope =
        req.query.scope === 'year' ? 'year' : req.query.scope === 'county' ? 'county' : 'life';
      // The planner ranks regular nearby species; force `recent` so it shares the
      // observation cache with the gap view (and never the sparse rarities feed).
      const source: GapSource = 'recent';
      const query = { lat, lng, distKm, backDays, source, scope };

      const list = store.get();
      if (!list) {
        const empty: TripPlannerResponse = {
          hasLifeList: false,
          query,
          hotspots: [],
          unattributedSpeciesCount: 0,
          cached: false,
        };
        return res.json(empty);
      }

      const taxonomy = await getTaxonomy();
      const [{ obs, cached }, hotspots] = await Promise.all([
        fetchObservations(source, lat, lng, distKm, backDays),
        fetchHotspots(lat, lng, distKm),
      ]);
      const currentYear = new Date().getFullYear();
      const seen = seenSet(list, scope, currentYear);
      const { gaps } = computeGaps(obs, seen, taxonomy, { lat, lng }, false);
      const { hotspots: ranked, unattributedSpeciesCount } = rankHotspots(gaps, hotspots, { lat, lng });

      if (unattributedSpeciesCount > 0) {
        // Honest note: the eBird feed gives one most-recent report per species, so
        // some gaps can't be placed at a nearby hotspot. Surfaced, not hidden.
        console.info(
          `trip-planner: ${ranked.length} hotspots ranked, ${unattributedSpeciesCount} unseen species not at a nearby hotspot`,
        );
      }

      const body: TripPlannerResponse = {
        hasLifeList: true,
        query,
        hotspots: ranked,
        unattributedSpeciesCount,
        cached,
      };
      res.json(body);
    } catch (err) {
      next(err);
    }
  });

  app.use('/api', api);

  // ---- Serve the built frontend in production (single-port "clone and run"). ----
  // In dev, Vite serves the frontend and proxies /api here, so this is a no-op.
  const webDist = new URL('../../web/dist', import.meta.url).pathname;
  app.use(express.static(webDist));
  app.get(/^(?!\/api).*/, (_req, res, next) => {
    res.sendFile('index.html', { root: webDist }, (err) => {
      if (err) next();
    });
  });

  // ---- Error handler: friendly messages, correct status for eBird/key issues. ----
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof EbirdError) {
      return res.status(err.status).json({ error: err.message });
    }
    const message = err instanceof Error ? err.message : 'Unexpected server error';
    console.error('Request failed:', message);
    res.status(500).json({ error: message });
  });

  return app;
}
