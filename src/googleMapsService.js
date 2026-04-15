/**
 * Google Maps Service Layer — Production Ready
 * ─────────────────────────────────────────────────────────────
 * APIs:
 *  • Google Maps Directions   — real-time traffic routing
 *  • Google Maps Geocoder     — address ↔ coordinates
 *  • Open-Meteo (free/no key) — real-time weather
 *  • Overpass   (free/no key) — OSM police station density
 * ─────────────────────────────────────────────────────────────
 */

import { analyzeRoute } from './aiEngine';

// ── Timeout-safe fetch (AbortController works everywhere) ──
function fetchWithTimeout(url, ms = 8000) {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

// ─────────────────────────────────────────────
//  GEOCODING
// ─────────────────────────────────────────────
/**
 * geocodeAddress — multi-strategy geocoder for complex/long addresses.
 * Strategy 1: Full address + India restriction (most accurate)
 * Strategy 2: Full address without restriction (broader search)
 * Strategy 3: Cleaned address (first 2 meaningful parts) without restriction
 *
 * This ensures long/complicated addresses like:
 * "Plot No. 45, Block B, Sector 18, Noida, Uttar Pradesh 201301"
 * reliably resolve to correct coordinates.
 */
export function geocodeAddress(address) {
  return new Promise((resolve, reject) => {
    if (!window.google?.maps?.Geocoder) {
      reject(new Error('Google Maps not loaded yet.')); return;
    }
    const gc = new window.google.maps.Geocoder();

    // Clean helper: strip extra whitespace/punctuation
    const clean = (addr) => addr.trim().replace(/\s+/g, ' ');

    // Attempt geocode — returns Promise<result|null>
    const attempt = (query, opts) => new Promise(res => {
      gc.geocode({ address: clean(query), ...opts }, (results, status) => {
        if (status === 'OK' && results?.[0]) {
          const loc = results[0].geometry.location;
          res({ lat: loc.lat(), lng: loc.lng(), display: results[0].formatted_address });
        } else {
          res(null);
        }
      });
    });

    // Build a simplified version of the address (last N comma-parts are often pin/state)
    const parts      = address.split(',').map(p => p.trim()).filter(Boolean);
    // Try dropping leading hyper-specific parts (plot numbers, flat numbers)
    const simplified = parts.length > 3
      ? parts.slice(Math.max(0, parts.length - 3)).join(', ')
      : address;

    // Run strategies in series, resolve on first success
    attempt(address, { componentRestrictions: { country: 'IN' } })
      .then(r => r || attempt(address, {}))
      .then(r => r || attempt(simplified, {}))
      .then(r => {
        if (r) resolve(r);
        else reject(new Error(`"${parts[0] || address}" could not be found. Try a shorter or more common address.`));
      });
  });
}

// ─────────────────────────────────────────────
//  REVERSE GEOCODING — returns full address
//  so it can be reliably re-geocoded later
// ─────────────────────────────────────────────
export function reverseGeocode(lat, lng) {
  return new Promise((resolve) => {
    if (!window.google?.maps?.Geocoder) { resolve('Current Location'); return; }
    new window.google.maps.Geocoder().geocode(
      { location: { lat, lng } },
      (results, status) => {
        resolve(
          status === 'OK' && results?.[0]
            ? results[0].formatted_address
            : 'Current Location'
        );
      }
    );
  });
}

// ─────────────────────────────────────────────
//  ROUTING — Google Directions API
//  Auto-retries without alternatives on failure.
// ─────────────────────────────────────────────
const DIRECTIONS_ERRORS = {
  NOT_FOUND:                 'One or both locations could not be found. Try a more specific address.',
  ZERO_RESULTS:              'No driving route exists between these locations.',
  MAX_ROUTE_LENGTH_EXCEEDED: 'Route too long. Try a closer destination.',
  MAX_WAYPOINTS_EXCEEDED:    'Too many stops on this route.',
  REQUEST_DENIED:            'Directions API not enabled — check Google Cloud Console.',
  OVER_DAILY_LIMIT:          'API daily quota exceeded. Try again tomorrow.',
  OVER_QUERY_LIMIT:          'Too many requests. Wait a moment and try again.',
  INVALID_REQUEST:           'Invalid route — make sure start ≠ destination.',
  UNKNOWN_ERROR:             'Routing error. Please try again.',
};

function callDirections(svc, request) {
  return new Promise((resolve, reject) => {
    svc.route(request, (result, status) => {
      if (status === 'OK' && result?.routes?.length) {
        resolve(result);
      } else {
        const err = new Error(DIRECTIONS_ERRORS[status] || `Routing failed (${status}).`);
        err.status = status;
        reject(err);
      }
    });
  });
}

export async function fetchGoogleRoutes(originLat, originLng, destLat, destLng) {
  if (!window.google?.maps?.DirectionsService)
    throw new Error('Google Maps not ready.');

  // Validate coordinates
  const vals = [originLat, originLng, destLat, destLng];
  if (vals.some(v => v == null || isNaN(v) || !isFinite(v)))
    throw new Error('Invalid coordinates — please re-enter your locations.');
  if (Math.abs(originLat) < 0.001 && Math.abs(originLng) < 0.001)
    throw new Error('Start location coordinates are invalid. Use the search box.');
  if (Math.abs(destLat) < 0.001 && Math.abs(destLng) < 0.001)
    throw new Error('Destination coordinates are invalid. Use the search box.');
  if (Math.abs(originLat - destLat) < 0.0001 && Math.abs(originLng - destLng) < 0.0001)
    throw new Error('Start and destination are the same location.');

  const svc     = new window.google.maps.DirectionsService();
  const baseReq = {
    origin:      new window.google.maps.LatLng(originLat, originLng),
    destination: new window.google.maps.LatLng(destLat, destLng),
    travelMode:  window.google.maps.TravelMode.DRIVING,
    drivingOptions: {
      departureTime: new Date(),
      trafficModel:  window.google.maps.TrafficModel.BEST_GUESS,
    },
    unitSystem: window.google.maps.UnitSystem.METRIC,
  };

  // Try with alternatives first; retry without on specific errors
  try {
    return await callDirections(svc, { ...baseReq, provideRouteAlternatives: true });
  } catch (err) {
    if (['MAX_ROUTE_LENGTH_EXCEEDED', 'UNKNOWN_ERROR', 'INVALID_REQUEST'].includes(err.status)) {
      return await callDirections(svc, { ...baseReq, provideRouteAlternatives: false });
    }
    throw err;
  }
}

// ─────────────────────────────────────────────
//  PARSE + RANK GOOGLE ROUTES WITH AI
//
//  CRITICAL FIX: Google returns routes in ITS OWN
//  order — NOT by speed or safety. We MUST:
//    1. Parse all routes
//    2. Run AI analysis on each
//    3. RANK by actual metrics:
//       • Fastest  = lowest ETA
//       • Safest   = highest safety score
//       • Balanced = best combined rank
//    4. Use routeIndex to match DirectionsRenderer
//       to the correct entry in directionsResult.routes[]
// ─────────────────────────────────────────────
export function parseAndAnalyzeGoogleRoutes(directionsResult, dateTime = new Date()) {

  // Step 1 — Parse & AI-analyse every returned Google route
  const candidates = directionsResult.routes.slice(0, 3)
    .map((gRoute, i) => {
      const leg = gRoute.legs?.[0];
      if (!leg) return null;

      const waypoints  = (gRoute.overview_path || []).map(p => [p.lat(), p.lng()]);
      const distanceKm = (leg.distance.value / 1000).toFixed(1);
      const baseMin    = Math.round(leg.duration.value / 60);
      const trafficMin = leg.duration_in_traffic
        ? Math.round(leg.duration_in_traffic.value / 60)
        : baseMin;
      const delayMin   = Math.max(0, trafficMin - baseMin);

      const steps = (leg.steps || []).map(s => ({
        instruction: (s.instructions || '').replace(/<[^>]*>/g, '').trim(),
        distanceKm:  (s.distance?.value / 1000).toFixed(1),
        durationMin: Math.round((s.duration?.value || 0) / 60),
      })).filter(s => s.instruction);

      // AI analysis (always returns valid object, never null)
      const rawAI = analyzeRoute(waypoints, dateTime);
      const analysis = {
        ...rawAI,
        etaMinutes:      trafficMin,
        totalDistanceKm: distanceKm,
      };

      return {
        _googleRouteIndex: i,      // real index in directionsResult.routes[]
        waypoints,
        distanceKm,
        baseDurMin:      baseMin,
        trafficDelayMin: delayMin,
        etaMinutes:      trafficMin,
        steps,
        analysis,
        // ranking keys
        _safetyScore: analysis.safetyScore,
        _eta:         trafficMin,
      };
    })
    .filter(Boolean);

  if (candidates.length === 0) return { routes: [], directionsResult };

  // Step 2 — Rank: assign Fastest / Safest / Balanced roles
  const n = candidates.length;

  // Sort copies for ranking
  const byETA    = [...candidates].sort((a, b) => a._eta - b._eta);
  const bySafety = [...candidates].sort((a, b) => b._safetyScore - a._safetyScore);

  // Assign roles. Use a set to avoid duplicate assignments.
  const assigned = new Map(); // _googleRouteIndex → role

  // Fastest = best (lowest) ETA
  assigned.set(byETA[0]._googleRouteIndex, { id: 'fastest', label: 'Fastest', icon: '⚡' });

  // Safest = best (highest) safety score — may be same route if only 1
  if (!assigned.has(bySafety[0]._googleRouteIndex)) {
    assigned.set(bySafety[0]._googleRouteIndex, { id: 'safest', label: 'Safest', icon: '🛡️' });
  } else if (n > 1 && !assigned.has(bySafety[1]._googleRouteIndex)) {
    assigned.set(bySafety[1]._googleRouteIndex, { id: 'safest', label: 'Safest', icon: '🛡️' });
  }

  // Balanced = whichever is left (or the best combined-score if only 1 remaining)
  for (const c of candidates) {
    if (!assigned.has(c._googleRouteIndex)) {
      assigned.set(c._googleRouteIndex, { id: 'balanced', label: 'Balanced', icon: '⚖️' });
    }
  }

  // If only 1 or 2 candidates, some may still be unassigned — fill with fallback labels
  const FALLBACK = [
    { id: 'fastest',  label: 'Fastest',  icon: '⚡'  },
    { id: 'safest',   label: 'Safest',   icon: '🛡️' },
    { id: 'balanced', label: 'Balanced', icon: '⚖️'  },
  ];
  candidates.forEach((c, fi) => {
    if (!assigned.has(c._googleRouteIndex)) {
      assigned.set(c._googleRouteIndex, FALLBACK[fi] || FALLBACK[2]);
    }
  });

  // Step 3 — Build final route objects in display order: fastest → balanced → safest
  const DISPLAY_ORDER = ['fastest', 'balanced', 'safest'];
  const routesByRole  = new Map();
  candidates.forEach(c => {
    const role = assigned.get(c._googleRouteIndex);
    if (!routesByRole.has(role.id)) {
      routesByRole.set(role.id, {
        ...role,
        routeIndex:      c._googleRouteIndex,  // ← maps to directionsResult.routes[i]
        waypoints:       c.waypoints,
        distanceKm:      c.distanceKm,
        baseDurMin:      c.baseDurMin,
        trafficDelayMin: c.trafficDelayMin,
        etaMinutes:      c.etaMinutes,
        steps:           c.steps,
        analysis:        c.analysis,
      });
    }
  });

  const routes = DISPLAY_ORDER
    .filter(id => routesByRole.has(id))
    .map(id => routesByRole.get(id));

  return { routes, directionsResult };
}

// ─────────────────────────────────────────────
//  WEATHER — Open-Meteo (free, no key)
// ─────────────────────────────────────────────
const WMO_CODES = {
  0:  { label: 'Clear Sky',        icon: '☀️',  risk: 0  },
  1:  { label: 'Mainly Clear',     icon: '🌤️',  risk: 0  },
  2:  { label: 'Partly Cloudy',    icon: '⛅',  risk: 5  },
  3:  { label: 'Overcast',         icon: '☁️',  risk: 8  },
  45: { label: 'Foggy',            icon: '🌫️',  risk: 30 },
  48: { label: 'Icy Fog',          icon: '🌫️',  risk: 40 },
  51: { label: 'Light Drizzle',    icon: '🌦️',  risk: 20 },
  53: { label: 'Moderate Drizzle', icon: '🌧️',  risk: 25 },
  55: { label: 'Dense Drizzle',    icon: '🌧️',  risk: 30 },
  61: { label: 'Light Rain',       icon: '🌧️',  risk: 25 },
  63: { label: 'Moderate Rain',    icon: '🌧️',  risk: 35 },
  65: { label: 'Heavy Rain',       icon: '⛈️',  risk: 50 },
  80: { label: 'Rain Showers',     icon: '🌦️',  risk: 30 },
  81: { label: 'Heavy Showers',    icon: '⛈️',  risk: 45 },
  95: { label: 'Thunderstorm',     icon: '⛈️',  risk: 60 },
  99: { label: 'Severe Storm',     icon: '🌪️',  risk: 70 },
};

export async function fetchWeather(lat, lng) {
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${lat}&longitude=${lng}` +
      `&current=temperature_2m,precipitation,weathercode,windspeed_10m,relative_humidity_2m` +
      `&timezone=Asia%2FKolkata&forecast_days=1`;

    const res = await fetchWithTimeout(url, 7000);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const c    = data?.current;
    if (!c || c.weathercode == null) throw new Error('Bad weather response');

    const wmo          = WMO_CODES[c.weathercode] ?? { label: 'Unknown', icon: '🌡️', risk: 0 };
    const humidity     = c.relative_humidity_2m ?? 0;
    const humidityRisk = humidity > 85 ? 15 : humidity > 70 ? 8 : 0;
    const riskScore    = Math.min(100, wmo.risk + humidityRisk);

    return {
      ok:            true,
      tempC:         Math.round(c.temperature_2m ?? 0),
      precipitation: c.precipitation ?? 0,
      windKmh:       Math.round(c.windspeed_10m ?? 0),
      humidity,
      code:          c.weathercode,
      label:         wmo.label,
      icon:          wmo.icon,
      riskScore,
      riskLabel:     riskScore < 15 ? 'Good' : riskScore < 35 ? 'Caution' : riskScore < 60 ? 'Risky' : 'Dangerous',
    };
  } catch {
    return { ok: false, label: 'Unavailable', icon: '🌡️', riskScore: 0, riskLabel: 'N/A' };
  }
}

// ─────────────────────────────────────────────
//  POLICE DENSITY — Overpass / OSM
// ─────────────────────────────────────────────
export async function fetchPoliceDensity(lat, lng, radiusKm = 3) {
  try {
    const deg   = radiusKm / 111;
    const [s, n, w, e] = [lat - deg, lat + deg, lng - deg, lng + deg];
    const query = `[out:json][timeout:10];(node["amenity"="police"](${s},${w},${n},${e});way["amenity"="police"](${s},${w},${n},${e}););out count;`;
    const url   = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;

    const res  = await fetchWithTimeout(url, 9000);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const rawTotal    = data?.elements?.[0]?.tags?.total;
    const count       = rawTotal != null ? parseInt(rawTotal, 10) : (data?.elements?.length ?? 0);
    const safetyBonus = Math.min(20, count * 4);

    return {
      ok: true, count, safetyBonus,
      label: count === 0 ? 'None nearby' : count === 1 ? '1 station' : `${count} stations`,
      level: count === 0 ? 'Low' : count <= 2 ? 'Moderate' : 'High',
    };
  } catch {
    return { ok: false, count: 0, safetyBonus: 0, label: 'N/A', level: 'Unknown' };
  }
}
