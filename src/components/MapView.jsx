import React, { useEffect, useRef, useState, useCallback } from 'react';
import './MapView.css';
import { calculateCrimeRisk, predictCongestion, scoreToColor, CRIME_ZONES } from '../aiEngine';

// ── Map dark theme ───────────────────────────────────────────
const DARK_STYLE = [
  { elementType: 'geometry',                stylers: [{ color: '#0a1628' }] },
  { elementType: 'labels.text.stroke',      stylers: [{ color: '#050b18' }] },
  { elementType: 'labels.text.fill',        stylers: [{ color: '#4a6080' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#8ba3cc' }] },
  { featureType: 'poi',     elementType: 'labels.text.fill', stylers: [{ color: '#4a6080' }] },
  { featureType: 'poi.park',elementType: 'geometry',          stylers: [{ color: '#0d1e35' }] },
  { featureType: 'road',    elementType: 'geometry',          stylers: [{ color: '#1a2f4a' }] },
  { featureType: 'road',    elementType: 'geometry.stroke',   stylers: [{ color: '#0a1628' }] },
  { featureType: 'road',    elementType: 'labels.text.fill',  stylers: [{ color: '#6a8aaa' }] },
  { featureType: 'road.highway', elementType: 'geometry',        stylers: [{ color: '#00366a' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#00264a' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill',stylers: [{ color: '#8ab4d4' }] },
  { featureType: 'transit', elementType: 'geometry',          stylers: [{ color: '#0a1628' }] },
  { featureType: 'water',   elementType: 'geometry',          stylers: [{ color: '#050b18' }] },
  { featureType: 'water',   elementType: 'labels.text.fill',  stylers: [{ color: '#2a4060' }] },
];

const ROUTE_COLORS  = { fastest: '#00d2ff', balanced: '#ffab00', safest: '#c158dc' };
const ROUTE_WEIGHTS = { fastest: 6,         balanced: 5,         safest: 5.5 };
const TRAFFIC_MIN_ZOOM = 11;

export default function MapView({
  directionsResult, routes, selectedRoute,
  userLocation, destCoord, onSelectRoute,
}) {
  const mapRef       = useRef(null);
  const mapInst      = useRef(null);
  const renderersRef = useRef([]);
  const markersRef   = useRef([]);
  const circlesRef   = useRef([]);
  const trafficRef   = useRef(null);
  const infoRef      = useRef(null);
  const trafficOnRef = useRef(true);   // ref mirror for closure-safe zoom listener
  const initDoneRef  = useRef(false);

  const [trafficOn, setTrafficOn] = useState(true);
  const [crimeOn,   setCrimeOn]   = useState(true);
  const [mapReady,  setMapReady]  = useState(false);
  const [zoomLevel, setZoomLevel] = useState(12);

  // ── Keep ref in sync with state (closure-safe) ───────────
  useEffect(() => { trafficOnRef.current = trafficOn; }, [trafficOn]);

  // ── Init map — poll until google.maps ready ──────────────
  const tryInit = useCallback(() => {
    if (mapInst.current || !window.google?.maps?.Map || !mapRef.current) return false;

    const map = new window.google.maps.Map(mapRef.current, {
      center:            { lat: 28.6139, lng: 77.2090 },
      zoom:              12,
      styles:            DARK_STYLE,
      mapTypeControl:    false,
      streetViewControl: false,
      fullscreenControl: true,
      zoomControl:       true,
      gestureHandling:   'greedy',
    });
    mapInst.current = map;

    // Traffic layer
    trafficRef.current = new window.google.maps.TrafficLayer();
    trafficRef.current.setMap(map);

    // InfoWindow singleton
    infoRef.current = new window.google.maps.InfoWindow({ maxWidth: 280 });

    // Zoom listener — use ref so it always sees latest trafficOn
    map.addListener('zoom_changed', () => {
      const z = map.getZoom();
      setZoomLevel(z);
      if (trafficRef.current) {
        trafficRef.current.setMap(
          trafficOnRef.current && z >= TRAFFIC_MIN_ZOOM ? map : null
        );
      }
    });

    // Click anywhere → area intelligence popup
    map.addListener('click', e => {
      const { lat, lng } = e.latLng.toJSON();
      const crime      = calculateCrimeRisk(lat, lng, new Date());
      const congestion = predictCongestion(lat, lng, new Date());
      infoRef.current.setContent(makeInfoHtml({
        title: '📍 Area Intelligence',
        rows: [
          { label: 'Crime Risk',  value: `${crime.label} (${crime.score}/100)`,           color: crime.color      },
          { label: 'Traffic',     value: `${congestion.label} (${congestion.score}/100)`, color: congestion.color },
          { label: 'Time Factor', value: `${crime.timeMultiplier}×`,                       color: '#00d2ff'        },
        ],
        sub: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
      }));
      infoRef.current.setPosition(e.latLng);
      infoRef.current.open(map);
    });

    setMapReady(true);
    return true;
  }, []);

  useEffect(() => {
    if (initDoneRef.current) return;
    initDoneRef.current = true;
    if (tryInit()) return;
    const iv = setInterval(() => { if (tryInit()) clearInterval(iv); }, 200);
    return () => clearInterval(iv);
  }, [tryInit]);

  // ── Traffic toggle ───────────────────────────────────────
  useEffect(() => {
    if (!trafficRef.current || !mapInst.current) return;
    trafficRef.current.setMap(
      trafficOn && zoomLevel >= TRAFFIC_MIN_ZOOM ? mapInst.current : null
    );
  }, [trafficOn, zoomLevel, mapReady]);

  // ── Crime circles ────────────────────────────────────────
  useEffect(() => {
    if (!mapInst.current || !window.google?.maps) return;
    circlesRef.current.forEach(c => c.setMap(null));
    circlesRef.current = [];
    if (!crimeOn) return;

    const iw = new window.google.maps.InfoWindow({ maxWidth: 260 });

    CRIME_ZONES.forEach(zone => {
      const color  = scoreToColor(zone.crime);
      const circle = new window.google.maps.Circle({
        map:           mapInst.current,
        center:        { lat: zone.lat, lng: zone.lng },
        radius:        zone.crime * 60 + 800,
        strokeColor:   color, strokeOpacity: 0.4, strokeWeight: 1,
        fillColor:     color, fillOpacity: Math.min(0.22, zone.crime / 100 * 0.3),
        clickable:     true,
        zIndex:        1,
      });
      circle.addListener('click', e => {
        iw.setContent(makeInfoHtml({
          title: zone.name,
          rows: [
            { label: 'Crime Score', value: `${zone.crime}/100`, color },
            { label: 'Area Type',   value: zone.type,           color: '#8ba3cc' },
          ],
        }));
        iw.setPosition(e.latLng);
        iw.open(mapInst.current);
      });
      circlesRef.current.push(circle);
    });
  }, [crimeOn, mapReady]);

  // ── Render routes ────────────────────────────────────────
  useEffect(() => {
    if (!mapInst.current || !window.google?.maps) return;

    // Clean up old renderers & markers
    renderersRef.current.forEach(r => r.setMap(null));
    renderersRef.current = [];
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];
    infoRef.current?.close();

    if (!directionsResult?.routes?.length || !routes?.length) return;

    const maxIdx = directionsResult.routes.length - 1;

    // ── 1. Render NON-selected routes first (lower z-index) ──
    routes.forEach((route, fallbackIdx) => {
      if (route.id === selectedRoute?.id) return;

      const color    = ROUTE_COLORS[route.id] || '#8ba3cc';
      const routeIdx = Math.min(route.routeIndex ?? fallbackIdx, maxIdx);

      const renderer = new window.google.maps.DirectionsRenderer({
        map:             mapInst.current,
        directions:      directionsResult,
        routeIndex:      routeIdx,
        suppressMarkers: true,
        preserveViewport:true,          // ← don't move map for unselected
        polylineOptions: {
          strokeColor:   color,
          strokeWeight:  3,
          strokeOpacity: 0.3,
          zIndex:        2,
        },
      });

      // Click unselected route → select it
      if (onSelectRoute) {
        window.google.maps.event.addListener(renderer, 'directions_changed', () => {});
        // Overlay an invisible polyline for better click area on unselected routes
        const path = (directionsResult.routes[routeIdx]?.overview_path || []);
        if (path.length) {
          const clickPoly = new window.google.maps.Polyline({
            path,
            map:           mapInst.current,
            strokeColor:   'transparent',
            strokeWeight:  12,
            zIndex:        3,
            clickable:     true,
          });
          clickPoly.addListener('click', () => onSelectRoute(route));
          markersRef.current.push(clickPoly);
        }
      }

      renderersRef.current.push(renderer);
    });

    // ── 2. Render SELECTED route on top ───────────────────
    if (selectedRoute) {
      const color    = ROUTE_COLORS[selectedRoute.id] || '#00d2ff';
      const weight   = ROUTE_WEIGHTS[selectedRoute.id] || 5;
      const routeIdx = Math.min(selectedRoute.routeIndex ?? 0, maxIdx);

      const renderer = new window.google.maps.DirectionsRenderer({
        map:             mapInst.current,
        directions:      directionsResult,
        routeIndex:      routeIdx,
        suppressMarkers: true,
        preserveViewport:true,           // ← we handle fitBounds manually below
        polylineOptions: {
          strokeColor:   color,
          strokeWeight:  weight,
          strokeOpacity: 1.0,
          zIndex:        10,
        },
      });
      renderersRef.current.push(renderer);
    }

    // ── 3. Origin marker ───────────────────────────────────
    if (userLocation?.lat) {
      const m = new window.google.maps.Marker({
        position: { lat: userLocation.lat, lng: userLocation.lng },
        map:      mapInst.current,
        title:    'Your Location',
        zIndex:   30,
        icon: {
          path:         window.google.maps.SymbolPath.CIRCLE,
          scale:        11,
          fillColor:    '#00e676',
          fillOpacity:  1,
          strokeColor:  '#ffffff',
          strokeWeight: 3,
        },
      });
      m.addListener('click', () => {
        infoRef.current.setContent(makeInfoHtml({
          title: '🟢 Starting Point',
          rows: [{ label: 'Location', value: userLocation.display?.split(',').slice(0,2).join(',') || 'Your Location', color: '#00e676' }],
        }));
        infoRef.current.open(mapInst.current, m);
      });
      markersRef.current.push(m);
    }

    // ── 4. Destination marker ──────────────────────────────
    if (destCoord?.lat) {
      const m = new window.google.maps.Marker({
        position: { lat: destCoord.lat, lng: destCoord.lng },
        map:      mapInst.current,
        title:    'Destination',
        zIndex:   30,
        icon: {
          url: 'data:image/svg+xml;utf8,' + encodeURIComponent(
            `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">
               <path fill="#ff1744" stroke="#fff" stroke-width="2"
                 d="M14 2C7.4 2 2 7.4 2 14c0 9 12 20 12 20s12-11 12-20C26 7.4 20.6 2 14 2z"/>
               <circle cx="14" cy="14" r="5" fill="#fff"/>
             </svg>`
          ),
          scaledSize: new window.google.maps.Size(28, 36),
          anchor:     new window.google.maps.Point(14, 36),
        },
      });
      m.addListener('click', () => {
        infoRef.current.setContent(makeInfoHtml({
          title: '🏁 Destination',
          rows: [{ label: 'Address', value: (destCoord.display || '').split(',').slice(0, 2).join(','), color: '#ff1744' }],
        }));
        infoRef.current.open(mapInst.current, m);
      });
      markersRef.current.push(m);
    }

    // ── 5. Fit selected route bounds ───────────────────────
    const selIdx    = Math.min(selectedRoute?.routeIndex ?? 0, maxIdx);
    const selGRoute = directionsResult.routes[selIdx];
    if (selGRoute) {
      const bounds = new window.google.maps.LatLngBounds();
      selGRoute.legs.forEach(leg => {
        bounds.extend(leg.start_location);
        bounds.extend(leg.end_location);
        if (leg.overview_path) leg.overview_path.forEach(p => bounds.extend(p));
      });
      if (userLocation?.lat) bounds.extend({ lat: userLocation.lat, lng: userLocation.lng });
      if (destCoord?.lat)    bounds.extend({ lat: destCoord.lat,    lng: destCoord.lng    });
      if (!bounds.isEmpty()) {
        mapInst.current.fitBounds(bounds, { top: 80, right: 60, bottom: 100, left: 20 });
      }
    }

  }, [directionsResult, routes, selectedRoute, userLocation, destCoord, onSelectRoute, mapReady]);

  return (
    <div className="map-wrapper">
      <div ref={mapRef} className="map-container" id="main-map" />

      {/* Overlay controls */}
      <div className="map-controls glass-card">
        <button id="btn-toggle-traffic"
          className={`map-ctrl-btn ${trafficOn ? 'active' : ''}`}
          onClick={() => setTrafficOn(v => !v)}
          title="Toggle real-time Google traffic layer"
        >
          <span className={trafficOn ? 'ctrl-live-dot' : ''} />
          🚗 Traffic {trafficOn ? 'LIVE' : 'OFF'}
        </button>
        <button id="btn-toggle-crime"
          className={`map-ctrl-btn ${crimeOn ? 'active' : ''}`}
          onClick={() => setCrimeOn(v => !v)}
          title="Toggle AI crime risk zones"
        >
          🚨 Crime {crimeOn ? 'ON' : 'OFF'}
        </button>
      </div>

      {/* Live traffic badge */}
      {trafficOn && zoomLevel >= TRAFFIC_MIN_ZOOM && (
        <div className="traffic-live-badge">
          <span className="live-dot" />
          Google Live Traffic
        </div>
      )}

      {/* Legend */}
      <div className="map-legend glass-card">
        <div className="legend-title">Route Colors</div>
        {[
          { color: '#00d2ff', label: '⚡ Fastest' },
          { color: '#ffab00', label: '⚖️ Balanced' },
          { color: '#c158dc', label: '🛡️ Safest ★' },
        ].map(({ color, label }) => (
          <div key={label} className="legend-item">
            <div className="legend-line" style={{ background: color }} />
            <span>{label}</span>
          </div>
        ))}
        <div className="legend-divider" />
        <div className="legend-item">
          <div className="legend-line" style={{ background: 'linear-gradient(to right,#006400,#ffd700,#ff4500)' }} />
          <span style={{ fontSize: '9px' }}>Google Traffic</span>
        </div>
        <div className="legend-divider" />
        <div className="legend-tip">🟢 Start &nbsp; 🔴 Destination</div>
        <div className="legend-tip">Click map for area data</div>
        <div className="legend-tip">Click route to select it</div>
      </div>
    </div>
  );
}

// ── Info window helpers ──────────────────────────────────────
function makeInfoWindow(content) {
  return new window.google.maps.InfoWindow({ content, maxWidth: 280 });
}

function makeInfoHtml({ title, rows = [], sub }) {
  const rowsHtml = rows.map(r => `
    <div style="display:flex;justify-content:space-between;gap:16px;padding:5px 0;
      border-bottom:1px solid rgba(255,255,255,0.06);font-size:12px;">
      <span style="color:#8ba3cc;">${r.label}</span>
      <span style="color:${r.color || '#f0f4ff'};font-weight:600;">${r.value}</span>
    </div>`).join('');
  return `
    <div style="font-family:Inter,sans-serif;background:#0a1628;color:#f0f4ff;
      padding:14px 16px;min-width:200px;border-radius:10px;">
      <div style="font-size:13px;font-weight:700;color:#00d2ff;margin-bottom:10px;">${title}</div>
      ${rowsHtml}
      ${sub ? `<div style="font-size:10px;color:#4a6080;margin-top:8px;font-family:monospace;">${sub}</div>` : ''}
    </div>`;
}
