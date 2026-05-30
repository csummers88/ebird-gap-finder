import type { AppConfig, GapSource, Scope } from '@gap/shared';

interface Props {
  config: AppConfig;
  lat: number;
  lng: number;
  distKm: number;
  backDays: number;
  source: GapSource;
  scope: Scope;
  onLatLng: (lat: number, lng: number) => void;
  onDist: (km: number) => void;
  onBack: (days: number) => void;
  onSource: (s: GapSource) => void;
  onScope: (s: Scope) => void;
}

export function ControlBar(props: Props) {
  const { config, lat, lng, distKm, backDays, source, scope } = props;
  const { limits } = config;

  function useMyLocation() {
    if (!('geolocation' in navigator)) {
      alert('Geolocation is not available in this browser.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => props.onLatLng(round(pos.coords.latitude), round(pos.coords.longitude)),
      (err) => alert(`Could not get your location: ${err.message}`),
    );
  }

  return (
    <div className="controls">
      <div className="control">
        <label>Location</label>
        <div className="latlng">
          <input
            type="number"
            step="0.0001"
            value={lat}
            aria-label="Latitude"
            onChange={(e) => props.onLatLng(Number(e.target.value), lng)}
          />
          <input
            type="number"
            step="0.0001"
            value={lng}
            aria-label="Longitude"
            onChange={(e) => props.onLatLng(lat, Number(e.target.value))}
          />
          <button type="button" onClick={useMyLocation} title="Use my current location">
            📍 Use my location
          </button>
        </div>
        <span className="hint">…or click the map to drop a point.</span>
      </div>

      <div className="control">
        <label>
          Radius: <strong>{distKm} km</strong>
        </label>
        <input
          type="range"
          min={limits.MIN_DIST_KM}
          max={limits.MAX_DIST_KM}
          value={distKm}
          onChange={(e) => props.onDist(Number(e.target.value))}
        />
      </div>

      <div className="control">
        <label>
          Lookback: <strong>{backDays} days</strong>
        </label>
        <input
          type="range"
          min={limits.MIN_BACK_DAYS}
          max={limits.MAX_BACK_DAYS}
          value={backDays}
          onChange={(e) => props.onBack(Number(e.target.value))}
        />
      </div>

      <div className="control">
        <label>Source</label>
        <div className="toggle">
          <button className={source === 'recent' ? 'active' : ''} onClick={() => props.onSource('recent')}>
            All recent
          </button>
          <button className={source === 'notable' ? 'active' : ''} onClick={() => props.onSource('notable')}>
            Rarities only
          </button>
        </div>
      </div>

      <div className="control">
        <label>Baseline</label>
        <div className="toggle">
          <button className={scope === 'life' ? 'active' : ''} onClick={() => props.onScope('life')}>
            Life list
          </button>
          <button className={scope === 'year' ? 'active' : ''} onClick={() => props.onScope('year')}>
            This year
          </button>
        </div>
      </div>
    </div>
  );
}

function round(n: number): number {
  return Math.round(n * 10000) / 10000;
}
