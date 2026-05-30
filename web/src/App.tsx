import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULTS, type AppConfig, type GapSource, type GapSpecies, type LifeListSummary, type Scope } from '@gap/shared';
import * as api from './api.js';
import { useDebounced } from './hooks.js';
import { ControlBar } from './components/ControlBar.js';
import { GapList } from './components/GapList.js';
import { GapMap } from './components/GapMap.js';
import { LifeListPanel } from './components/LifeListPanel.js';

export function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [summary, setSummary] = useState<LifeListSummary | null>(null);
  const [uploading, setUploading] = useState(false);

  const [lat, setLat] = useState(0);
  const [lng, setLng] = useState(0);
  const [distKm, setDistKm] = useState<number>(DEFAULTS.DIST_KM);
  const [backDays, setBackDays] = useState<number>(DEFAULTS.BACK_DAYS);
  const [source, setSource] = useState<GapSource>('recent');
  const [scope, setScope] = useState<Scope>('life');

  const [gaps, setGaps] = useState<GapSpecies[]>([]);
  const [nearbyCount, setNearbyCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasLifeList, setHasLifeList] = useState(false);

  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [focusCode, setFocusCode] = useState<string | null>(null);

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

  useEffect(() => {
    loadGaps();
  }, [loadGaps]);

  async function handleUpload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const s = await api.uploadLifeList(file);
      setSummary(s);
      setHasLifeList(true);
      loadGaps();
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
  }

  function setLatLng(newLat: number, newLng: number) {
    setLat(newLat);
    setLng(newLng);
  }

  return (
    <div className="app">
      <header className="header">
        <div className="title">
          <h1>eBird Gap Finder</h1>
          <p className="subtitle">Species reported near you that aren’t on your list yet.</p>
        </div>
        <LifeListPanel summary={summary} uploading={uploading} onUpload={handleUpload} onClear={handleClear} />
      </header>

      {config && (
        <ControlBar
          config={config}
          lat={lat}
          lng={lng}
          distKm={distKm}
          backDays={backDays}
          source={source}
          scope={scope}
          onLatLng={setLatLng}
          onDist={setDistKm}
          onBack={setBackDays}
          onSource={setSource}
          onScope={setScope}
        />
      )}

      {error && <div className="error">⚠ {error}</div>}

      <main className="split">
        <section className="list-pane">
          <div className="list-header">
            <span>
              {loading
                ? 'Finding gaps…'
                : hasLifeList
                  ? `${gaps.length} ${gaps.length === 1 ? 'gap' : 'gaps'} · ${nearbyCount} species reported nearby`
                  : 'Upload your life list to see gaps'}
            </span>
          </div>

          {!hasLifeList && !loading && (
            <div className="empty">
              <p>Once your life list is loaded, the species being reported nearby that you haven’t
              logged will show up here.</p>
            </div>
          )}

          {hasLifeList && !loading && gaps.length === 0 && (
            <div className="empty">
              <p>No new species reported nearby in this window.</p>
              <p className="hint">
                That’s normal close to home — try a larger radius, a longer lookback, or switch the
                baseline to “This year”.
              </p>
            </div>
          )}

          <GapList
            gaps={gaps}
            highlighted={highlighted}
            onHighlight={setHighlighted}
            onFocus={(g) => setFocusCode(g.speciesCode)}
          />
        </section>

        <section className="map-pane">
          {config && (
            <GapMap
              lat={lat}
              lng={lng}
              distKm={distKm}
              gaps={gaps}
              highlighted={highlighted}
              onHighlight={setHighlighted}
              onPickLocation={setLatLng}
              focusCode={focusCode}
            />
          )}
        </section>
      </main>

      <footer className="footer">
        <span className="hint">
          Coordinates from eBird are rounded (~1&nbsp;km), so markers are approximate. Be kind to the
          API — this uses your own key.
        </span>
      </footer>
    </div>
  );
}
