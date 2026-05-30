import express, { type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import {
  DEFAULTS,
  LIMITS,
  type AppConfig,
  type GapSource,
  type GapsResponse,
  type Scope,
} from '@gap/shared';
import { config } from './config.js';
import { clampBack, clampDist, ebird, EbirdError, type RawObservation } from './ebird/client.js';
import { getTaxonomy } from './species/taxonomy.js';
import { parseLifeList } from './csv/parse.js';
import { createStore } from './store/index.js';
import { TtlCache } from './gaps/cache.js';
import { computeGaps, seenSet } from './gaps/compute.js';

const store = createStore();
const obsCache = new TtlCache<RawObservation[]>(config.obsCacheTtlSeconds * 1000);

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
