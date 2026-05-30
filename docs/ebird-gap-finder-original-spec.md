# eBird Gap Finder — Project Spec

A personal birding tool: upload your eBird life list, then see which species are being
reported **near you right now that you haven't logged yet** — surfaced as a ranked list and
plotted on a map, with a "where should I go this weekend" hotspot view.

**Distribution model: self-hosted, bring-your-own-key, open source.** This is built to be
released publicly and run by each user on their own machine (or their own box) with *their
own* free eBird API key and *their own* life-list export. It is explicitly **not** a
multi-tenant hosted service, and it must not be designed to become one by default: a single
shared API key serving many strangers would hit rate problems and run against the spirit of
eBird's personal-key terms. Single-user assumptions are therefore intended features, not
limitations. Optimize for a clean build and a frictionless "clone and run," not for scale.

**Prior art / alternatives.** The "what haven't I seen near here" idea isn't new — tools like
[liferradar](https://liferradar.com) and the [`lifeR`](https://cran.r-project.org/package=lifeR) R
package work this territory from different angles (a hosted map, scripted analysis). This project
is a deliberate, narrowly-scoped open alternative: self-hosted, bring-your-own-key, no account,
and built around your own life-list export rather than a hosted account or a stats workflow. The
point is owning your data and "clone, paste key, run" — not out-featuring those tools.

---

## 1. The core idea and the one constraint that shapes everything

The concept is a **set difference**:

- **What you've seen** = the set of species in your personal eBird history.
- **What's around** = species other people are reporting near a location, recently.
- **Gaps** = (what's around) − (what you've seen).

The critical constraint: **the eBird API 2.0 does not expose a user's personal life list or
personal observations.** The API key is account-tied but only grants access to *public,
recent, and summary* data (regional/nearby observations, notable sightings, hotspots,
taxonomy). There is no "give me user X's life list" endpoint.

Therefore the life list must come from the user's own data export:

- The user goes to **My eBird → Download My Data**, receives an email, and gets a zip
  containing a file named `MyEBirdData.csv`.
- The app ingests that CSV to build the "seen" set.
- Everything else (the "around" set) comes from the live API.

This split (static uploaded history + live API) is the backbone of the whole app. Build
around it.

---

## 2. Tech stack

Use the standard stack:

- **Backend:** Node.js + Express, TypeScript. Acts as a thin proxy/aggregator in front of
  the eBird API (keeps the API key out of the shipped frontend, sidesteps browser CORS, and
  centralizes caching + the gap algorithm). **Open decision — verify before building:** the
  thin backend exists largely to dodge browser CORS. If the eBird API actually returns
  permissive CORS headers for browser requests, a BYO-key build could collapse to a
  pure-client app (key entered in the UI, stored locally, browser calls eBird directly),
  which is the simplest possible thing to open-source. Confirm eBird's CORS behavior first;
  if it doesn't allow browser calls, keep the thin backend (or wrap the whole thing as a
  local Electron app so it still runs as standalone software). Do not assume a multi-tenant
  server design either way.
- **Frontend:** React + TypeScript, scaffolded with **Vite** (no SEO concern — it's a
  personal tool, so no Next.js needed).
- **Map:** Leaflet via `react-leaflet`, with free OpenStreetMap tiles. No map API key
  required, which keeps weekend friction low.
- **Storage:** keep it low-friction so an OSS adopter can run the tool without standing up a
  database. Build the data layer behind an interface and start with an in-memory store
  (single session). For persistence (so the CSV isn't re-uploaded every time, plus caching
  the taxonomy and recent API responses), default to a **local embedded store — SQLite or a
  local JSON file** — so "clone and run" needs no external services. Postgres is fine as an
  optional, configurable backend for anyone who wants it, but it must not be a prerequisite
  for trying the tool. (This intentionally leans lighter than the usual Postgres-first
  default, because adoption friction matters for a public OSS release.)
- **Dev OS:** macOS.

---

## 3. eBird API reference (everything needed to integrate)

Base URL: `https://api.ebird.org/v2`

**Auth:** every request needs the header `x-ebirdapitoken: <KEY>`. The key is free from
`https://ebird.org/api/keygen` (requires an eBird account). Keep it server-side only.

**Response format:** JSON by default.

**Endpoints this app uses** (all GET):

- **Recent nearby observations** — `/data/obs/geo/recent` — most recent sighting of each
  species within a radius of a lat/lng. This is the primary "what's around" source.
  Key query params: `lat`, `lng`, `dist` (km, max 50, default 25), `back` (days, max 30,
  default 14), `maxResults`, `hotspot` (bool), `cat` (taxonomic category filter),
  `includeProvisional`.
- **Notable nearby observations** — `/data/obs/geo/recent/notable` — only rare /
  out-of-range / locally notable sightings near a point. Use `detail=full` so each record
  includes lat/lng and a readable location name (the `simple` detail level omits some of
  this). Same geo params as above. This powers a "rarities only" toggle.
- **Recent observations in a region** — `/data/obs/{regionCode}/recent` — same idea but
  scoped to a region code (e.g. a US county like `US-NY-061`) instead of a radius. Useful
  for a "my county" scope. Region codes are eBird's own hierarchical codes.
- **Hotspots near a point** — `/ref/hotspot/geo` — returns hotspots (with locIds and
  coords) near a lat/lng. Used by the trip-planner view. Returns CSV by default; request
  JSON via `fmt=json`.
- **eBird taxonomy** — `/ref/taxonomy/ebird` — the full species taxonomy with
  `speciesCode`, `comName`, `sciName`, `category`, and family info. Large and changes
  rarely; fetch once and cache. Used to normalize/collapse subspecies to species level when
  matching (see the algorithm section). Request JSON via `fmt=json`.

**Notes / gotchas:**

- Geo endpoints round coordinates to ~2 decimal places — don't expect pinpoint precision on
  returned observation coords.
- `back` caps at 30 days. The UI shouldn't let the user request more.
- Be polite about request volume. There's no published hard rate limit, but cache
  aggressively and avoid hammering on every keystroke (debounce the location/radius inputs).
- An observation record includes (at least): `speciesCode`, `comName`, `sciName`,
  `locName`, `locId`, `obsDt` (observation datetime), `howMany`, `lat`, `lng`, and
  `obsValid` / `obsReviewed` flags.

---

## 4. The eBird CSV export (the life-list source)

The user uploads `MyEBirdData.csv`. It's one row per observation (not per species), so the
same species appears many times. Relevant columns (names as eBird exports them):

- `Common Name`
- `Scientific Name`
- `Taxonomic Order`
- `Count`
- `State/Province`
- `County`
- `Location`
- `Latitude`, `Longitude`
- `Date`
- `Submission ID`

The export does **not** include eBird's `speciesCode`, so species matching against the API
has to go through scientific name (preferred) or common name (fallback) — see the algorithm.

Tell Claude Code to be defensive: this is real-world user data. Expect tens of thousands of
rows for an active birder, occasional encoding quirks, and subspecies/hybrid/"sp." rows.
Stream-parse rather than loading naively if needed, and warn (don't crash) on malformed
rows.

---

## 5. Species matching — the subtle part, get this right

A naive string match on common name will undercount gaps and produce false "new" species.
The issues:

- The CSV contains **subspecies and group-level rows** (e.g. a junco reported at the
  "Slate-colored" group level), while the API may report the same bird at species level (or
  vice-versa). These should collapse to the same species for life-list purposes.
- The CSV/API contain non-species **categories**: `spuh` (e.g. "gull sp."), `slash`
  ("Greater/Lesser Scaup"), `hybrid`, and `issf` (identifiable subspecies group). For a
  "have I seen this species" question, only true `species` (and arguably `issf` collapsed up
  to its parent species) should count toward the life list, and only `species` should count
  as a gap candidate.

Approach to specify:

1. Load the eBird taxonomy once and build a lookup keyed by normalized scientific name →
   `{ speciesCode, parentSpeciesCode/reportAs, category, comName }`.
2. For each CSV row, normalize the scientific name, look it up, and resolve to the
   **species-level** `speciesCode` (collapse subspecies/issf to their parent species; drop
   spuh/slash/hybrid). The resulting set of species codes is the **life list**.
3. For each API observation, take its `speciesCode`, resolve to species level the same way.
4. **Gap = observed species codes not in the life-list set.** Doing the diff on
   species codes (not names) is what makes it robust.
5. Keep common names around only for display.

Flag normalization details (trim, case, diacritics, collapse whitespace) as something to
handle so scientific-name matches don't silently miss.

---

## 6. Features

### MVP (target: Saturday)

- **Upload life list:** drag-drop `MyEBirdData.csv`, parse, show a summary (total species,
  date range, top counties).
- **Location + scope controls:** default to a configurable home location (set via
  `DEFAULT_LAT`/`DEFAULT_LNG` and editable in the UI), with controls for radius (`dist`) and
  lookback (`back`). Optionally use the
  browser geolocation API to set the point. Also allow picking a point by clicking the map.
- **Gap list:** call recent-nearby observations, compute gaps, show the unseen species with:
  common name, how recently it was reported, how many recent reports, nearest reporting
  location, and a link out to the eBird species page.
- **Map view:** plot recent gap sightings as markers; clicking a marker shows the species
  and the checklist/location. The map and the list are two views of the same gap set.

### Stretch (Sunday, in rough priority order)

- **Rarities-only toggle:** switch the source to the notable-observations endpoint so the
  list shows only locally rare gaps — the "drop everything and chase it" view.
- **Hotspot trip planner:** pull nearby hotspots, attribute each gap sighting to its
  hotspot/location, then rank hotspots by *number of distinct unseen species* recently
  reported there. Output: "go to Hotspot X to potentially add N new birds," with the species
  list per hotspot. This is the highest-value stretch feature and the thing that makes it
  feel like a real planning tool rather than a list.
- **Scope switching:** toggle the "seen" baseline between life list / current-year list /
  county list (the CSV has dates and counties, so all three are derivable). A year-list
  scope makes far more species show up as gaps and is fun in a way the life list isn't.
- **Persistence:** save the parsed life list and saved locations (in the local embedded
  store) so the CSV upload is a one-time thing; cache taxonomy and recent API responses with
  a short TTL.
- **Recency / abundance cues:** sort or color gaps by how easy they look to get (reported
  today vs. once two weeks ago; many reports vs. a single one).

---

## 7. Backend shape

Express + TypeScript. Responsibilities:

- Hold the eBird API key (env var) and proxy all eBird calls; the frontend never sees the
  key and never talks to eBird directly.
- Own the taxonomy cache and the species-normalization logic.
- Accept the CSV upload, parse it, build the life-list species-code set, and either hold it
  in memory (MVP) or persist it (stretch).
- Expose a small internal API to the frontend, roughly: upload life list; get/set the
  active location + scope; get computed gaps for the current location/scope (recent or
  notable); get the hotspot trip-planner ranking. Keep these endpoints framed around the
  *gap* concept, not as a thin pass-through of raw eBird endpoints — the backend's job is to
  do the diff and the ranking so the frontend stays dumb.
- Cache eBird responses keyed by the query (rounded lat/lng + dist + back + source) with a
  short TTL to avoid redundant calls while the user fiddles with controls.

Describe the request/response shapes for these internal endpoints in TypeScript types so the
frontend and backend share them. (No need to write the handler bodies in this spec — the
shapes plus the algorithm above are enough for implementation.)

---

## 8. Frontend shape

React + TypeScript + Vite. Roughly one main screen with:

- An upload zone / life-list summary header.
- A control bar: location (text + "use my location" + click-on-map), radius slider, lookback
  slider, source toggle (recent vs. rarities-only), scope toggle (life/year/county) for the
  stretch.
- A split layout: gap **list** on one side, **Leaflet map** on the other, kept in sync
  (hovering a list row highlights its map marker and vice-versa).
- A trip-planner panel (stretch) listing ranked hotspots with their unseen-species counts.

Debounce the control inputs before triggering backend calls. Show a clear empty state ("no
new species reported nearby in this window — try a bigger radius or longer lookback") since a
seasoned birder near home may legitimately have few or no gaps in a small radius.

---

## 9. Configuration and packaging (OSS release)

Because this ships for others to self-host, onboarding has to be obvious. Provide:

- A committed **`.env.example`** documenting every variable, and a **README** that walks a
  new user through: get a free eBird key at `https://ebird.org/api/keygen`; export their data
  via My eBird → Download My Data; drop the key in `.env`; one command to run.
- A single run command for local use (and, if kept, a dev-proxy so Vite can reach the API in
  dev). Aim for "clone, paste key, run" in under a couple of minutes.
- An OSS **LICENSE** (MIT is the natural fit for a tool like this; the choice is the author's
  but the repo should have one).
- A clear README note that the user supplies **their own** eBird key and data, and that the
  project is not meant to be deployed as a shared public service on one key.

Environment variables (if the backend is kept):

- `EBIRD_API_TOKEN` — the user's own eBird API key.
- `DEFAULT_LAT`, `DEFAULT_LNG` — home location default.
- `STORAGE_BACKEND` / connection settings — selects the embedded store (default) vs. an
  optional Postgres; persistence stays off-by-default-friendly.
- Standard `PORT`.

(If the CORS check allows a pure-client build instead, the key is entered in the UI and
stored locally rather than via `.env`, and most of the above collapses — but still ship the
README onboarding and the LICENSE.)

---

## 10. Edge cases and gotchas to handle

- Large CSV (tens of thousands of rows) — parse efficiently, show progress, don't block the
  UI thread on the client if parsing client-side (prefer parsing server-side on upload).
- Subspecies / spuh / slash / hybrid rows — handle per the matching algorithm; don't let
  them inflate the life list or appear as gaps.
- `back` > 30 or `dist` > 50 — clamp in the UI and on the backend.
- Sparse results near home — the empty state matters; this isn't an error.
- API hiccups / rate friendliness — cache, debounce, and fail gracefully with a retry.
- Scientific-name normalization mismatches — the main source of silent wrongness; make the
  normalization explicit and consistent on both the CSV and API sides.
- Coordinates are rounded by the geo endpoints — fine for this use, just don't imply
  pinpoint accuracy in the UI copy.

---

## 11. Suggested build order

1. Backend skeleton + eBird proxy for recent-nearby observations; confirm a raw call works
   with the key.
2. Taxonomy fetch + cache + the scientific-name → species-code lookup.
3. CSV upload + parse → in-memory life-list species-code set, with a summary response.
4. Gap computation endpoint (recent source) → verify the diff against a known location.
5. Frontend: upload + control bar + gap list wired to the backend.
6. Add the Leaflet map view synced to the list. **This is a complete, satisfying MVP.**
7. Stretch: rarities toggle → hotspot trip planner → scope switching → local persistence.

---

## 12. Out of scope

- **Multi-tenant hosting / running a public shared-key service.** This is the deliberate
  architectural line: the project is self-hosted, one key per user. Don't add auth, user
  accounts, or per-user data isolation in service of a hosted instance.
- Authentication of any kind (there's one user — whoever is running it).
- Writing data back to eBird or submitting checklists.
- A native mobile app (web only; responsive enough for phone use in the field via browser).
- Production deployment hardening (it runs locally / self-hosted, not as a public service).