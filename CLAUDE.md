# CLAUDE.md — eBird Gap Finder

Repo-root guidance for Claude Code. The full original feature spec lives in
`docs/ebird-gap-finder-original-spec.md`; this file is the durable "how we build here" rules. 
Read both.

## What this project is

A self-hosted, single-user, open-source birding tool. Upload a personal eBird life-list CSV,
diff it against what's being reported nearby via the eBird API, and surface the unseen species
as a list + map + hotspot trip planner.

It's built to be released publicly and run by each user on their own machine with **their own**
free eBird API key and **their own** data export. It is deliberately **not** a multi-tenant
hosted service: no auth, no user accounts, no per-user data isolation. The single-user
assumptions are intended features. Favor a clean build and frictionless "clone and run" over
scale. Do not introduce multi-tenant machinery unless explicitly asked.

## Stack and conventions

- **Backend:** Node.js + Express, TypeScript. Strict mode on.
- **Frontend:** React + TypeScript, Vite. (No Next.js — no SEO need here.)
- **Map:** Leaflet via `react-leaflet`, OpenStreetMap tiles (no map key).
- **Architecture (decided):** we keep the thin Express backend rather than going pure-client
  or Electron. It dodges browser CORS, keeps the user's key out of the shipped bundle, and
  owns the taxonomy/normalization/gap-diff logic so the frontend stays presentational. The
  React/Vite frontend talks only to this local backend. It's still single-user and
  self-hosted — never a shared server.
- **Storage (decided):** the data layer sits behind a `LifeListStore` interface and defaults
  to **in-memory** for zero-friction "clone and run." An optional **local JSON file** backend
  (`STORAGE_BACKEND=json`, persisting to `./data/lifelist.json`) survives restarts. We chose a
  plain JSON file over SQLite to keep the dependency footprint minimal; there is no embedded-DB
  or Postgres backend. (Lighter than the usual Postgres-first default — adoption friction
  matters for OSS.)
- Share request/response types between frontend and backend via a common types module rather
  than redefining shapes on each side.
- Keep dependencies lean. Reach for well-known libraries for CSV parsing and HTTP, not a
  framework-of-the-week.
- Target macOS for local dev.

## The two rules that matter most

**1. Species matching goes through species codes, never raw names.**
A string match on common names will under-count gaps and invent false ones. Always:
resolve every CSV row and every API observation to a species-level eBird `speciesCode` via
the cached taxonomy, collapsing subspecies/`issf` to their parent species and dropping
`spuh`/`slash`/`hybrid` from both the life list and the gap candidates. Do the set
difference on codes. Normalize scientific names consistently (trim, case, diacritics,
whitespace) on both sides. If gap counts ever look wrong, suspect this first.

**2. Be polite to the eBird API.**
The key is the user's own. In a backend build, keep it server-side (out of the shipped
bundle); in a pure-client build, keep it in local storage and never commit or transmit it
anywhere but eBird. Cache the taxonomy (it's large and rarely changes) and cache observation
responses keyed by rounded lat/lng + dist + back + source with a short TTL. Debounce the
location and radius/lookback controls so dragging a slider doesn't fire a request per frame.
Clamp `dist` ≤ 50 km and `back` ≤ 30 days everywhere. No published hard rate limit exists;
behave as if there is one — and never route many users through one key (it's one key per
self-hosted user, by design).

## API quick facts

- Base: `https://api.ebird.org/v2`. Auth header: `x-ebirdapitoken`.
- The API has **no personal-life-list endpoint** — that's the whole reason the app ingests
  the user's `MyEBirdData.csv` export. Don't go looking for a "user observations" API; it
  doesn't exist for this purpose.
- Request `fmt=json` on endpoints that default to CSV (hotspots, taxonomy). Use
  `detail=full` on notable observations to get coords + location names.

## Backend role

The Express layer is not a thin eBird passthrough. It owns the taxonomy + normalization, the
CSV ingest, the gap diff, and the hotspot ranking, and exposes endpoints framed around
*gaps* (and the trip planner) so the frontend stays presentational. Cache and the
species-matching logic live here.

## Data handling

- Treat the uploaded CSV as real-world messy data: tens of thousands of rows, encoding
  quirks, subspecies/hybrid/"sp." entries. Parse server-side, warn on bad rows, never crash.
- Don't log or transmit the CSV anywhere but the local app — it's the user's personal data.
  In-memory for the session, or the local embedded store if persistence is on; never sent to
  any third party or remote service.

## UX guardrails

- An empty gap list is a normal state, not an error — a seasoned local birder may have no new
  species in a small radius. Show a helpful empty state suggesting a larger radius / longer
  lookback, never an error.
- Don't imply pinpoint accuracy for observation coordinates; the geo endpoints round them.

## OSS packaging

This ships for others to self-host, so onboarding must be obvious: a committed `.env.example`
(or in-UI key entry for a client build), a README walking through get-key → export-data →
run, a single run command, and an open LICENSE (MIT is the natural fit). Target "clone, paste
key, run" in a couple of minutes.

## Out of scope

Multi-tenant hosting or any shared-key public service (the deliberate architectural line),
auth/user accounts, writing back to eBird, a native mobile app, deployment hardening. Don't
build these unless explicitly asked.