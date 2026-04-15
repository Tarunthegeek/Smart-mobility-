import React, { useState } from 'react';
import './ApiKeyModal.css';

export default function ApiKeyModal({ onKeySubmit }) {
  const [key, setKey]         = useState('');
  const [showKey, setShowKey] = useState(false);
  const [error, setError]     = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    const trimmed = key.trim();
    if (!trimmed || !trimmed.startsWith('AIza')) {
      setError('Please enter a valid Google Maps API key (starts with "AIza…")');
      return;
    }
    setError('');
    onKeySubmit(trimmed);
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Google Maps API Key Setup">
      <div className="modal-card">
        {/* Logo */}
        <div className="modal-logo">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="23" stroke="url(#mg)" strokeWidth="2"/>
            <path d="M14 24l7 7 13-14" stroke="url(#mg)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
            <circle cx="24" cy="24" r="5" fill="url(#mg)" opacity="0.3"/>
            <defs>
              <linearGradient id="mg" x1="0" y1="0" x2="48" y2="48">
                <stop stopColor="#00d2ff"/>
                <stop offset="1" stopColor="#0066ff"/>
              </linearGradient>
            </defs>
          </svg>
        </div>

        <h1 className="modal-title gradient-text">SmartMobility AI</h1>
        <p className="modal-subtitle">Urban Intelligence System</p>

        <div className="modal-divider" />

        <div className="modal-section">
          <h2 className="modal-section-title">🗺️ Google Maps API Key Required</h2>
          <p className="modal-desc">
            This app uses the <strong>Google Maps Platform</strong> for real road routing,
            live traffic data, and heatmaps. You need a free API key to get started.
          </p>
        </div>

        {/* Steps */}
        <div className="setup-steps">
          <div className="step-item">
            <div className="step-num">1</div>
            <div className="step-text">
              Go to <a href="https://console.cloud.google.com/google/maps-apis" target="_blank" rel="noreferrer" className="link">
                console.cloud.google.com
              </a> and create a project
            </div>
          </div>
          <div className="step-item">
            <div className="step-num">2</div>
            <div className="step-text">
              Enable: <code>Maps JavaScript API</code>, <code>Directions API</code>, <code>Geocoding API</code>
            </div>
          </div>
          <div className="step-item">
            <div className="step-num">3</div>
            <div className="step-text">
              Create an API key — Google gives <strong>$200 free credit/month</strong> (~28,000 map loads free)
            </div>
          </div>
          <div className="step-item">
            <div className="step-num">4</div>
            <div className="step-text">
              Paste your key below (stored only in your browser's localStorage)
            </div>
          </div>
        </div>

        {/* Key input form */}
        <form onSubmit={handleSubmit} className="key-form">
          <div className="key-input-wrap">
            <span className="key-icon">🔑</span>
            <input
              id="input-api-key"
              className="input-field key-input"
              type={showKey ? 'text' : 'password'}
              placeholder="AIzaSy…"
              value={key}
              onChange={e => setKey(e.target.value)}
              autoComplete="off"
              spellCheck="false"
              aria-label="Google Maps API Key"
            />
            <button
              type="button"
              className="show-key-btn"
              onClick={() => setShowKey(v => !v)}
              aria-label={showKey ? 'Hide key' : 'Show key'}
            >
              {showKey ? '🙈' : '👁️'}
            </button>
          </div>
          {error && <div className="key-error" role="alert">⚠️ {error}</div>}
          <button id="btn-connect-maps" type="submit" className="btn-primary connect-btn">
            🚀 Connect Google Maps
          </button>
        </form>

        {/* Free tier note */}
        <div className="free-note">
          <span className="free-badge badge badge-safe">$200 FREE / month</span>
          <span>Your key is saved locally and never sent to any server.</span>
        </div>
      </div>
    </div>
  );
}
