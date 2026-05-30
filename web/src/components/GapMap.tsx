import { useEffect } from 'react';
import { MapContainer, TileLayer, CircleMarker, Circle, Popup, useMap, useMapEvents } from 'react-leaflet';
import type { GapSpecies } from '@gap/shared';

interface Props {
  lat: number;
  lng: number;
  distKm: number;
  gaps: GapSpecies[];
  highlighted: string | null;
  onHighlight: (code: string | null) => void;
  onPickLocation: (lat: number, lng: number) => void;
  focusCode: string | null;
}

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

export function GapMap(props: Props) {
  const { lat, lng, distKm, gaps, highlighted } = props;

  return (
    <MapContainer center={[lat, lng]} zoom={11} className="map" scrollWheelZoom>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Recenter lat={lat} lng={lng} />
      <ClickToPick onPick={props.onPickLocation} />
      <FlyToFocus gaps={gaps} focusCode={props.focusCode} />

      {/* Search point + radius (coords are eBird-rounded; treat as approximate). */}
      <CircleMarker center={[lat, lng]} radius={7} pathOptions={{ color: '#1d4ed8', fillColor: '#3b82f6', fillOpacity: 0.9 }}>
        <Popup>Search point (approx.)</Popup>
      </CircleMarker>
      <Circle center={[lat, lng]} radius={distKm * 1000} pathOptions={{ color: '#3b82f6', weight: 1, fillOpacity: 0.04 }} />

      {gaps.flatMap((g) =>
        g.observations.map((o, i) => {
          const isHot = highlighted === g.speciesCode;
          return (
            <CircleMarker
              key={`${g.speciesCode}-${o.locId}-${i}`}
              center={[o.lat, o.lng]}
              radius={isHot ? 9 : 5}
              pathOptions={{
                color: g.notable ? '#b45309' : '#047857',
                fillColor: isHot ? '#f59e0b' : g.notable ? '#f59e0b' : '#10b981',
                fillOpacity: isHot ? 1 : 0.75,
                weight: isHot ? 2 : 1,
              }}
              eventHandlers={{
                mouseover: () => props.onHighlight(g.speciesCode),
                mouseout: () => props.onHighlight(null),
              }}
            >
              <Popup>
                <strong>{g.comName}</strong>
                {g.notable && ' (rare)'}
                <br />
                {o.locName}
                <br />
                {o.obsDt}
                {o.howMany != null && ` · ${o.howMany} seen`}
                <br />
                <a href={g.ebirdUrl} target="_blank" rel="noreferrer">
                  eBird species page ↗
                </a>
              </Popup>
            </CircleMarker>
          );
        }),
      )}
    </MapContainer>
  );
}

function round(n: number): number {
  return Math.round(n * 10000) / 10000;
}
