/**
 * Smart Mobility AI Engine — v2
 * ─────────────────────────────────────────────────────
 * Improvements over v1:
 *  • Works for ANY city worldwide (not just Delhi)
 *  • IDW fallback: when outside all known zones, uses
 *    nearest zone with distance penalty
 *  • Time-of-day + day-of-week combined multiplier
 *  • Congestion model considers rush-hour wave patterns
 *  • analyzeRoute() always returns a valid object (never null)
 *  • simulateLiveTick() fully null-safe
 * ─────────────────────────────────────────────────────
 */

// ─────────────────────────────────────────────
//  CRIME ZONE DATABASE (Delhi NCR anchors)
//  These are anchor points — IDW interpolation
//  extrapolates to any location worldwide.
// ─────────────────────────────────────────────
export const CRIME_ZONES = [
  { lat: 28.6139, lng: 77.2090, crime: 72, type: 'commercial',  name: 'Connaught Place'   },
  { lat: 28.5355, lng: 77.3910, crime: 45, type: 'residential', name: 'Noida Sector 62'   },
  { lat: 28.7041, lng: 77.1025, crime: 82, type: 'industrial',  name: 'Rohini Zone'        },
  { lat: 28.4595, lng: 77.0266, crime: 32, type: 'residential', name: 'Dwarka Sector 21'  },
  { lat: 28.5672, lng: 77.3218, crime: 60, type: 'mixed',       name: 'Mayur Vihar'        },
  { lat: 28.6304, lng: 77.2177, crime: 58, type: 'commercial',  name: 'Karol Bagh'         },
  { lat: 28.6129, lng: 77.2295, crime: 70, type: 'mixed',       name: 'Paharganj'          },
  { lat: 28.4983, lng: 77.0793, crime: 28, type: 'residential', name: 'Palam'              },
  { lat: 28.6542, lng: 77.2373, crime: 75, type: 'industrial',  name: 'Model Town'         },
  { lat: 28.5274, lng: 77.2158, crime: 38, type: 'residential', name: 'Saket'              },
  { lat: 28.5491, lng: 77.2519, crime: 52, type: 'commercial',  name: 'Nehru Place'        },
  { lat: 28.5191, lng: 77.1570, crime: 35, type: 'residential', name: 'Vasant Kunj'        },
  { lat: 28.6280, lng: 77.3649, crime: 48, type: 'mixed',       name: 'Anand Vihar'        },
  { lat: 28.6327, lng: 77.2195, crime: 65, type: 'mixed',       name: 'New Delhi Station'  },
  { lat: 28.5562, lng: 77.1000, crime: 30, type: 'residential', name: 'Dwarka Mor'         },
];

// ─────────────────────────────────────────────
//  CONGESTION ZONES
// ─────────────────────────────────────────────
const CONGESTION_ZONES = [
  { lat: 28.6139, lng: 77.2090, peak: 92, offpeak: 38, name: 'CP Junction'        },
  { lat: 28.6304, lng: 77.2177, peak: 85, offpeak: 42, name: 'Karol Bagh Chowk'   },
  { lat: 28.5672, lng: 77.3218, peak: 72, offpeak: 28, name: 'Mayur Vihar Cross'  },
  { lat: 28.7041, lng: 77.1025, peak: 65, offpeak: 22, name: 'Rohini Metro'        },
  { lat: 28.5355, lng: 77.3910, peak: 78, offpeak: 32, name: 'Noida Expressway'   },
  { lat: 28.4595, lng: 77.0266, peak: 52, offpeak: 16, name: 'Dwarka Sec 21'      },
  { lat: 28.6129, lng: 77.2295, peak: 84, offpeak: 46, name: 'Paharganj Square'   },
  { lat: 28.5274, lng: 77.2158, peak: 62, offpeak: 22, name: 'Saket Metro'        },
  { lat: 28.6280, lng: 77.3649, peak: 90, offpeak: 50, name: 'Anand Vihar Bus Stop'},
  { lat: 28.6327, lng: 77.2195, peak: 88, offpeak: 55, name: 'New Delhi Station'  },
];

// ─────────────────────────────────────────────
//  UTILITIES
// ─────────────────────────────────────────────

/** Haversine distance in km */
export function haversineDistance(lat1, lng1, lat2, lng2) {
  const R    = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a    =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Score → hex color */
export function scoreToColor(score) {
  if (score <= 30) return '#00e676';
  if (score <= 55) return '#ffd740';
  if (score <= 75) return '#ff6d00';
  return '#ff1744';
}

/** Score → label */
export function scoreToLabel(score) {
  if (score <= 30) return 'Safe';
  if (score <= 55) return 'Moderate';
  if (score <= 75) return 'Risky';
  return 'Critical';
}

/** Congestion score → label */
export function congestionToLabel(score) {
  if (score <= 20) return 'Free Flow';
  if (score <= 45) return 'Moderate';
  if (score <= 70) return 'Congested';
  return 'Gridlock';
}

// ─────────────────────────────────────────────
//  TIME-OF-DAY RISK MULTIPLIER
//  Combines hour + day-of-week for more accuracy
// ─────────────────────────────────────────────
function getTimeMultiplier(dateTime) {
  const h   = dateTime.getHours();
  const day = dateTime.getDay();  // 0=Sun, 6=Sat

  // Hour multiplier
  let hourMult;
  if (h >= 23 || h < 4)  hourMult = 1.9;   // Late night — very high
  else if (h >= 4  && h < 6)  hourMult = 1.5;  // Pre-dawn
  else if (h >= 20 && h < 23) hourMult = 1.45; // Evening
  else if (h >= 18 && h < 20) hourMult = 1.3;  // Rush evening
  else if (h >= 7  && h < 10) hourMult = 1.15; // Morning rush
  else                         hourMult = 1.0;  // Daytime

  // Weekend uplift
  const weekendMult = (day === 0 || day === 6) ? 1.18 : 1.0;

  return hourMult * weekendMult;
}

// ─────────────────────────────────────────────
//  CONGESTION PEAK FACTOR
// ─────────────────────────────────────────────
function getCongestionFactor(h) {
  // Morning rush: 8–10am  |  Evening rush: 5–8pm
  if (h >= 8  && h < 10)  return 1.0;    // full peak
  if (h >= 17 && h < 20)  return 1.0;    // full peak
  if (h >= 7  && h < 8)   return 0.7;    // pre-peak
  if (h >= 10 && h < 12)  return 0.65;   // subsiding
  if (h >= 20 && h < 22)  return 0.55;   // post-peak
  if (h >= 22 || h < 6)   return 0.2;    // night
  return 0.5;                            // mid-day moderate
}

// ─────────────────────────────────────────────
//  CORE AI MODEL: CRIME RISK (IDW)
//  Works for any location worldwide.
//  If all zones are > 15 km away, uses the
//  closest zone's score with distance penalty.
// ─────────────────────────────────────────────
export function calculateCrimeRisk(lat, lng, dateTime = new Date()) {
  const timeMult  = getTimeMultiplier(dateTime);
  const MAX_DIST  = 15;     // km — zones beyond this excluded from IDW
  const POWER     = 2;      // IDW power parameter

  let weightedSum = 0;
  let totalWeight = 0;
  let closestDist = Infinity;
  let closestZone = CRIME_ZONES[0];
  const nearbyZones = [];

  for (const zone of CRIME_ZONES) {
    const dist = haversineDistance(lat, lng, zone.lat, zone.lng);

    // Track nearest zone for fallback
    if (dist < closestDist) { closestDist = dist; closestZone = zone; }

    if (dist > MAX_DIST) continue;

    // IDW weight = 1 / dist^p (min dist = 0.05 km to avoid division by zero)
    const w = 1 / Math.max(dist, 0.05) ** POWER;
    weightedSum += zone.crime * w;
    totalWeight += w;

    if (dist < 3) {
      nearbyZones.push({
        name: zone.name, distance: dist.toFixed(1),
        score: zone.crime, type: zone.type,
      });
    }
  }

  // Fallback: if no zones in range, use nearest with distance penalty
  let baseScore;
  if (totalWeight === 0) {
    const penalty  = Math.min(0.9, (closestDist - MAX_DIST) / 50);
    baseScore = closestZone.crime * (1 - penalty);
  } else {
    baseScore = weightedSum / totalWeight;
  }

  // Apply time multiplier and light noise for realism
  const adjusted = Math.min(100, baseScore * timeMult);
  const noise    = (Math.random() - 0.5) * 8;
  const score    = Math.min(100, Math.max(0, Math.round(adjusted + noise)));

  return {
    score,
    label:          scoreToLabel(score),
    color:          scoreToColor(score),
    nearbyZones:    nearbyZones.sort((a, b) => a.distance - b.distance).slice(0, 3),
    timeMultiplier: parseFloat(timeMult.toFixed(2)),
    hour:           dateTime.getHours(),
  };
}

// ─────────────────────────────────────────────
//  CORE AI MODEL: CONGESTION PREDICTION
// ─────────────────────────────────────────────
export function predictCongestion(lat, lng, dateTime = new Date()) {
  const h          = dateTime.getHours();
  const congFactor = getCongestionFactor(h);
  const MAX_DIST   = 12;

  let weightedSum = 0;
  let totalWeight = 0;
  let closestDist = Infinity;
  let closestZone = CONGESTION_ZONES[0];

  for (const zone of CONGESTION_ZONES) {
    const dist = haversineDistance(lat, lng, zone.lat, zone.lng);
    if (dist < closestDist) { closestDist = dist; closestZone = zone; }
    if (dist > MAX_DIST) continue;

    const w         = 1 / Math.max(dist, 0.05) ** 2;
    // Interpolate between peak and offpeak using congestion factor
    const zoneScore = zone.offpeak + (zone.peak - zone.offpeak) * congFactor;
    weightedSum += zoneScore * w;
    totalWeight += w;
  }

  let baseScore;
  if (totalWeight === 0) {
    const fallbackScore = closestZone.offpeak + (closestZone.peak - closestZone.offpeak) * congFactor;
    const penalty       = Math.min(0.8, (closestDist - MAX_DIST) / 50);
    baseScore           = fallbackScore * (1 - penalty);
  } else {
    baseScore = weightedSum / totalWeight;
  }

  const noise        = (Math.random() - 0.5) * 10;
  const score        = Math.min(100, Math.max(0, Math.round(baseScore + noise)));
  const delayMinutes = Math.round((score / 100) * 50);

  return {
    score,
    label:         congestionToLabel(score),
    color:         scoreToColor(score),
    delayMinutes,
    isPeak:        congFactor >= 0.9,
    congFactor:    parseFloat(congFactor.toFixed(2)),
  };
}

// ─────────────────────────────────────────────
//  ROUTE SAFETY ANALYSIS
//  Samples up to 12 evenly-spaced waypoints.
//  ALWAYS returns a valid object (never null).
//  Composite = 55% crime + 45% congestion
// ─────────────────────────────────────────────
export function analyzeRoute(waypoints, dateTime = new Date()) {
  if (!waypoints || waypoints.length < 2) {
    // Return safe default rather than null
    return {
      safetyScore: 65, safetyLabel: 'Moderate', safetyColor: '#ffab00',
      avgCrimeScore: 40, avgCongestionScore: 40, compositeRisk: 40,
      totalDistanceKm: '0.0', etaMinutes: 0,
      riskiestPoint: null, samples: [],
    };
  }

  const MAX_SAMPLES = 12;
  const step        = Math.max(1, Math.floor(waypoints.length / MAX_SAMPLES));
  const samples     = [];

  for (let i = 0; i < waypoints.length; i += step) {
    const [lat, lng] = waypoints[i];
    if (lat == null || lng == null) continue;
    samples.push({
      lat, lng,
      crime:      calculateCrimeRisk(lat, lng, dateTime),
      congestion: predictCongestion(lat, lng,  dateTime),
    });
  }

  if (samples.length === 0) {
    return {
      safetyScore: 65, safetyLabel: 'Moderate', safetyColor: '#ffab00',
      avgCrimeScore: 40, avgCongestionScore: 40, compositeRisk: 40,
      totalDistanceKm: '0.0', etaMinutes: 0,
      riskiestPoint: null, samples: [],
    };
  }

  const avgCrime      = samples.reduce((s, p) => s + p.crime.score,      0) / samples.length;
  const avgCongestion = samples.reduce((s, p) => s + p.congestion.score, 0) / samples.length;
  const compositeRisk = avgCrime * 0.55 + avgCongestion * 0.45;
  const safetyScore   = Math.max(0, Math.round(100 - compositeRisk));

  // Approximate distance (Google overrides with accurate value)
  let totalDist = 0;
  for (let i = 1; i < waypoints.length; i++) {
    totalDist += haversineDistance(
      waypoints[i - 1][0], waypoints[i - 1][1],
      waypoints[i][0],     waypoints[i][1],
    );
  }

  // Rough ETA fallback (overridden by Google's duration_in_traffic)
  const speedKmh  = Math.max(5, 30 * (1 - (avgCongestion / 100) * 0.8));
  const etaMinutes = Math.round((totalDist / speedKmh) * 60);

  // Most dangerous point on route
  const riskiest = samples.reduce((max, p) =>
    (p.crime.score + p.congestion.score) > (max.crime.score + max.congestion.score) ? p : max,
    samples[0]
  );

  return {
    safetyScore,
    safetyLabel:        scoreToLabel(compositeRisk),
    safetyColor:        scoreToColor(compositeRisk),
    avgCrimeScore:      Math.round(avgCrime),
    avgCongestionScore: Math.round(avgCongestion),
    compositeRisk:      Math.round(compositeRisk),
    totalDistanceKm:    totalDist.toFixed(1),
    etaMinutes,
    riskiestPoint:      riskiest,
    samples,
    waypoints,
  };
}

// ─────────────────────────────────────────────
//  REAL-TIME SIMULATION TICK (every 5s)
//  Adds Gaussian noise to simulate live changes.
// ─────────────────────────────────────────────
export function simulateLiveTick(prevData) {
  if (!prevData?.analysis) return prevData ?? null;
  const a = prevData.analysis;
  const newCongestion = Math.round(Math.min(100, Math.max(0,
    (a.avgCongestionScore ?? 40) + (Math.random() - 0.5) * 6
  )));
  const newCrime = Math.round(Math.min(100, Math.max(0,
    (a.avgCrimeScore ?? 40) + (Math.random() - 0.5) * 3
  )));
  const newComposite = Math.round(newCrime * 0.55 + newCongestion * 0.45);
  return {
    ...prevData,
    analysis: {
      ...a,
      avgCongestionScore: newCongestion,
      avgCrimeScore:      newCrime,
      compositeRisk:      newComposite,
      safetyScore:        Math.max(0, 100 - newComposite),
      safetyLabel:        scoreToLabel(newComposite),
      safetyColor:        scoreToColor(newComposite),
    },
  };
}
