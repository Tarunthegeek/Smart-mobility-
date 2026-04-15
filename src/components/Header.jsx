import React from 'react';
import './Header.css';

export default function Header({ currentTime, cityScore }) {
  const timeStr = currentTime.toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
  });
  const dateStr = currentTime.toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
  });

  const crimeLevel  = cityScore?.crime?.label  || 'Loading…';
  const congLevel   = cityScore?.congestion?.label || 'Loading…';
  const crimeColor  = cityScore?.crime?.color  || '#8ba3cc';
  const congColor   = cityScore?.congestion?.color || '#8ba3cc';

  return (
    <header className="app-header" role="banner">
      <div className="header-left">
        <div className="logo-group">
          <div className="logo-icon" aria-hidden="true">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <circle cx="14" cy="14" r="13" stroke="url(#logoGrad)" strokeWidth="2"/>
              <path d="M8 14l4 4 8-8" stroke="url(#logoGrad)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="14" cy="14" r="3" fill="url(#logoGrad)" opacity="0.4"/>
              <defs>
                <linearGradient id="logoGrad" x1="0" y1="0" x2="28" y2="28">
                  <stop stopColor="#00d2ff"/>
                  <stop offset="1" stopColor="#0066ff"/>
                </linearGradient>
              </defs>
            </svg>
          </div>
          <div>
            <h1 className="logo-title">SmartMobility <span className="gradient-text">AI</span></h1>
            <p className="logo-sub">Urban Intelligence System</p>
          </div>
        </div>
      </div>

      <div className="header-center">
        <div className="city-status-bar">
          <div className="status-item">
            <span className="status-label">City Crime</span>
            <span className="status-val" style={{ color: crimeColor }}>{crimeLevel}</span>
          </div>
          <div className="status-divider" />
          <div className="status-item">
            <span className="status-label">Traffic</span>
            <span className="status-val" style={{ color: congColor }}>{congLevel}</span>
          </div>
          <div className="status-divider" />
          <div className="status-item">
            <div className="live-indicator">
              <div className="live-dot" />
              <span className="live-text">LIVE</span>
            </div>
          </div>
        </div>
      </div>

      <div className="header-right">
        <div className="time-display">
          <div className="time-clock" aria-label={`Current time ${timeStr}`}>{timeStr}</div>
          <div className="time-date">{dateStr}</div>
        </div>
        <div className="header-badges">
          <div className="header-badge badge badge-cyan">New Delhi, India</div>
          <div className="gmaps-badge" title="Powered by Google Maps Platform">
            <span className="gmaps-dot" />
            Google Maps
          </div>
        </div>
      </div>
    </header>
  );
}
