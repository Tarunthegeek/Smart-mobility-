import React, { useState } from 'react';
import './AlertsFeed.css';

const TYPE_META = {
  crime:     { icon: '🚨', color: 'var(--critical-color)' },
  congestion:{ icon: '🚗', color: 'var(--moderate-color)' },
  safety:    { icon: '🛡️', color: 'var(--safe-color)'     },
  route:     { icon: '🗺️', color: 'var(--accent-cyan)'    },
  warning:   { icon: '⚠️', color: 'var(--danger-color)'   },
};

const SEVERITY_BADGE = {
  safe:     'badge-safe',
  moderate: 'badge-moderate',
  danger:   'badge-danger',
  critical: 'badge-critical',
};

const MOCK_EXTRA_ALERTS = [
  { id: 100, type: 'warning',    severity: 'danger',   message: 'Night-time risk elevated in Rohini Zone — crime rate 1.8× above daytime baseline', time: '18m ago' },
  { id: 101, type: 'congestion', severity: 'critical', message: 'Peak hour gridlock on Ring Road — estimated 40min delay. Use metro as alternative.', time: '22m ago' },
  { id: 102, type: 'safety',     severity: 'safe',     message: 'Dwarka Sector 21 reports low crime index (32) — recommended for safe transit routes',  time: '30m ago' },
  { id: 103, type: 'crime',      severity: 'moderate', message: 'Noida Expressway: moderate theft incidents reported. Stay alert and avoid late travel.', time: '45m ago' },
  { id: 104, type: 'congestion', severity: 'moderate', message: 'Karol Bagh Chowk congestion easing — now at 55/100 and improving', time: '1h ago' },
];

export default function AlertsFeed({ alerts }) {
  const [filter, setFilter] = useState('all');
  const allAlerts = [...alerts, ...MOCK_EXTRA_ALERTS];
  const filtered  = filter === 'all'
    ? allAlerts
    : allAlerts.filter(a => a.type === filter || a.severity === filter);

  return (
    <div className="alerts-page">
      {/* Stats row */}
      <div className="alerts-stats">
        <AlertStat label="Total Alerts" value={allAlerts.length}                              color="var(--accent-cyan)"     icon="🔔" />
        <AlertStat label="Critical"     value={allAlerts.filter(a=>a.severity==='critical').length} color="var(--critical-color)" icon="🚨" />
        <AlertStat label="Warnings"     value={allAlerts.filter(a=>a.severity==='danger').length}   color="var(--danger-color)"   icon="⚠️" />
        <AlertStat label="Safe Zones"   value={allAlerts.filter(a=>a.severity==='safe').length}     color="var(--safe-color)"     icon="✅" />
      </div>

      <div className="alerts-body">
        {/* Filter sidebar */}
        <aside className="alerts-filters">
          <div className="af-title">Filter Alerts</div>
          {[
            { id: 'all',        label: '📋 All Alerts'       },
            { id: 'crime',      label: '🚨 Crime'            },
            { id: 'congestion', label: '🚗 Congestion'       },
            { id: 'safety',     label: '🛡️ Safety'          },
            { id: 'route',      label: '🗺️ Route'           },
            { id: 'critical',   label: '🔴 Critical Only'    },
            { id: 'safe',       label: '🟢 Safe Zones'       },
          ].map(f => (
            <button
              key={f.id}
              id={`filter-${f.id}`}
              className={`af-btn ${filter === f.id ? 'active' : ''}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
              {f.id !== 'all' && (
                <span className="af-count">
                  {allAlerts.filter(a => a.type === f.id || a.severity === f.id).length}
                </span>
              )}
            </button>
          ))}
        </aside>

        {/* Feed */}
        <div className="alerts-feed" role="feed" aria-label="Live alerts feed">
          <div className="feed-header">
            <h2 className="feed-title">Live Intelligence Feed</h2>
            <div className="feed-live">
              <div className="live-dot" />
              <span>Auto-updating</span>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="no-alerts">No alerts match this filter</div>
          ) : (
            filtered.map((alert, i) => (
              <AlertCard key={alert.id} alert={alert} delay={i * 0.05} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function AlertStat({ label, value, color, icon }) {
  return (
    <div className="alert-stat-card glass-card">
      <div className="asc-icon">{icon}</div>
      <div className="asc-val" style={{ color }}>{value}</div>
      <div className="asc-lbl">{label}</div>
    </div>
  );
}

function AlertCard({ alert, delay = 0 }) {
  const meta = TYPE_META[alert.type] || TYPE_META.warning;
  return (
    <article
      className={`alert-card severity-${alert.severity}`}
      style={{ animationDelay: `${delay}s` }}
      aria-label={`${alert.severity} alert: ${alert.message}`}
    >
      <div className="alert-icon" style={{ background: meta.color + '22', border: `1px solid ${meta.color}44` }}>
        {meta.icon}
      </div>
      <div className="alert-body">
        <div className="alert-top">
          <span className={`badge ${SEVERITY_BADGE[alert.severity] || 'badge-moderate'}`}>
            {alert.severity.toUpperCase()}
          </span>
          <span className="alert-type-label">{alert.type}</span>
          <span className="alert-time">{alert.time}</span>
        </div>
        <p className="alert-message">{alert.message}</p>
      </div>
    </article>
  );
}
