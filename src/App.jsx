import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useGoogleMaps } from './hooks/useGoogleMaps';
import {
  geocodeAddress, reverseGeocode, fetchGoogleRoutes,
  parseAndAnalyzeGoogleRoutes, fetchWeather, fetchPoliceDensity,
} from './googleMapsService';
import MapView          from './components/MapView';
import RoutePanel       from './components/RoutePanel';
import MetricsDashboard from './components/MetricsDashboard';
import Header           from './components/Header';
import CityHeatmapPanel from './components/CityHeatmapPanel';
import AlertsFeed       from './components/AlertsFeed';
import { calculateCrimeRisk, predictCongestion, simulateLiveTick } from './aiEngine';
import './App.css';

// API key loaded from .env.local (gitignored) — never hardcode secrets in source
const GMAPS_API_KEY = import.meta.env.VITE_GMAPS_API_KEY || '';

const PROBE_LOCATIONS = [
  { name: 'Connaught Place', lat: 28.6139, lng: 77.2090 },
  { name: 'Paharganj',       lat: 28.6433, lng: 77.2152 },
  { name: 'Karol Bagh',      lat: 28.6304, lng: 77.2177 },
  { name: 'Rohini Zone',     lat: 28.7041, lng: 77.1025 },
  { name: 'Noida Sector 62', lat: 28.6272, lng: 77.3686 },
];

export default function App() {
  const { maps, loading: mapsLoading, error: mapsError } = useGoogleMaps(GMAPS_API_KEY);

  const [userLocation, setUserLocation] = useState(null);
  const [gpsStatus,    setGpsStatus]    = useState('idle');
  const [startAddr,    setStartAddr]    = useState('');
  const [startCoord,   setStartCoord]   = useState(null);
  const [destAddr,     setDestAddr]     = useState('');
  const [destCoord,    setDestCoord]    = useState(null);

  const [loading,          setLoading]          = useState(false);
  const [loadingStep,      setLoadingStep]       = useState('');
  const [error,            setError]            = useState('');
  const [routes,           setRoutes]           = useState([]);
  const [directionsResult, setDirectionsResult] = useState(null);
  const [selectedRoute,    setSelectedRoute]    = useState(null);
  const [liveData,         setLiveData]         = useState(null);
  const [weather,          setWeather]          = useState(null);
  const [police,           setPolice]           = useState(null);

  const [refreshing,  setRefreshing]  = useState(false);
  const [timestamps,  setTimestamps]  = useState({ traffic: null, weather: null, crime: null });

  const [tab,          setTab]          = useState('planner');
  const [currentTime,  setCurrentTime]  = useState(new Date());
  const [alerts,       setAlerts]       = useState([]);
  const [cityScore,    setCityScore]    = useState(null);
  // Mobile bottom-sheet state
  const [sheetOpen,    setSheetOpen]    = useState(true);

  const tickRef       = useRef(null);
  const trafficRef    = useRef(null);
  const weatherRef    = useRef(null);
  const alertProbeRef = useRef(null);

  // Clock
  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Initial data
  useEffect(() => {
    const crime      = calculateCrimeRisk(28.6139, 77.2090, new Date());
    const congestion = predictCongestion(28.6139, 77.2090, new Date());
    setCityScore({ crime, congestion });
    setTimestamps(t => ({ ...t, crime: new Date() }));
    setAlerts([
      { id: 1, type: 'crime',      severity: 'danger',   message: 'High incidents near Paharganj — avoid after 8 PM', time: '2m ago'  },
      { id: 2, type: 'congestion', severity: 'critical', message: 'Gridlock at Connaught Place — seek alternate route', time: '5m ago'  },
      { id: 3, type: 'safety',     severity: 'safe',     message: 'Saket area clear — low crime & free-flowing traffic', time: '9m ago'  },
      { id: 4, type: 'congestion', severity: 'moderate', message: 'Heavy traffic NH-48 near Dhaula Kuan — +18 min delay', time: '14m ago' },
    ]);
  }, []);

  // Live alert probe every 60s
  useEffect(() => {
    alertProbeRef.current = setInterval(() => {
      const now  = new Date();
      const loc  = PROBE_LOCATIONS[Math.floor(Math.random() * PROBE_LOCATIONS.length)];
      const crime      = calculateCrimeRisk(loc.lat, loc.lng, now);
      const congestion = predictCongestion(loc.lat, loc.lng, now);
      const timeStr    = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
      setTimestamps(t => ({ ...t, crime: now }));
      if (crime.score > 68) {
        setAlerts(prev => [{
          id: now.getTime(), type: 'crime',
          severity: crime.score > 82 ? 'critical' : 'danger',
          message: `[${timeStr}] Crime alert near ${loc.name} — ${crime.label} (${crime.score}/100)`,
          time: 'Just now',
        }, ...prev].slice(0, 15));
      } else if (congestion.score > 72) {
        setAlerts(prev => [{
          id: now.getTime(), type: 'congestion',
          severity: congestion.score > 85 ? 'critical' : 'moderate',
          message: `[${timeStr}] Traffic surge near ${loc.name}: +${congestion.delayMinutes}min delay`,
          time: 'Just now',
        }, ...prev].slice(0, 15));
      }
    }, 60_000);
    return () => clearInterval(alertProbeRef.current);
  }, []);

  // GPS
  const detectLocation = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setGpsStatus('denied');
      setError('Location access not supported by your browser.');
      return;
    }
    setGpsStatus('loading');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const display = maps ? await reverseGeocode(lat, lng) : 'Current Location';
        const loc = { lat, lng, display };
        setUserLocation(loc);
        setStartAddr(display);
        setStartCoord(loc);   // ← critical: set coord so no re-geocode needed
        setGpsStatus('ok');
        setError('');
      },
      (err) => {
        setGpsStatus('denied');
        const msg = err.code === 1
          ? 'Location access denied. Enable it in browser settings.'
          : 'Could not detect location. Please type your start address.';
        setError(msg);
        // Fallback: keep map centred on Delhi but don't set startCoord
        setUserLocation({ lat: 28.6139, lng: 77.2090, display: 'New Delhi' });
      },
      { timeout: 12000, maximumAge: 60000, enableHighAccuracy: false }
    );
  }, [maps]);

  useEffect(() => {
    if (maps && gpsStatus === 'idle') detectLocation();
  }, [maps, gpsStatus, detectLocation]);

  // Live tick
  useEffect(() => {
    if (!selectedRoute) return;
    tickRef.current = setInterval(() => {
      setLiveData(prev => simulateLiveTick(prev || selectedRoute));
      setTimestamps(t => ({ ...t, crime: new Date() }));
    }, 5000);
    return () => clearInterval(tickRef.current);
  }, [selectedRoute]);

  // Auto-refresh traffic every 5 min
  useEffect(() => {
    if (!startCoord || !destCoord || !maps) return;
    trafficRef.current = setInterval(async () => {
      try {
        setRefreshing(true);
        const raw = await fetchGoogleRoutes(startCoord.lat, startCoord.lng, destCoord.lat, destCoord.lng);
        const { routes: r, directionsResult: dr } = parseAndAnalyzeGoogleRoutes(raw, new Date());
        setRoutes(r); setDirectionsResult(dr);
        const upd = r.find(x => x.id === selectedRoute?.id) || r[0];
        setSelectedRoute(upd); setLiveData(upd);
        setTimestamps(t => ({ ...t, traffic: new Date() }));
      } catch (e) { console.warn('Auto-refresh failed:', e.message); }
      finally { setRefreshing(false); }
    }, 5 * 60_000);
    return () => clearInterval(trafficRef.current);
  }, [startCoord, destCoord, maps, selectedRoute?.id]);

  // Auto-refresh weather every 10 min
  useEffect(() => {
    if (!destCoord) return;
    weatherRef.current = setInterval(async () => {
      try {
        const w = await fetchWeather(destCoord.lat, destCoord.lng);
        setWeather(w);
        setTimestamps(t => ({ ...t, weather: new Date() }));
      } catch (e) { console.warn('Weather refresh failed:', e.message); }
    }, 10 * 60_000);
    return () => clearInterval(weatherRef.current);
  }, [destCoord]);

  // Manual refresh
  const handleManualRefresh = useCallback(async () => {
    if (!startCoord || !destCoord || !maps || refreshing) return;
    setRefreshing(true);
    try {
      const [raw, w, p] = await Promise.all([
        fetchGoogleRoutes(startCoord.lat, startCoord.lng, destCoord.lat, destCoord.lng),
        fetchWeather(destCoord.lat, destCoord.lng),
        fetchPoliceDensity(destCoord.lat, destCoord.lng),
      ]);
      const { routes: r, directionsResult: dr } = parseAndAnalyzeGoogleRoutes(raw, new Date());
      setRoutes(r); setDirectionsResult(dr);
      const upd = r.find(x => x.id === selectedRoute?.id) || r[0];
      setSelectedRoute(upd); setLiveData(upd);
      setWeather(w); setPolice(p);
      const now = new Date();
      setTimestamps({ traffic: now, weather: now, crime: now });
    } catch (e) { console.warn('Manual refresh failed:', e.message); }
    finally { setRefreshing(false); }
  }, [startCoord, destCoord, maps, selectedRoute?.id, refreshing]);

  // Find routes
  const handleFindRoutes = useCallback(async () => {
    if (!maps)             { setError('Google Maps still loading — please wait.'); return; }
    if (!startAddr.trim()) { setError('Please enter a starting location.'); return; }
    if (!destAddr.trim())  { setError('Please enter a destination.'); return; }
    if (startAddr.trim().toLowerCase() === destAddr.trim().toLowerCase()) {
      setError('Start and destination cannot be the same place.'); return;
    }

    setLoading(true); setError('');
    setRoutes([]); setDirectionsResult(null); setSelectedRoute(null);
    setLiveData(null); setWeather(null); setPolice(null);

    try {
      // ── Resolve origin ────────────────────────────────────
      setLoadingStep('📍 Finding start point…');
      let origin = startCoord;
      if (!origin?.lat || isNaN(origin.lat)) {
        origin = await geocodeAddress(startAddr.trim());
        setStartCoord(origin);
      }

      // ── Resolve destination ───────────────────────────────
      setLoadingStep('🎯 Finding destination…');
      let dest = destCoord;
      if (!dest?.lat || isNaN(dest.lat)) {
        dest = await geocodeAddress(destAddr.trim());
        setDestCoord(dest);
      }

      // ── Guard: ensure coords are valid ────────────────────
      if (!origin?.lat || !dest?.lat) {
        throw new Error('Could not resolve coordinates. Please re-enter the locations.');
      }

      // ── Fetch directions ──────────────────────────────────
      setLoadingStep('🚗 Getting live routes…');
      const raw = await fetchGoogleRoutes(origin.lat, origin.lng, dest.lat, dest.lng);

      // ── AI safety analysis ────────────────────────────────
      setLoadingStep('🛡️ Analysing route safety…');
      const { routes: parsed, directionsResult: dr } = parseAndAnalyzeGoogleRoutes(raw, new Date());
      if (!parsed.length) throw new Error('No routes returned. Please try different locations.');

      setRoutes(parsed);
      setDirectionsResult(dr);

      // Auto-select safest route
      const best = parsed.find(r => r.id === 'safest') || parsed[0];
      setSelectedRoute(best);
      setLiveData(best);

      // ── Weather & police (non-blocking) ───────────────────
      setLoadingStep('🌤️ Loading conditions…');
      const [wr, pr] = await Promise.allSettled([
        fetchWeather(dest.lat, dest.lng),
        fetchPoliceDensity(dest.lat, dest.lng),
      ]);
      if (wr.status === 'fulfilled') setWeather(wr.value);
      if (pr.status === 'fulfilled') setPolice(pr.value);

      const now = new Date();
      setTimestamps({ traffic: now, weather: now, crime: now });
      setSheetOpen(true);

      // ── Add to alerts feed ────────────────────────────────
      const sev = best.analysis.safetyScore >= 70 ? 'safe'
                : best.analysis.safetyScore >= 45 ? 'moderate' : 'danger';
      const fromLabel = (origin.display || startAddr).split(',')[0].trim();
      const toLabel   = (dest.display   || destAddr ).split(',')[0].trim();
      setAlerts(prev => [{
        id:       now.getTime(),
        type:     'route',
        severity: sev,
        message:  `${fromLabel} → ${toLabel}: ${best.distanceKm} km · ${best.etaMinutes} min · Safety ${best.analysis.safetyScore}/100`,
        time:     'Just now',
      }, ...prev].slice(0, 12));

    } catch (err) {
      console.error('[Route error]', err);
      setError(err.message || 'Something went wrong — please try again.');
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  }, [maps, startAddr, startCoord, destAddr, destCoord]);

  const mapOrigin      = startCoord || userLocation;
  const activeAnalysis = liveData?.analysis || selectedRoute?.analysis;
  const hasRoute       = routes.length > 0 && startCoord && destCoord;

  return (
    <div className="app-wrapper">
      <Header currentTime={currentTime} cityScore={cityScore} />

      {mapsLoading && (
        <div className="maps-loading-bar">
          <div className="maps-loading-fill" />
          <span>Connecting to Google Maps…</span>
        </div>
      )}
      {mapsError && <div className="api-error-banner">⚠️ {mapsError}</div>}

      {/* ─── DESKTOP tab nav (top) ─── */}
      <nav className="tab-nav tab-nav--top" role="tablist">
        {[
          { id: 'planner', label: '🗺️ Route Planner' },
          { id: 'heatmap', label: '🔥 City Heatmap'  },
          { id: 'alerts',  label: `🔔 Alerts (${alerts.length})` },
        ].map(t => (
          <button key={t.id} id={`tab-${t.id}`} role="tab"
            aria-selected={tab === t.id}
            className={`tab-btn ${tab === t.id ? 'active' : ''}`}
            onClick={() => { setTab(t.id); setSheetOpen(true); }}
          >{t.label}</button>
        ))}
      </nav>

      <main className="app-main">
        {/* ── ROUTE PLANNER ── */}
        {tab === 'planner' && (
          <div className="planner-layout">
            {/* Desktop sidebar */}
            <aside className="left-panel">
              <RoutePanel
                startAddr={startAddr}   onStartChange={setStartAddr}   onStartCoordChange={setStartCoord}
                destAddr={destAddr}     onDestChange={setDestAddr}      onDestCoordChange={setDestCoord}
                userLocation={userLocation} gpsStatus={gpsStatus}      onDetectLocation={detectLocation}
                onSearch={handleFindRoutes} loading={loading}           loadingStep={loadingStep}
                error={error}           mapsReady={!!maps && !mapsLoading}
                routes={routes}         selectedRoute={selectedRoute}
                onSelectRoute={r => { setSelectedRoute(r); setLiveData(r); }}
              />
              {activeAnalysis && (
                <MetricsDashboard
                  analysis={activeAnalysis} weather={weather} police={police}
                  timestamps={timestamps}   refreshing={refreshing}
                  onRefresh={handleManualRefresh} hasRoute={hasRoute}
                />
              )}
            </aside>

            {/* Map */}
            <section className="map-section" aria-label="Map">
              {maps
                ? <MapView directionsResult={directionsResult} routes={routes}
                    selectedRoute={selectedRoute} userLocation={mapOrigin} destCoord={destCoord}
                    onSelectRoute={r => { setSelectedRoute(r); setLiveData(r); }} />
                : <div className="map-placeholder"><div className="loader" /><p>Initializing…</p></div>
              }

              {/* ── Mobile bottom sheet toggle ── */}
              <button
                className="mobile-sheet-toggle"
                onClick={() => setSheetOpen(v => !v)}
                aria-label={sheetOpen ? 'Collapse panel' : 'Expand panel'}
              >
                <div className="sheet-handle" />
                {!sheetOpen && <span className="sheet-peek-label">
                  {routes.length ? `${routes.length} routes found` : 'Search routes'}
                </span>}
              </button>
            </section>

            {/* ── Mobile bottom sheet ── */}
            <div className={`mobile-sheet ${sheetOpen ? 'open' : 'peek'}`}>
              <div className="mobile-sheet-inner">
                <div className="sheet-drag-handle" onClick={() => setSheetOpen(v => !v)} />
                <RoutePanel
                  startAddr={startAddr}   onStartChange={setStartAddr}   onStartCoordChange={setStartCoord}
                  destAddr={destAddr}     onDestChange={setDestAddr}      onDestCoordChange={setDestCoord}
                  userLocation={userLocation} gpsStatus={gpsStatus}      onDetectLocation={detectLocation}
                  onSearch={handleFindRoutes} loading={loading}           loadingStep={loadingStep}
                  error={error}           mapsReady={!!maps && !mapsLoading}
                  routes={routes}         selectedRoute={selectedRoute}
                  onSelectRoute={r => { setSelectedRoute(r); setLiveData(r); setSheetOpen(false); }}
                />
                {activeAnalysis && (
                  <MetricsDashboard
                    analysis={activeAnalysis} weather={weather} police={police}
                    timestamps={timestamps} refreshing={refreshing}
                    onRefresh={handleManualRefresh} hasRoute={hasRoute}
                  />
                )}
              </div>
            </div>
          </div>
        )}

        {tab === 'heatmap' && (
          maps
            ? <CityHeatmapPanel currentTime={currentTime} />
            : <div className="map-placeholder"><div className="loader" /><p>Loading…</p></div>
        )}

        {tab === 'alerts' && <AlertsFeed alerts={alerts} />}
      </main>

      {/* ─── MOBILE bottom tab bar ─── */}
      <nav className="tab-nav tab-nav--bottom" role="tablist">
        {[
          { id: 'planner', icon: '🗺️', label: 'Route'    },
          { id: 'heatmap', icon: '🔥', label: 'Heatmap'  },
          { id: 'alerts',  icon: '🔔', label: `Alerts`   },
        ].map(t => (
          <button key={t.id} id={`mob-tab-${t.id}`} role="tab"
            aria-selected={tab === t.id}
            className={`mob-tab-btn ${tab === t.id ? 'active' : ''}`}
            onClick={() => { setTab(t.id); setSheetOpen(true); }}
          >
            <span className="mob-tab-icon">{t.icon}</span>
            <span className="mob-tab-label">{t.label}</span>
            {t.id === 'alerts' && alerts.length > 0 && (
              <span className="mob-tab-badge">{alerts.length}</span>
            )}
          </button>
        ))}
      </nav>
    </div>
  );
}
