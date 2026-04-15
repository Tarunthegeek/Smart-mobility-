import React, { useEffect, useRef, useState, useCallback } from 'react';
import './RoutePanel.css';

const QUICK_PLACES = [
  { label: 'Connaught Place',  icon: '🏛️', value: 'Connaught Place, New Delhi' },
  { label: 'Saket Mall',       icon: '🛍️', value: 'Saket, New Delhi' },
  { label: 'Noida Sector 62',  icon: '💼', value: 'Noida Sector 62, Uttar Pradesh' },
  { label: 'Dwarka',           icon: '🏙️', value: 'Dwarka Sector 21, New Delhi' },
  { label: 'Karol Bagh',       icon: '🏪', value: 'Karol Bagh, New Delhi' },
  { label: 'Nehru Place',      icon: '💻', value: 'Nehru Place, New Delhi' },
  { label: 'Rohini',           icon: '🌆', value: 'Rohini, New Delhi' },
  { label: 'Mayur Vihar',      icon: '🏠', value: 'Mayur Vihar, New Delhi' },
  { label: 'IGI Airport',      icon: '✈️', value: 'Indira Gandhi International Airport, New Delhi' },
  { label: 'India Gate',       icon: '🗿', value: 'India Gate, New Delhi' },
];

const ROUTE_COLORS = { fastest: '#00d2ff', balanced: '#ffab00', safest: '#c158dc' };
const ROUTE_ICONS  = { fastest: '⚡', balanced: '⚖️', safest: '🛡️' };

export default function RoutePanel({
  startAddr, onStartChange, onStartCoordChange,
  destAddr,  onDestChange,  onDestCoordChange,
  userLocation, gpsStatus, onDetectLocation,
  onSearch, loading, loadingStep, error, mapsReady,
  routes, selectedRoute, onSelectRoute,
}) {
  const startRef   = useRef(null);
  const destRef    = useRef(null);
  const startAcRef = useRef(null);
  const destAcRef  = useRef(null);
  const suggRef    = useRef(null);

  const [destFocused,  setDestFocused]  = useState(false);
  const [startFocused, setStartFocused] = useState(false);

  // ── Attach Places Autocomplete ──────────────────
  useEffect(() => {
    if (!window.google?.maps?.places?.Autocomplete || !mapsReady) return;
    const opts = { componentRestrictions: { country: 'in' }, fields: ['formatted_address', 'geometry'] };

    if (startRef.current && !startAcRef.current) {
      startAcRef.current = new window.google.maps.places.Autocomplete(startRef.current, opts);
      startAcRef.current.addListener('place_changed', () => {
        const p = startAcRef.current.getPlace();
        if (p?.formatted_address) {
          onStartChange(p.formatted_address);
          if (p.geometry?.location)
            onStartCoordChange({ lat: p.geometry.location.lat(), lng: p.geometry.location.lng(), display: p.formatted_address });
        }
      });
    }
    if (destRef.current && !destAcRef.current) {
      destAcRef.current = new window.google.maps.places.Autocomplete(destRef.current, opts);
      destAcRef.current.addListener('place_changed', () => {
        const p = destAcRef.current.getPlace();
        if (p?.formatted_address) {
          onDestChange(p.formatted_address);
          if (p.geometry?.location)
            onDestCoordChange({ lat: p.geometry.location.lat(), lng: p.geometry.location.lng(), display: p.formatted_address });
          setDestFocused(false);
        }
      });
    }
  }, [mapsReady]);

  // ── Close suggestion list on outside click ──────
  useEffect(() => {
    function handleClick(e) {
      if (suggRef.current && !suggRef.current.contains(e.target) &&
          destRef.current && !destRef.current.contains(e.target)) {
        setDestFocused(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // ── Filtered suggestions (only when typing) ─────
  const query             = destAddr.trim().toLowerCase();
  const filteredSuggestions = query.length > 0
    ? QUICK_PLACES.filter(q =>
        q.label.toLowerCase().includes(query) ||
        q.value.toLowerCase().includes(query)
      )
    : [];                            // empty when not typing
  const showSuggestions = destFocused && filteredSuggestions.length > 0 && !loading;

  const selectSuggestion = useCallback((place) => {
    onDestChange(place.value);
    onDestCoordChange(null);         // will geocode on search
    setDestFocused(false);
  }, [onDestChange, onDestCoordChange]);

  const handleKey = (e) => {
    if (e.key === 'Enter' && !loading && mapsReady) onSearch();
    if (e.key === 'Escape') setDestFocused(false);
  };

  return (
    <div className="rp-panel">
      {/* Brand */}
      <div className="rp-brand">
        <span className="rp-brand-icon">🗺</span>
        <div>
          <div className="rp-brand-name">SmartRoute</div>
          <div className="rp-brand-sub">Real-time road intelligence</div>
        </div>
        {mapsReady && <div className="rp-live-pill"><span className="live-dot" />Live</div>}
      </div>

      {/* ── Form card ── */}
      <div className="rp-form-card">

        {/* FROM field */}
        <div className="rp-field">
          <div className="rp-field-marker rp-marker-start" />
          <input
            ref={startRef} id="input-start"
            className="rp-input"
            placeholder="Starting location"
            value={startAddr}
            onChange={e => { onStartChange(e.target.value); onStartCoordChange(null); }}
            onKeyDown={handleKey}
            onFocus={() => setStartFocused(true)}
            onBlur={() => setStartFocused(false)}
            disabled={loading}
            autoComplete="off"
          />
          {startAddr
            ? <button className="rp-icon-btn" onClick={() => { onStartChange(''); onStartCoordChange(null); }} title="Clear">✕</button>
            : null
          }
        </div>

        {/* GPS detect row */}
        <div className="rp-gps-row">
          <button
            id="btn-detect-location"
            className={`rp-gps-detect-btn ${gpsStatus}`}
            onClick={onDetectLocation}
            disabled={loading || gpsStatus === 'loading'}
          >
            {gpsStatus === 'loading' ? (
              <><span className="rp-spinner-sm" />Detecting location…</>
            ) : gpsStatus === 'ok' ? (
              <><span>✅</span>Location detected</>
            ) : (
              <><span>📍</span>Use my current location</>
            )}
          </button>
        </div>

        {/* Separator */}
        <div className="rp-separator">
          <div className="rp-sep-line" />
          <button className="rp-swap-btn"
            title="Swap start and destination"
            onClick={() => {
              const tmp = startAddr;
              onStartChange(destAddr); onStartCoordChange(null);
              onDestChange(tmp);      onDestCoordChange(null);
            }}
            disabled={loading}
          >⇅</button>
        </div>

        {/* TO field + suggestion dropdown */}
        <div className="rp-field-wrap" ref={suggRef}>
          <div className="rp-field">
            <div className="rp-field-marker rp-marker-dest" />
            <input
              ref={destRef} id="input-destination"
              className="rp-input"
              placeholder="Search destination"
              value={destAddr}
              onChange={e => { onDestChange(e.target.value); onDestCoordChange(null); setDestFocused(true); }}
              onFocus={() => setDestFocused(true)}
              onKeyDown={handleKey}
              disabled={loading}
              autoComplete="off"
            />
            {destAddr && !loading && (
              <button className="rp-icon-btn" onClick={() => { onDestChange(''); onDestCoordChange(null); setDestFocused(false); }} title="Clear">✕</button>
            )}
          </div>

          {/* ── Suggestion dropdown ── */}
          {showSuggestions && (
            <div className="rp-suggestions" role="listbox" aria-label="Quick destinations">
              <div className="rp-sugg-header">Quick suggestions</div>
              {filteredSuggestions.map(q => (
                <button key={q.value}
                  role="option"
                  className="rp-sugg-item"
                  onMouseDown={e => { e.preventDefault(); selectSuggestion(q); }}
                >
                  <span className="rp-sugg-icon">{q.icon}</span>
                  <div className="rp-sugg-text">
                    <div className="rp-sugg-label">{highlight(q.label, query)}</div>
                    <div className="rp-sugg-sub">{q.value.split(',').slice(1).join(',').trim()}</div>
                  </div>
                  <span className="rp-sugg-arrow">›</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Error */}
      {error && <div className="rp-error" role="alert">⚠️ {error}</div>}

      {/* Find button */}
      <button id="btn-find-routes" className="rp-find-btn"
        onClick={onSearch} disabled={loading || !mapsReady}
      >
        {loading
          ? <><span className="rp-spinner" />{loadingStep || 'Analysing…'}</>
          : !mapsReady
          ? '⏳ Loading maps…'
          : '🔍 Get Safest Route'
        }
      </button>

      {/* Route results */}
      {routes.length > 0 && (
        <div className="rp-results">
          <div className="rp-results-label">{routes.length} routes found</div>
          {routes.map(r => (
            <RouteCard key={r.id} route={r}
              isSelected={selectedRoute?.id === r.id}
              color={ROUTE_COLORS[r.id] || '#00d2ff'}
              icon={ROUTE_ICONS[r.id] || '🗺️'}
              onClick={() => onSelectRoute(r)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Highlight matching text ─────────────────────
function highlight(text, query) {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query);
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rp-sugg-mark">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

// ── Route card ──────────────────────────────────
function RouteCard({ route, isSelected, color, icon, onClick }) {
  const a = route.analysis || {};
  const safety = a.safetyScore ?? 0;
  const safetyLabel = safety >= 70 ? 'Safe' : safety >= 45 ? 'Moderate' : 'Risky';
  const safetyColor = safety >= 70 ? '#00e676' : safety >= 45 ? '#ffab00' : '#ff1744';

  return (
    <button
      className={`rp-route-card ${isSelected ? 'selected' : ''}`}
      onClick={onClick}
      style={{ '--rc': color }}
      aria-pressed={isSelected}
    >
      <div className="rrc-top">
        <div className="rrc-left">
          <span className="rrc-icon">{icon}</span>
          <div>
            <div className="rrc-label">{route.label}</div>
            <div className="rrc-meta">
              {route.etaMinutes} min &nbsp;·&nbsp; {route.distanceKm} km
              {route.trafficDelayMin > 0 && <span className="rrc-delay"> +{route.trafficDelayMin}m</span>}
            </div>
          </div>
        </div>
        <div className="rrc-safety" style={{ color: safetyColor }}>
          <div className="rrc-safety-score">{safety}</div>
          <div className="rrc-safety-label">{safetyLabel}</div>
        </div>
      </div>
      <div className="rrc-bar">
        <div className="rrc-bar-fill"
          style={{ width: `${safety}%`, background: `linear-gradient(to right, ${color}55, ${color})` }} />
      </div>
      {isSelected && <div className="rrc-selected-badge">● Selected route</div>}
    </button>
  );
}
