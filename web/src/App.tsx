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

  function setLatLng(newLat: number, newLng: number) {
    setLat(newLat);
    setLng(newLng);
    setSelected(null); // markers will change; drop any pinned callout
  }

  function selectSegment(mode: ViewMode, s: GapSource, sc: Scope) {
    setViewMode(mode);
    setSource(s);
    setScope(sc);
    setSelected(null);
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
          onSelect={setSelected}
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
          onDist={setDistKm}
          onBack={setBackDays}
          onTheme={setThemeChoice}
        />
      )}

      <GapPanel
        viewMode={viewMode}
        gaps={gaps}
        nearbyCount={nearbyCount}
        backDays={backDays}
        loading={loading}
        hasLifeList={hasLifeList}
        segment={viewMode === 'planner' ? 'planner' : segmentOf(source, scope)}
        highlighted={highlighted}
        selected={selected}
        hotspots={plan}
        unattributed={unattributed}
        highlightedHotspot={highlightedHotspot}
        onSelectSegment={selectSegment}
        onHighlight={setHighlighted}
        onFocus={(g) => setFocusCode(g.speciesCode)}
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
