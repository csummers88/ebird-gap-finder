# 🐦 eBird Gap Finder

Upload your personal eBird life list, then see **which species are being reported near you
right now that you haven't logged yet** — as a ranked list and on a map.

It's a **self-hosted, bring-your-own-key, single-user** tool. You run it on your own machine
with *your own* free eBird API key and *your own* eBird data export. It is intentionally **not**
a hosted multi-user service.

---

## How it works

eBird's API can tell you what *other people* are reporting near a point, but it has **no
endpoint for your own life list**. So this tool does a **set difference**:

```
gaps = (species reported nearby, recently)  −  (species in your eBird export)
```

- **What you've seen** comes from your `MyEBirdData.csv` export (parsed locally).
- **What's around** comes from the live eBird API using your key.
- Matching is done on eBird **species codes**, not names — subspecies/groups collapse to their
  parent species, and `sp.`/`slash`/`hybrid` entries are dropped — so gap counts are accurate.

---

## Prior art

The "what haven't I seen near here" idea isn't new — tools like
[liferradar](https://liferradar.com) and the [`lifeR`](https://cran.r-project.org/package=lifeR) R
package work this territory from different angles (a hosted map, scripted analysis). This is a
deliberately narrow, open alternative: **self-hosted, bring-your-own-key, no account**, built
around your own life-list export rather than a hosted account or a stats workflow. The goal is
owning your data and "clone, paste key, run" — not out-featuring those tools.

---

## Quick start (≈2 minutes)

You need **Node.js 20+**.

**1. Get a free eBird API key** (requires an eBird account):
https://ebird.org/api/keygen

**2. Export your eBird data:** go to eBird → **Download My Data**
(https://ebird.org/downloadMyData). You'll get an email with a zip; inside is
`MyEBirdData.csv`. (You upload this in the app — no need to put it in the repo.)

**3. Clone, configure, run:**

```bash
git clone <this-repo> ebird-gap-finder
cd ebird-gap-finder
npm install

cp .env.example .env
# open .env and paste your key into EBIRD_API_TOKEN=

npm run build      # builds the frontend
npm start          # serves the app on http://localhost:3000
```

Open **http://localhost:3000**, drag in your `MyEBirdData.csv`, and your gaps appear.

> The first request fetches the full eBird taxonomy (a few MB) and caches it on disk under
> `.cache/`, so it only happens once.

### Development mode

Runs the API and the Vite dev server with hot reload (frontend on `:5173`, proxying `/api` to
the backend on `:3000`):

```bash
npm run dev
```

### Try it without your own data

A small example export lives at `sample-data/MyEBirdData.sample.csv`. Upload it (you still need
a valid key, since "what's around" is live) to see the flow.

---

## Using the app

- **Location** — type a lat/lng, click **📍 Use my location**, or **click anywhere on the map**
  to drop a search point.
- **Radius** (≤ 50 km) and **Lookback** (≤ 30 days) sliders define the search window. They're
  debounced, so dragging them doesn't hammer the API.
- **Source** — *All recent* (everything reported nearby) or *Rarities only* (the eBird
  notable-observations feed — the "drop everything and chase it" view).
- **Baseline** — diff against your full **Life list** or just **This year** (a year list turns
  up far more gaps).
- The **list and map are two views of the same gaps**: hover a row to highlight its markers and
  vice-versa; click a row to fly the map to the nearest report. Each gap links to its eBird
  species page. A colored bar hints at how gettable a bird looks (recent + many reports = hot).

An **empty list is normal** near home — try a bigger radius, a longer lookback, or the
"This year" baseline.

---

## Configuration (`.env`)

| Variable | Default | Meaning |
| --- | --- | --- |
| `EBIRD_API_TOKEN` | *(required)* | Your free eBird key. Stays server-side; never shipped to the browser or committed. |
| `DEFAULT_LAT` / `DEFAULT_LNG` | Central Park, NYC | Starting map location (editable in the UI). |
| `PORT` | `3000` | Server port (also serves the built frontend). |
| `STORAGE_BACKEND` | `memory` | `memory` (life list lost on restart) or `json` (persisted to `./data/lifelist.json`). |
| `CACHE_DIR` | `.cache` | Where the taxonomy cache is stored. |
| `OBS_CACHE_TTL_SECONDS` | `300` | How long nearby-observation responses are cached. |

---

## Architecture

A thin **Express + TypeScript** backend and a **React + TypeScript (Vite)** frontend, sharing
types from `shared/`.

- `shared/` — request/response types used by both sides (the API contract).
- `server/` — eBird client, taxonomy cache + species-code matching, CSV ingest, the gap diff,
  and a small gap-oriented API. Holds your key; the frontend never talks to eBird directly.
- `web/` — upload, control bar, synced gap list + Leaflet map (OpenStreetMap tiles, no map key).

The backend owns the taxonomy and the species-matching logic so the frontend stays
presentational. Although eBird *does* permit direct browser calls, keeping a backend lets us
parse large CSVs server-side, cache the taxonomy, and centralize the diff.

### API endpoints (internal)

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/config` | Default location, limits, whether a life list is loaded. |
| `POST` | `/api/lifelist` | Upload + parse `MyEBirdData.csv` (multipart `file`). |
| `GET` | `/api/lifelist` | Current life-list summary (`204` if none). |
| `DELETE` | `/api/lifelist` | Clear the stored life list. |
| `GET` | `/api/gaps` | The gap diff for `lat,lng,distKm,backDays,source,scope`. |

---

## Privacy & being a good API citizen

- Your `MyEBirdData.csv` is parsed locally and held in memory (or in a local file if you turn on
  `STORAGE_BACKEND=json`). **It is never sent anywhere but this app on your machine.**
- Your key is used only to call eBird, server-side. It's never bundled into the frontend or
  committed (`.env` is gitignored).
- The app caches the taxonomy and debounces/caches observation requests to keep call volume low.
  **Use one key for your own self-hosted instance — don't route other people through it.**

---

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Backend + Vite dev server with hot reload. |
| `npm run build` | Build the frontend for production. |
| `npm start` | Run the server (serves the built frontend) on `PORT`. |
| `npm test` | Run the species-matching / gap / CSV unit tests. |
| `npm run typecheck` | Type-check both server and web. |

---

## Status

The **MVP is complete**: CSV upload + summary, location/radius/lookback controls, the gap list,
and a synced Leaflet map. A **rarities-only** source toggle and a **This year** baseline are also
wired up. Remaining stretch items: a hotspot trip-planner ranking, a county baseline, and richer
persistence.

## License

[MIT](LICENSE).

> Not affiliated with or endorsed by eBird / the Cornell Lab of Ornithology. You supply your own
> eBird account, key, and data.
