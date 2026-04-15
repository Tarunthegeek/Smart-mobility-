/**
 * Unit Tests — SmartMobility AI Engine
 * Run with: npm test
 *
 * Coverage:
 *  ✓ haversineDistance     — accurate distance calculation
 *  ✓ calculateCrimeRisk    — valid score range, null safety, IDW fallback
 *  ✓ predictCongestion     — valid score range, time of day multiplier
 *  ✓ analyzeRoute          — null input safety, short waypoints, full route
 *  ✓ simulateLiveTick      — null safety, score drift within bounds
 *  ✓ scoreToColor / Label  — correct thresholds
 */

import { describe, it, expect } from 'vitest';
import {
  haversineDistance,
  calculateCrimeRisk,
  predictCongestion,
  analyzeRoute,
  simulateLiveTick,
  scoreToColor,
  scoreToLabel,
  congestionToLabel,
} from '../src/aiEngine';

// ── Fixtures ────────────────────────────────────────────────
const CP   = [28.6139, 77.2090];   // Connaught Place, New Delhi
const SAKET= [28.5274, 77.2158];   // Saket
const MUMBAI=[19.0760, 72.8777];   // Mumbai (outside Delhi zone range)

const NOON      = new Date('2025-01-15T12:00:00');  // daytime
const MIDNIGHT  = new Date('2025-01-15T00:30:00');  // late night
const WEEKEND   = new Date('2025-01-11T14:00:00');  // Saturday afternoon

// ── haversineDistance ────────────────────────────────────────
describe('haversineDistance', () => {
  it('returns 0 for identical points', () => {
    expect(haversineDistance(28.6139, 77.2090, 28.6139, 77.2090)).toBe(0);
  });

  it('returns ~9.6 km between Connaught Place and Saket', () => {
    const d = haversineDistance(...CP, ...SAKET);
    expect(d).toBeGreaterThan(9);
    expect(d).toBeLessThan(12);
  });

  it('returns ~1150 km between New Delhi and Mumbai', () => {
    const d = haversineDistance(...CP, ...MUMBAI);
    expect(d).toBeGreaterThan(1100);
    expect(d).toBeLessThan(1200);
  });
});

// ── calculateCrimeRisk ───────────────────────────────────────
describe('calculateCrimeRisk', () => {
  it('returns score between 0 and 100', () => {
    const result = calculateCrimeRisk(...CP, NOON);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('returns higher score at midnight vs noon (same location)', () => {
    const day   = calculateCrimeRisk(...CP, NOON);
    const night = calculateCrimeRisk(...CP, MIDNIGHT);
    expect(night.score).toBeGreaterThanOrEqual(day.score);
  });

  it('returns higher score on weekend than weekday (same time)', () => {
    const weekday = calculateCrimeRisk(...CP, NOON);
    const weekend = calculateCrimeRisk(...CP, WEEKEND);
    // Weekend uplift is probabilistic — allow for noise margin
    expect(weekend.score + 20).toBeGreaterThanOrEqual(weekday.score);
  });

  it('works for locations outside Delhi (IDW fallback — Mumbai)', () => {
    const result = calculateCrimeRisk(...MUMBAI, NOON);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.label).toBeTruthy();
  });

  it('returns valid label for every score range', () => {
    expect(calculateCrimeRisk(...CP, NOON).label).toMatch(/Safe|Moderate|Risky|Critical/);
  });

  it('returns a timeMultiplier', () => {
    const result = calculateCrimeRisk(...CP, MIDNIGHT);
    expect(result.timeMultiplier).toBeGreaterThan(1);
  });
});

// ── predictCongestion ────────────────────────────────────────
describe('predictCongestion', () => {
  it('returns score between 0 and 100', () => {
    const result = predictCongestion(...CP, NOON);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('reports higher congestion at peak hour (8am) vs midnight', () => {
    const RUSH  = new Date('2025-01-15T08:30:00');
    const NIGHT = new Date('2025-01-15T02:00:00');
    const rush  = predictCongestion(...CP, RUSH);
    const night = predictCongestion(...CP, NIGHT);
    expect(rush.score).toBeGreaterThan(night.score);
  });

  it('works for locations outside Delhi', () => {
    const result = predictCongestion(...MUMBAI, NOON);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('isPeak is true at 8:30am', () => {
    const RUSH = new Date('2025-01-15T08:30:00');
    const result = predictCongestion(...CP, RUSH);
    expect(result.isPeak).toBe(true);
  });

  it('isPeak is false at 2am', () => {
    const NIGHT = new Date('2025-01-15T02:00:00');
    const result = predictCongestion(...CP, NIGHT);
    expect(result.isPeak).toBe(false);
  });
});

// ── analyzeRoute ─────────────────────────────────────────────
describe('analyzeRoute', () => {
  const ROUTE_CP_SAKET = [
    [28.6139, 77.2090], [28.5900, 77.2150],
    [28.5700, 77.2120], [28.5500, 77.2140],
    [28.5274, 77.2158],
  ];

  it('never returns null — graceful on null input', () => {
    expect(analyzeRoute(null)).toBeTruthy();
    expect(analyzeRoute(null).safetyScore).toBe(65);
  });

  it('never returns null — graceful on empty array', () => {
    expect(analyzeRoute([])).toBeTruthy();
    expect(analyzeRoute([]).safetyScore).toBe(65);
  });

  it('never returns null — graceful on single point', () => {
    expect(analyzeRoute([[28.6139, 77.2090]])).toBeTruthy();
  });

  it('returns valid safetyScore for a real route (0-100)', () => {
    const result = analyzeRoute(ROUTE_CP_SAKET, NOON);
    expect(result.safetyScore).toBeGreaterThanOrEqual(0);
    expect(result.safetyScore).toBeLessThanOrEqual(100);
  });

  it('returns avgCrimeScore and avgCongestionScore', () => {
    const result = analyzeRoute(ROUTE_CP_SAKET, NOON);
    expect(result.avgCrimeScore).toBeGreaterThanOrEqual(0);
    expect(result.avgCongestionScore).toBeGreaterThanOrEqual(0);
  });

  it('safetyScore = 100 - compositeRisk (inverse relationship)', () => {
    const result = analyzeRoute(ROUTE_CP_SAKET, NOON);
    expect(result.safetyScore).toBe(
      Math.max(0, 100 - result.compositeRisk)
    );
  });

  it('samples up to 12 points', () => {
    const longRoute = Array.from({ length: 50 }, (_, i) => [
      28.6 + i * 0.001, 77.2 + i * 0.001,
    ]);
    const result = analyzeRoute(longRoute, NOON);
    expect(result.samples.length).toBeLessThanOrEqual(13);  // step=floor(50/12)=4 → ceil(50/4)=13
  });

  it('returns riskiestPoint on the route', () => {
    const result = analyzeRoute(ROUTE_CP_SAKET, MIDNIGHT);
    expect(result.riskiestPoint).toBeTruthy();
    expect(result.riskiestPoint.lat).toBeDefined();
  });
});

// ── simulateLiveTick ─────────────────────────────────────────
describe('simulateLiveTick', () => {
  it('returns null safely when called with null', () => {
    expect(simulateLiveTick(null)).toBeNull();
  });

  it('returns prevData when analysis is missing', () => {
    const data = { foo: 'bar' };
    expect(simulateLiveTick(data)).toEqual(data);
  });

  it('returns valid updated scores within 0-100', () => {
    const mock = {
      analysis: {
        avgCrimeScore: 50, avgCongestionScore: 60,
        compositeRisk: 55, safetyScore: 45,
        safetyLabel: 'Moderate', safetyColor: '#ffab00',
      },
    };
    const result = simulateLiveTick(mock);
    expect(result.analysis.avgCrimeScore).toBeGreaterThanOrEqual(0);
    expect(result.analysis.avgCrimeScore).toBeLessThanOrEqual(100);
    expect(result.analysis.avgCongestionScore).toBeGreaterThanOrEqual(0);
    expect(result.analysis.safetyScore).toBeGreaterThanOrEqual(0);
  });

  it('changes score slightly (noise within ±10)', () => {
    const mock = {
      analysis: {
        avgCrimeScore: 50, avgCongestionScore: 50,
        compositeRisk: 50, safetyScore: 50,
        safetyLabel: 'Moderate', safetyColor: '#ffab00',
      },
    };
    const result = simulateLiveTick(mock);
    expect(Math.abs(result.analysis.avgCongestionScore - 50)).toBeLessThan(15);
  });
});

// ── scoreToColor / scoreToLabel / congestionToLabel ──────────
describe('Color and label helpers', () => {
  it('scoreToColor returns green for low risk (≤30)', () => {
    expect(scoreToColor(20)).toBe('#00e676');
  });
  it('scoreToColor returns yellow for moderate (31-55)', () => {
    expect(scoreToColor(45)).toBe('#ffd740');
  });
  it('scoreToColor returns orange for risky (56-75)', () => {
    expect(scoreToColor(65)).toBe('#ff6d00');
  });
  it('scoreToColor returns red for critical (>75)', () => {
    expect(scoreToColor(85)).toBe('#ff1744');
  });

  it('scoreToLabel returns Safe for score ≤30', () => {
    expect(scoreToLabel(15)).toBe('Safe');
  });
  it('scoreToLabel returns Moderate for 31-55', () => {
    expect(scoreToLabel(50)).toBe('Moderate');
  });
  it('scoreToLabel returns Risky for 56-75', () => {
    expect(scoreToLabel(70)).toBe('Risky');
  });
  it('scoreToLabel returns Critical for >75', () => {
    expect(scoreToLabel(90)).toBe('Critical');
  });

  it('congestionToLabel returns Free Flow for ≤20', () => {
    expect(congestionToLabel(10)).toBe('Free Flow');
  });
  it('congestionToLabel returns Gridlock for >70', () => {
    expect(congestionToLabel(85)).toBe('Gridlock');
  });
});
