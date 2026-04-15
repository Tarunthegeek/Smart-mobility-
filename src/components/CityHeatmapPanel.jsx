import React, { useState, useEffect, useRef } from 'react';
import './CityHeatmapPanel.css';
import { calculateCrimeRisk, predictCongestion, scoreToColor, scoreToLabel } from '../aiEngine';

// Dark map style (same as MapView)
const DARK_STYLE = [
  { elementType: 'geometry',               stylers: [{ color: '#0a1628' }] },
  { elementType: 'labels.text.stroke',     stylers: [{ color: '#050b18' }] },
  { elementType: 'labels.text.fill',       stylers: [{ color: '#4a6080' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#8ba3cc' }] },
  { featureType: 'road',                   elementType: 'geometry',          stylers: [{ color: '#1a2f4a' }] },
  { featureType: 'road.highway',           elementType: 'geometry',          stylers: [{ color: '#00366a' }] },
  { featureType: 'water',                  elementType: 'geometry',          stylers: [{ color: '#050b18' }] },
];

const NAMED_AREAS = [
  { name: 'Connaught Place',  lat: 28.6304, lng: 77.2177 },
  { name: 'Paharganj',        lat: 28.6433, lng: 77.2152 },
  { name: 'Karol Bagh',       lat: 28.6514, lng: 77.1907 },
  { name: 'Rohini',           lat: 28.7041, lng: 77.1025 },
  { name: 'Dwarka Sec 21',    lat: 28.5563, lng: 77.0595 },
  { name: 'Saket',            lat: 28.5274, lng: 77.2158 },
  { name: 'Noida Sec 62',     lat: 28.6272, lng: 77.3686 },
  { name: 'Mayur Vihar',      lat: 28.6113, lng: 77.2955 },
  { name: 'Lajpat Nagar',     lat: 28.5698, lng: 77.2437 },
  { name: 'Pitampura',        lat: 28.7005, lng: 77.1430 },
  { name: 'Nehru Place',      lat: 28.5491, lng: 77.2519 },
  { name: 'Vasant Kunj',      lat: 28.5191, lng: 77.1570 },
];

// Generate a dense grid of points for heatmap
function generateGridPoints(latMin, lngMin, latMax, lngMax, steps) {
  const points = [];
  for (let i = 0; i <= steps; i++) {
    for (let j = 0; j <= steps; j++) {
      points.push({
        lat: latMin + (i / steps) * (latMax - latMin),
        lng: lngMin + (j / steps) * (lngMax - lngMin),
      });
    }
  }
  return points;
}

const GRID = generateGridPoints(28.40, 76.95, 28.75, 77.45, 12);

export default function CityHeatmapPanel({ currentTime }) {
  const mapRef      = useRef(null);
  const mapInstance = useRef(null);
  const heatmapRef  = useRef(null);
  const markersRef  = useRef([]);
  const [mode,      setMode]      = useState('crime');
  const [topDanger, setTopDanger] = useState([]);
  const [topSafe,   setTopSafe]   = useState([]);
  const [mapReady,  setMapReady]  = useState(false);

  useEffect(() => {
    const data = NAMED_AREAS.map(a => {
      const crime      = calculateCrimeRisk(a.lat, a.lng, currentTime);
      const congestion = predictCongestion(a.lat, a.lng, currentTime);
      return { ...a, crime, congestion, composite: Math.round(crime.score * 0.6 + congestion.score * 0.4) };
    });
    
    // Sort directly when calculating derived state to avoid setting state in effect
    // But since topDanger and topSafe only depend on mode/currentTime, this is ok-ish. 
    // To strictly follow React rules, we do the calculation but avoid setAreaData 
    // since it is unused anyway.
    const sorted = [...data].sort((a, b) => getScore(b, mode) - getScore(a, mode));
    
    // It's still better to just compute these during render, but if we want to keep state:
    setTopDanger(sorted.slice(0, 4));
    setTopSafe(sorted.slice(-4).reverse());
  }, [currentTime, mode]);

  // Init Google Map — poll until window.google.maps is ready
  useEffect(() => {
    if (mapInstance.current) return;

    function tryInit() {
      if (!window.google?.maps || !mapRef.current) return;
      mapInstance.current = new window.google.maps.Map(mapRef.current, {
        center:            { lat: 28.5700, lng: 77.2100 },
        zoom:              11,
        styles:            DARK_STYLE,
        mapTypeControl:    false,
        streetViewControl: false,
        fullscreenControl: true,
        gestureHandling:   'greedy',
      });
      setMapReady(true);   // ← triggers heatmap effect to run
    }

    tryInit();
    if (!mapInstance.current) {
      const interval = setInterval(() => {
        tryInit();
        if (mapInstance.current) clearInterval(interval);
      }, 300);
      return () => clearInterval(interval);
    }
  }, []);

  // Update heatmap when mode/time/mapReady changes
  useEffect(() => {
    if (!mapInstance.current || !window.google?.maps?.visualization) return;

    // Remove old heatmap
    if (heatmapRef.current) {
      heatmapRef.current.setMap(null);
      heatmapRef.current = null;
    }
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];

    // Build weighted heatmap data from grid
    const weightedData = GRID.map(pt => {
      const crime      = calculateCrimeRisk(pt.lat, pt.lng, currentTime);
      const congestion = predictCongestion(pt.lat, pt.lng, currentTime);
      const score = mode === 'crime'     ? crime.score
                  : mode === 'traffic'   ? congestion.score
                  : Math.round(crime.score * 0.6 + congestion.score * 0.4);
      return {
        location: new window.google.maps.LatLng(pt.lat, pt.lng),
        weight:   score / 100,
      };
    });

    // Gradient: safe (green) → moderate (yellow) → danger (orange) → critical (red)
    const gradient = [
      'rgba(0,0,0,0)',
      'rgba(0,230,118,0.4)',
      'rgba(255,215,64,0.6)',
      'rgba(255,109,0,0.75)',
      'rgba(255,23,68,0.9)',
    ];

    heatmapRef.current = new window.google.maps.visualization.HeatmapLayer({
      data:     weightedData,
      map:      mapInstance.current,
      radius:   55,
      opacity:  0.75,
      gradient,
    });

    // Named area markers
    NAMED_AREAS.forEach(a => {
      const crime      = calculateCrimeRisk(a.lat, a.lng, currentTime);
      const congestion = predictCongestion(a.lat, a.lng, currentTime);
      const score = mode === 'crime'     ? crime.score
                  : mode === 'traffic'   ? congestion.score
                  : Math.round(crime.score * 0.6 + congestion.score * 0.4);
      const color = scoreToColor(score);

      const marker = new window.google.maps.Marker({
        position: { lat: a.lat, lng: a.lng },
        map:      mapInstance.current,
        title:    a.name,
        icon: {
          path:        window.google.maps.SymbolPath.CIRCLE,
          scale:       9,
          fillColor:   color,
          fillOpacity: 0.9,
          strokeColor: '#050b18',
          strokeWeight: 1.5,
        },
        zIndex: 10,
      });

      const infoWin = new window.google.maps.InfoWindow({
        content: `
          <div style="font-family:Inter,sans-serif;background:#0a1628;color:#f0f4ff;padding:12px;border-radius:10px;min-width:160px;">
            <div style="font-size:13px;font-weight:700;color:${color};margin-bottom:8px;">${a.name}</div>
            <div style="font-size:12px;color:#8ba3cc;">Crime Risk: <b style="color:${scoreToColor(crime.score)}">${crime.label} (${crime.score})</b></div>
            <div style="font-size:12px;color:#8ba3cc;">Traffic: <b style="color:${scoreToColor(congestion.score)}">${congestion.label} (${congestion.score})</b></div>
            <div style="font-size:12px;color:#8ba3cc;">Composite: <b style="color:${color}">${Math.round(crime.score*0.6+congestion.score*0.4)}/100</b></div>
          </div>
        `,
      });

      marker.addListener('click', () => infoWin.open(mapInstance.current, marker));
      markersRef.current.push(marker);
    });
  }, [mode, currentTime, mapReady]);

  return (
    <div className="heatmap-layout">
      <aside className="heatmap-sidebar">
        <div className="hm-header">
          <h2 className="hm-title">City Intelligence Map</h2>
          <p className="hm-sub">Google Maps HeatmapLayer — Delhi NCR AI analysis</p>
        </div>

        {/* Mode switcher */}
        <div className="mode-switcher">
          {[
            { id: 'crime',     icon: '🚨', label: 'Crime Risk'     },
            { id: 'traffic',   icon: '🚗', label: 'Traffic Load'   },
            { id: 'composite', icon: '⚠️', label: 'Composite Risk'  },
          ].map(m => (
            <button
              key={m.id}
              id={`mode-${m.id}`}
              className={`mode-btn ${mode === m.id ? 'active' : ''}`}
              onClick={() => setMode(m.id)}
            >
              {m.icon} {m.label}
            </button>
          ))}
        </div>

        {/* Danger zones */}
        <div className="zone-section">
          <div className="zone-section-title danger-title">🔴 High Risk Areas</div>
          {topDanger.map((d, i) => (
            <ZoneRow key={d.name} area={d} score={getScore(d, mode)} rank={i + 1} mode={mode} />
          ))}
        </div>

        {/* Safe zones */}
        <div className="zone-section">
          <div className="zone-section-title safe-title">🟢 Safe Areas</div>
          {topSafe.map((d, i) => (
            <ZoneRow key={d.name} area={d} score={getScore(d, mode)} rank={i + 1} mode={mode} />
          ))}
        </div>

        {/* Legend */}
        <div className="hm-legend glass-card">
          <div className="hm-legend-title">Risk Heatmap Scale</div>
          <div className="hm-legend-gradient" />
          <div className="hm-legend-labels">
            <span style={{ color: 'var(--safe-color)' }}>Safe</span>
            <span style={{ color: 'var(--moderate-color)' }}>Moderate</span>
            <span style={{ color: 'var(--danger-color)' }}>Danger</span>
            <span style={{ color: 'var(--critical-color)' }}>Critical</span>
          </div>
          <p className="hm-legend-note">Powered by Google Maps Visualization API</p>
        </div>
      </aside>

      <div className="heatmap-map-wrap">
        <div ref={mapRef} className="heatmap-map" id="heatmap-map" />
        <div className="heatmap-overlay-badge glass-card">
          <span className="live-dot" />
          <span>Live AI Heatmap — {currentTime.toLocaleTimeString()}</span>
        </div>
      </div>
    </div>
  );
}

function getScore(d, mode) {
  return mode === 'crime' ? d.crime.score : mode === 'traffic' ? d.congestion.score : d.composite;
}

function ZoneRow({ area, score, rank, mode }) {
  const color = scoreToColor(score);
  const label = mode === 'crime'
    ? area.crime?.label
    : mode === 'traffic'
      ? area.congestion?.label
      : scoreToLabel(area.composite);
  return (
    <div className="zone-row">
      <div className="zone-rank" style={{ color }}>{rank}</div>
      <div className="zone-info">
        <div className="zone-name">{area.name}</div>
        <div className="zone-meta" style={{ color }}>{label} — {score}/100</div>
        <div className="zone-bar-track">
          <div className="zone-bar-fill" style={{ '--target-width': `${score}%`, background: color }} />
        </div>
      </div>
    </div>
  );
}
