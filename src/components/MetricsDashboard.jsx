import React from 'react';
import './MetricsDashboard.css';
import { scoreToColor, scoreToLabel, congestionToLabel } from '../aiEngine';

export default function MetricsDashboard({
  analysis, weather, police,
  timestamps = {}, refreshing = false, onRefresh, hasRoute,
}) {
  if (!analysis) return null;
  const a = analysis;

  const policeBonus    = police?.ok ? police.safetyBonus : 0;
  const weatherPenalty = weather?.ok ? weather.riskScore * 0.2 : 0;
  const safety = Math.min(100, Math.max(0,
    Math.round(a.safetyScore + policeBonus - weatherPenalty)
  ));
  const safetyColor = safety >= 70 ? '#00e676' : safety >= 45 ? '#ffab00' : '#ff1744';
  const safetyLabel = safety >= 70 ? 'Safe Route' : safety >= 45 ? 'Use Caution' : 'Risky Route';

  const isNight = (() => { const h = new Date().getHours(); return h >= 22 || h < 5; })();

  return (
    <div className="md-wrap">

      {/* Safety hero card */}
      <div className="md-safety-card" style={{ '--sc': safetyColor }}>
        <div className="md-safety-left">
          <div className="md-safety-score" style={{ color: safetyColor }}>{safety}</div>
          <div className="md-safety-out">/ 100</div>
        </div>
        <div className="md-safety-right">
          <div className="md-safety-label" style={{ color: safetyColor }}>{safetyLabel}</div>
          <div className="md-safety-bar-track">
            <div className="md-safety-bar-fill"
              style={{ width: `${safety}%`, background: `linear-gradient(to right, ${safetyColor}66, ${safetyColor})` }} />
          </div>
          <div className="md-safety-sub">
            {safety >= 70
              ? 'Good to go — road looks clear'
              : safety >= 45
              ? 'Stay alert on this route'
              : 'Consider the Safest route option'}
          </div>
        </div>
        {hasRoute && onRefresh && (
          <button className="md-refresh" onClick={onRefresh} disabled={refreshing} title="Refresh data">
            <span style={{ display: 'inline-block', animation: refreshing ? 'spin 1s linear infinite' : 'none' }}>⟳</span>
          </button>
        )}
      </div>

      {/* Quick stats row */}
      <div className="md-stats-row">
        <div className="md-stat">
          <div className="md-stat-val">{a.etaMinutes}<span className="md-stat-unit">min</span></div>
          <div className="md-stat-lbl">ETA (live)</div>
        </div>
        <div className="md-stat-div" />
        <div className="md-stat">
          <div className="md-stat-val">{a.totalDistanceKm}<span className="md-stat-unit">km</span></div>
          <div className="md-stat-lbl">Distance</div>
        </div>
        <div className="md-stat-div" />
        <div className="md-stat">
          <div className="md-stat-val" style={{ color: scoreToColor(a.avgCongestionScore) }}>
            {congestionToLabel(a.avgCongestionScore)}
          </div>
          <div className="md-stat-lbl">Traffic</div>
        </div>
      </div>

      {/* Conditions row */}
      <div className="md-conditions">
        {/* Weather */}
        <div className="md-cond-item">
          <div className="md-cond-icon">{weather?.ok ? weather.icon : '🌡️'}</div>
          <div>
            <div className="md-cond-val">
              {weather?.ok ? `${weather.tempC}°C · ${weather.label}` : 'Loading…'}
            </div>
            <div className="md-cond-lbl">Weather</div>
          </div>
        </div>

        {/* Crime level */}
        <div className="md-cond-item">
          <div className="md-cond-icon">🚨</div>
          <div>
            <div className="md-cond-val" style={{ color: scoreToColor(a.avgCrimeScore) }}>
              {scoreToLabel(a.avgCrimeScore)} risk
            </div>
            <div className="md-cond-lbl">Crime level{isNight ? ' (night)' : ''}</div>
          </div>
        </div>

        {/* Police */}
        <div className="md-cond-item">
          <div className="md-cond-icon">🚔</div>
          <div>
            <div className="md-cond-val" style={{ color: (police?.count ?? 0) > 1 ? '#00e676' : '#ffab00' }}>
              {police?.ok ? police.label : 'Checking…'}
            </div>
            <div className="md-cond-lbl">Police nearby</div>
          </div>
        </div>
      </div>

      {/* Night warning */}
      {isNight && (
        <div className="md-night-warn">
          🌙 Night hours — crime risk elevated. Stay on well-lit main roads.
        </div>
      )}
    </div>
  );
}
