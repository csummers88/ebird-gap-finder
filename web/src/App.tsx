import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULTS, type AppConfig, type GapSource, type GapSpecies, type LifeListSummary, type RankedHotspot, type Scope } from '@gap/shared';
import * as api from './api.js';
import { useDebounced, useTheme } from './hooks.js';
import { isToday } from './gapDisplay.js';
import { TopBar } from './components/TopBar.js';
import { GapMap } from './components/GapMap.js';
import { GapPanel, segmentOf, type ViewMode } from './components/GapPanel.js';
import { LifeListChip } from './components/LifeListChip.js';
import { UploadOverlay } from './components/UploadOverlay.js';

export function App() {
  const { choice: themeChoice, mode, setChoice: setThemeChoice } = useTheme();

  const [config, setConfig] = useState<AppConfig | null>(null);
  const [summary, setSummary] = useState<LifeListSummary | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);

  const [lat, setLat] = useState(0);
  const [lng, setLng] = useState(0);
  const [distKm, setDistKm] = useState<number>(DEFAULTS.DIST_KM);
  const [backDays, setBackDays] = useState<number>(DEFAULTS.BACK_DAYS);
  const [source, setSource] = useState<GapSource>('recent');
  const [scope, setScope] = useState<Scope>('life');
  const [viewMode, setViewMode] = useState<ViewMode>('gaps');

  const [gaps, setGaps] = useState<GapSpecies[]>([]);
  const [nearbyCount, setNearbyCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasLifeList, setHasLifeList] = useState(false);

  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [focusCode, setFocusCode] = useState<string | null>(null);
  // The pinned species whose full report set is currently being fetched.
  const [enriching, setEnriching] = useState<string | null>(null);
  // In the species-detail view: the hovered location, and a fly-to target (the
  // nonce lets clicking the same location re-fly the map).
  const [highlightedLoc, setHighlightedLoc] = useState<string | null>(null);
  const [focusLoc, setFocusLoc] = useState<{ lat: number; lng: number; n: number } | null>(null);

  // Trip planner
  const [plan, setPlan] = useState<RankedHotspot[]>([]);
  const [unattributed, setUnattributed] = useState(0);
  const [highlightedHotspot, setHighlightedHotspot] = useState<string | null>(null);
  const [focusHotspot, setFocusHotspot] = useState<string | null>(null);

  // ---- Initial load: config + any persisted life list. ----
  useEffect(() => {
    (async () => {
      try {
        const cfg = await api.getConfig();
        setConfig(cfg);
        setLat(cfg.defaultLat);
        setLng(cfg.defaultLng);
        setHasLifeList(cfg.hasLifeList);
        if (cfg.hasLifeList) setSummary(await api.getLifeList());
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, []);

  // Debounce the location + sliders so dragging doesn't fire a request per frame.
  const dLat = useDebounced(lat, 400);
  const dLng = useDebounced(lng, 400);
  const dDist = useDebounced(distKm, 400);
  const dBack = useDebounced(backDays, 400);

  const abortRef = useRef<AbortController | null>(null);
  // Species whose full report set we've already lazily loaded for the current gap
  // query — reset whenever the gaps reload, so a new location/radius refetches.
  const enrichedRef = useRef<Set<string>>(new Set());
  const reportsAbortRef = useRef<AbortController | null>(null);

  const loadGaps = useCallback(() => {
    if (!config) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setError(null);
    api
      .getGaps({ lat: dLat, lng: dLng, distKm: dDist, backDays: dBack, source, scope }, ctrl.signal)
      .then((res) => {
        setHasLifeList(res.hasLifeList);
        setGaps(res.gaps);
        setNearbyCount(res.nearbySpeciesCount);
        enrichedRef.current = new Set(); // fresh feed → re-enrich on demand
      })
      .catch((e) => {
        if ((e as Error).name !== 'AbortError') setError((e as Error).message);
      })
      .finally(() => setLoading(false));
  }, [config, dLat, dLng, dDist, dBack, source, scope]);

  const loadPlan = useCallback(() => {
    if (!config) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setError(null);
    api
      .getTripPlan({ lat: dLat, lng: dLng, distKm: dDist, backDays: dBack, source: 'recent', scope }, ctrl.signal)
      .then((res) => {
        setHasLifeList(res.hasLifeList);
        setPlan(res.hotspots);
        setUnattributed(res.unattributedSpeciesCount);
      })
      .catch((e) => {
        if ((e as Error).name !== 'AbortError') setError((e as Error).message);
      })
      .finally(() => setLoading(false));
  }, [config, dLat, dLng, dDist, dBack, scope]);

  useEffect(() => {
    if (viewMode === 'planner') loadPlan();
    else loadGaps();
  }, [viewMode, loadGaps, loadPlan]);

  // Pinning a gap lazily fetches all of that species' recent reports (one eBird
  // call, server-cached) and merges them onto the gap — so the cheap one-report
  // feed becomes the full sighting history only for gaps the user actually opens.
  useEffect(() => {
    if (viewMode !== 'gaps' || !selected) return;
    const code = selected;
    if (enrichedRef.current.has(code)) return;

    reportsAbortRef.current?.abort();
    const ctrl = new AbortController();
    reportsAbortRef.current = ctrl;
    setEnriching(code);
    api
      .getGapReports(code, { lat: dLat, lng: dLng, distKm: dDist, backDays: dBack, source, scope }, ctrl.signal)
      .then((r) => {
        enrichedRef.current.add(code);
        // Empty result → keep the cheap single report rather than blanking the marker.
        if (r.observations.length === 0) return;
        setGaps((prev) =>
          prev.map((g) =>
            g.speciesCode === code
              ? {
                  ...g,
                  observations: r.observations,
                  reportCount: r.reportCount,
                  lastObsDt: r.lastObsDt,
                  nearestLocName: r.nearestLocName,
                  nearestLat: r.nearestLat,
                  nearestLng: r.nearestLng,
                  nearestKm: r.nearestKm,
                }
              : g,
          ),
        );
      })
      .catch((e) => {
        // Keep the cheap data on failure; an unreachable extra call shouldn't break the pin.
        if ((e as Error).name !== 'AbortError') console.warn('Could not load full reports:', (e as Error).message);
      })
      .finally(() => setEnriching((c) => (c === code ? null : c)));
  }, [selected, viewMode, dLat, dLng, dDist, dBack, source, scope]);

  async function handleUpload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const s = await api.uploadLifeList(file);
      setSummary(s);
      setHasLifeList(true);
      setShowUpload(false);
      if (viewMode === 'planner') loadPlan();
      else loadGaps();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function handleClear() {
    await api.clearLifeList();
    setSummary(null);
    setHasLifeList(false);
    setGaps([]);
    setNearbyCount(0);
    setPlan([]);
    setUnattributed(0);
    setShowUpload(false);
  }

  // Drop the pinned species + its detail view (markers/locations are about to change).
  const clearSelection = useCallback(() => {
    setSelected(null);
    setHighlightedLoc(null);
  }, []);

  function setLatLng(newLat: number, newLng: number) {
    setLat(newLat);
    setLng(newLng);
    clearSelection();
  }

  // The radius/lookback sliders change the marker set (and the per-query report
  // cache), so drop any pinned species — same as a location change does.
  function changeDist(d: number) {
    setDistKm(d);
    clearSelection();
  }
  function changeBack(b: number) {
    setBackDays(b);
    clearSelection();
  }

  function selectSegment(mode: ViewMode, s: GapSource, sc: Scope) {
    setViewMode(mode);
    setSource(s);
    setScope(sc);
    clearSelection();
  }

  // Pin a species (from a list row or map marker): show its detail view and fly
  // to its nearest report. Enrichment of all its locations kicks in via `selected`.
  function selectSpecies(code: string) {
    setSelected(code);
    setHighlightedLoc(null);
    setFocusCode(code);
  }

  function focusLocation(locLat: number, locLng: number) {
    setFocusLoc((prev) => ({ lat: locLat, lng: locLng, n: (prev?.n ?? 0) + 1 }));
  }

  const gapsToday = gaps.filter(isToday).length;
  // First-run (no list) forces the overlay open and non-dismissable.
  const overlayOpen = showUpload || (!!config && !hasLifeList);

  return (
    <div className="app">
      {config && (
        <GapMap
          lat={lat}
          lng={lng}
          distKm={distKm}
          backDays={backDays}
          gaps={gaps}
          mode={mode}
          highlighted={highlighted}
          onHighlight={setHighlighted}
          selected={selected}
          onSelect={(code) => {
            setSelected(code);
            setHighlightedLoc(null);
          }}
          enriching={enriching === selected}
          highlightedLoc={highlightedLoc}
          onHighlightLoc={setHighlightedLoc}
          focusLoc={focusLoc}
          onPickLocation={setLatLng}
          focusCode={focusCode}
          viewMode={viewMode}
          hotspots={plan}
          highlightedHotspot={highlightedHotspot}
          onHighlightHotspot={setHighlightedHotspot}
          focusHotspot={focusHotspot}
        />
      )}

      {config && (
        <TopBar
          config={config}
          lat={lat}
          lng={lng}
          distKm={distKm}
          backDays={backDays}
          themeChoice={themeChoice}
          onLatLng={setLatLng}
          onDist={changeDist}
          onBack={changeBack}
          onTheme={setThemeChoice}
        />
      )}

      <GapPanel
        viewMode={viewMode}
        gaps={gaps}
        nearbyCount={nearbyCount}
        lat={lat}
        lng={lng}
        backDays={backDays}
        loading={loading}
        hasLifeList={hasLifeList}
        segment={viewMode === 'planner' ? 'planner' : segmentOf(source, scope)}
        highlighted={highlighted}
        selected={selected}
        enriching={enriching === selected}
        highlightedLoc={highlightedLoc}
        hotspots={plan}
        unattributed={unattributed}
        highlightedHotspot={highlightedHotspot}
        onSelectSegment={selectSegment}
        onHighlight={setHighlighted}
        onSelect={(g) => selectSpecies(g.speciesCode)}
        onBack={clearSelection}
        onHighlightLoc={setHighlightedLoc}
        onFocusLoc={focusLocation}
        onHighlightHotspot={setHighlightedHotspot}
        onFocusHotspot={(h) => setFocusHotspot(h.locId)}
      />

      <LifeListChip summary={summary} gapsToday={gapsToday} onClick={() => setShowUpload(true)} />

      {error && <div className="toast-error">⚠ {error}</div>}

      {overlayOpen && (
        <UploadOverlay
          summary={summary}
          uploading={uploading}
          dismissable={hasLifeList}
          onUpload={handleUpload}
          onClear={handleClear}
          onClose={() => setShowUpload(false)}
        />
      )}
    </div>
  );
}
