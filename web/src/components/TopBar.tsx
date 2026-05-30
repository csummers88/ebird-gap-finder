import { useState, type ReactNode } from 'react';
import type { AppConfig } from '@gap/shared';
import type { ThemeChoice } from '../hooks.js';
import { useDismiss } from '../hooks.js';
import { Icons } from './Icons.js';
import { ThemeSwitch } from './ThemeSwitch.js';

interface Props {
  config: AppConfig;
  lat: number;
  lng: number;
  distKm: number;
  backDays: number;
  themeChoice: ThemeChoice;
  onLatLng: (lat: number, lng: number) => void;
  onDist: (km: number) => void;
  onBack: (days: number) => void;
  onTheme: (c: ThemeChoice) => void;
}

/** The floating top bar — wordmark, location/radius/lookback pills, theme switch. */
export function TopBar(props: Props) {
  const { config, lat, lng, distKm, backDays, themeChoice } = props;
  const { limits } = config;

  return (
    <div className="topbar">
      <div className="wordmark">
        <span className="wordmark-icon">
          <Icons.binoculars size={19} />
        </span>
        <span className="wordmark-text">Gap Finder</span>
      </div>

      <Popover
        label={
          <>
            <span className="pill-icon">
              <Icons.pin size={15} />
            </span>
            {fmtCoord(lat, lng)}
          </>
        }
      >
        <LocationControl lat={lat} lng={lng} onLatLng={props.onLatLng} />
      </Popover>

      <Popover
        label={
          <>
            Radius <b>{distKm} km</b>
          </>
        }
      >
        <SliderControl
          title="Search radius"
          value={distKm}
          min={limits.MIN_DIST_KM}
          max={limits.MAX_DIST_KM}
          unit="km"
          onChange={props.onDist}
        />
      </Popover>

      <Popover
        label={
          <>
            Last <b>{backDays} days</b>
          </>
        }
      >
        <SliderControl
          title="Lookback window"
          value={backDays}
          min={limits.MIN_BACK_DAYS}
          max={limits.MAX_BACK_DAYS}
          unit="days"
          onChange={props.onBack}
        />
      </Popover>

      <div className="topbar-spacer" />
      <ThemeSwitch choice={themeChoice} onChange={props.onTheme} />
    </div>
  );
}

/** A pill that toggles a floating panel anchored beneath it. */
function Popover({ label, children }: { label: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  return (
    <div className="pill-wrap" ref={ref}>
      <button type="button" className={`pill ${open ? 'on' : ''}`} onClick={() => setOpen((o) => !o)}>
        {label}
      </button>
      {open && <div className="popover">{children}</div>}
    </div>
  );
}

function LocationControl({
  lat,
  lng,
  onLatLng,
}: {
  lat: number;
  lng: number;
  onLatLng: (lat: number, lng: number) => void;
}) {
  function useMyLocation() {
    if (!('geolocation' in navigator)) {
      alert('Geolocation is not available in this browser.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => onLatLng(round(pos.coords.latitude), round(pos.coords.longitude)),
      (err) => alert(`Could not get your location: ${err.message}`),
    );
  }

  return (
    <div className="popover-body">
      <div className="popover-title">Location</div>
      <div className="latlng">
        <label>
          <span>Lat</span>
          <input
            type="number"
            step="0.0001"
            value={lat}
            aria-label="Latitude"
            onChange={(e) => onLatLng(Number(e.target.value), lng)}
          />
        </label>
        <label>
          <span>Lng</span>
          <input
            type="number"
            step="0.0001"
            value={lng}
            aria-label="Longitude"
            onChange={(e) => onLatLng(lat, Number(e.target.value))}
          />
        </label>
      </div>
      <button type="button" className="btn-solid full" onClick={useMyLocation}>
        <Icons.crosshair size={14} /> Use my location
      </button>
      <p className="popover-hint">…or click anywhere on the map to drop a point.</p>
    </div>
  );
}

function SliderControl({
  title,
  value,
  min,
  max,
  unit,
  onChange,
}: {
  title: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  onChange: (n: number) => void;
}) {
  return (
    <div className="popover-body">
      <div className="popover-title">
        {title} <b>{value} {unit}</b>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <div className="slider-ends">
        <span>{min} {unit}</span>
        <span>{max} {unit}</span>
      </div>
    </div>
  );
}

function fmtCoord(lat: number, lng: number): string {
  if (!lat && !lng) return 'Set location';
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(2)}°${ns}, ${Math.abs(lng).toFixed(2)}°${ew}`;
}

function round(n: number): number {
  return Math.round(n * 10000) / 10000;
}
