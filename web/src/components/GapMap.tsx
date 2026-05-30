import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { MapContainer, TileLayer, CircleMarker, Circle, useMap, useMapEvents } from 'react-leaflet';
import type { GapSpecies } from '@gap/shared';
import type { ThemeMode } from '../hooks.js';
import { Sparkline } from './Sparkline.js';
import { Icons } from './Icons.js';
import { heatColor, heatOf, relativeDay, sparkData } from '../gapDisplay.js';

interface Props {
  lat: number;
  lng: number;
  distKm: number;
  backDays: number;
  gaps: GapSpecies[];
  mode: ThemeMode;
  highlighted: string | null;
  onHighlight: (code: string | null) => void;
  onPickLocation: (lat: number, lng: number) => void;
  focusCode: string | null;
}

const MARKERS = {
  light: { regular: '#0a6b4a', notable: '#c64a2c', stroke: '#fbf7ee', search: '#0a6b4a', ring: '#0a6b4a' },
  dark: { regular: '#46b88c', notable: '#e08a5e', stroke: '#16130d', search: '#46b88c', ring: '#46b88c' },
} as const;

/** Recenters the map when the search point moves (geolocation, typing, etc.). */
function Recenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], map.getZoom(), { animate: true });
  }, [lat, lng, map]);
  return null;
}

/** Click anywhere on the map to move the search point. */
function ClickToPick({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(round(e.latlng.lat), round(e.latlng.lng));
    },
  });
  return null;
}

/** When a list row is clicked, pan to that species' nearest report. */
function FlyToFocus({ gaps, focusCode }: { gaps: GapSpecies[]; focusCode: string | null }) {
  const map = useMap();
  useEffect(() => {
    if (!focusCode) return;
    const g = gaps.find((x) => x.speciesCode === focusCode);
    if (g) map.flyTo([g.nearestLat, g.nearestLng], Math.max(map.getZoom(), 12), { duration: 0.6 });
  }, [focusCode, gaps, map]);
  return null;
}

/**
 * Field-guide callout anchored to the highlighted species' nearest marker.
 * Rendered via portal into the Leaflet container so it tracks pan/zoom.
 */
function HighlightCallout({ gaps, highlighted, backDays }: { gaps: GapSpecies[]; highlighted: string | null; backDays: number }) {
  const map = useMap();
  const [, force] = useState(0);
  useMapEvents({
    move: () => force((n) => n + 1),
    zoom: () => force((n) => n + 1),
    resize: () => force((n) => n + 1),
  });

  const g = highlighted ? gaps.find((x) => x.speciesCode === highlighted) : undefined;
  if (!g) return null;

  const pt = map.latLngToContainerPoint([g.nearestLat, g.nearestLng]);
  const size = map.getSize();
  const right = pt.x > size.x * 0.55;
  const heat = heatOf(g);
  const color = heatColor(heat);

  return createPortal(
    <div
      className={`callout ${right ? 'left' : 'right'}`}
      style={{ left: pt.x, top: pt.y }}
    >
      <div className="callout-head">
        <span className="callout-dot" style={{ background: color }} />
        <span className="callout-name">{g.comName}</span>
        {g.notable && <span className="badge-rare">Rare</span>}
      </div>
      <div className="callout-sci">{g.sciName}</div>
      <div className="callout-body">
        <div>
          <div className="callout-line">
            <b style={{ color: heat === 'hot' ? color : undefined }}>{relativeDay(g.lastObsDt)}</b> · {g.reportCount} reports
          </div>
          <div className="callout-line muted">
            {g.nearestKm} km — {g.nearestLocName}
          </div>
        </div>
        <Sparkline data={sparkData(g, backDays)} color={color} fill w={56} h={26} />
      </div>
      <a className="callout-link" href={g.ebirdUrl} target="_blank" rel="noreferrer">
        View on eBird <Icons.arrow size={13} />
      </a>
    </div>,
    map.getContainer(),
  );
}

export function GapMap(props: Props) {
  const { lat, lng, distKm, backDays, gaps, mode, highlighted } = props;
  const c = MARKERS[mode];

  return (
    <MapContainer center={[lat, lng]} zoom={11} className="map" scrollWheelZoom zoomControl={false}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Recenter lat={lat} lng={lng} />
      <ClickToPick onPick={props.onPickLocation} />
      <FlyToFocus gaps={gaps} focusCode={props.focusCode} />

      {/* Search point + radius (coords are eBird-rounded; treat as approximate). */}
      <Circle center={[lat, lng]} radius={distKm * 1000} pathOptions={{ color: c.ring, weight: 1.4, fillColor: c.ring, fillOpacity: 0.06 }} />
      <CircleMarker
        center={[lat, lng]}
        radius={7}
        pathOptions={{ color: c.stroke, weight: 2.5, fillColor: c.search, fillOpacity: 1 }}
      />

      {gaps.flatMap((g) =>
        g.observations.map((o, i) => {
          const on = highlighted === g.speciesCode;
          const fill = g.notable ? c.notable : c.regular;
          return (
            <CircleMarker
              key={`${g.speciesCode}-${o.locId}-${i}`}
              center={[o.lat, o.lng]}
              radius={on ? 8 : 5}
              pathOptions={{
                color: c.stroke,
                weight: on ? 2.5 : 2,
                fillColor: fill,
                fillOpacity: on ? 1 : 0.85,
              }}
              eventHandlers={{
                mouseover: () => props.onHighlight(g.speciesCode),
                mouseout: () => props.onHighlight(null),
                click: () => props.onHighlight(g.speciesCode),
              }}
            />
          );
        }),
      )}

      <HighlightCallout gaps={gaps} highlighted={highlighted} backDays={backDays} />
    </MapContainer>
  );
}

function round(n: number): number {
  return Math.round(n * 10000) / 10000;
}
