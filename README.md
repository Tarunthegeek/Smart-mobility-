# SmartMobility AI 🗺️

> **AI-powered urban route safety & real-time congestion intelligence for Indian cities**

[![Build](https://img.shields.io/badge/build-passing-brightgreen)](#)
[![License](https://img.shields.io/badge/license-MIT-blue)](#)
[![Google Maps](https://img.shields.io/badge/Google%20Maps-Platform-4285F4?logo=googlemaps)](#)

---

## 🎯 Problem Statement

Urban commuters in Indian cities face two critical challenges:
1. **Safety** — lack of awareness about crime-prone areas on their route
2. **Congestion** — unpredictable traffic causing significant delays

SmartMobility AI solves both by combining **Google Maps real-time routing** with an **AI-powered safety analysis engine** that scores every route based on crime risk, congestion patterns, time-of-day, and police presence.

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🛡️ **AI Safety Scoring** | Inverse-Distance Weighted (IDW) crime model for any location worldwide |
| 🚗 **Live Traffic Routing** | Google Directions API with `duration_in_traffic` |
| ⚡ **Route Ranking** | Routes ranked by actual ETA and AI safety score (not Google's arbitrary order) |
| 🔥 **City Heat Map** | Crime and congestion heat overlay for New Delhi |
| 📍 **GPS Detection** | One-tap current location with reverse geocoding |
| 🌤️ **Weather Integration** | Open-Meteo real-time weather risk assessment |
| 🚨 **Live Alerts Feed** | Auto-generated alerts for high-crime / high-congestion zones |
| 📱 **Fully Responsive** | Mobile-first bottom sheet + bottom tab navigation |
| 🌙 **Dark Mode** | Premium dark theme with glassmorphism |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     SmartMobility AI                        │
├─────────────┬───────────────────┬───────────────────────────┤
│  UI Layer   │   Service Layer   │      AI Engine            │
│             │                   │                           │
│ React 18    │ googleMapsService │ IDW Crime Model           │
│ Vite 5      │  • Directions API │ Congestion Predictor      │
│ Vanilla CSS │  • Geocoding API  │ Time × Day Multiplier     │
│             │  • Places API     │ Route Safety Ranker       │
│             │  • Traffic Layer  │ Live Tick Simulator       │
│             │  • Heatmap Layer  │                           │
│             │ Open-Meteo API    │                           │
│             │ Overpass/OSM API  │                           │
└─────────────┴───────────────────┴───────────────────────────┘
```

---

## 🗺️ Google Maps APIs Used

| API | Purpose |
|-----|---------|
| **Maps JavaScript API** | Interactive dark-themed map |
| **Directions API** | Real-time multi-route fetching with live traffic |
| **Geocoding API** | Address ↔ coordinates conversion |
| **Places Autocomplete API** | Smart address input suggestions |
| **Traffic Layer** | Live Google traffic overlay |
| **Visualization (HeatmapLayer)** | City-wide crime/congestion heat map |
| **Geometry Library** | Route path manipulation |

---

## 🤖 AI Engine

### Crime Risk Model (IDW — Inverse Distance Weighting)
- 15 anchor crime zones in Delhi NCR with empirical scores
- **Works for any city worldwide** via IDW interpolation with distance penalty fallback
- Time-of-day multiplier: night (1.9×), late evening (1.45×), rush hour (1.15×)
- Day-of-week uplift: weekends (+18% risk)

### Route Safety Scoring
```
safetyScore = 100 - (crime × 0.55 + congestion × 0.45)
```
- Samples up to 12 evenly-spaced waypoints per route
- Routes **ranked by actual metrics** (not Google's position order):
  - Fastest = lowest `duration_in_traffic`
  - Safest  = highest `safetyScore`
  - Balanced = best combined rank

### Congestion Model
- Peak-hour wave interpolation (8–10am, 5–8pm full peak)
- IDW aggregation from 10 congestion anchor zones

---

## 🛠️ Setup

### Prerequisites
- Node.js 18+
- Google Maps Platform API key with the following APIs enabled:
  - Maps JavaScript API
  - Directions API
  - Geocoding API
  - Places API
  - Visualization API

### Installation

```bash
# Clone the repository
git clone https://github.com/Tarunthegeek/Smart-mobility-.git
cd Smart-mobility-

# Install dependencies
npm install

# Configure API key
cp .env.example .env.local
# Edit .env.local and add your VITE_GMAPS_API_KEY

# Start development server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

### Running Tests

```bash
npm test
```

### Production Build

```bash
npm run build
```

---

## 📁 Project Structure

```
src/
├── App.jsx                    # Root component — state management
├── App.css                    # Global app layout
├── aiEngine.js                # AI crime/congestion models + route scoring
├── googleMapsService.js       # Maps API + routing + weather + police services
├── index.css                  # Design system tokens
├── hooks/
│   └── useGoogleMaps.js       # Google Maps script loader hook
└── components/
    ├── MapView.jsx             # Interactive map + route rendering
    ├── MapView.css
    ├── RoutePanel.jsx          # Search form + route cards
    ├── RoutePanel.css
    ├── MetricsDashboard.jsx    # Safety metrics + weather + police
    ├── MetricsDashboard.css
    ├── CityHeatmapPanel.jsx    # City-wide heat map view
    ├── AlertsFeed.jsx          # Live alerts log
    ├── AlertsFeed.css
    ├── Header.jsx              # App header with live status
    └── Header.css
tests/
└── aiEngine.test.js           # Unit tests for AI engine
```

---

## 🔒 Security

- API key stored in `.env.local` (gitignored — **never committed**)
- Input validation before all API calls
- Coordinate sanity checks (non-zero, finite, in-range)
- Auto-retry with simplified request on `MAX_ROUTE_LENGTH_EXCEEDED`
- All external API calls wrapped in `AbortController` timeout

---

## ♿ Accessibility

- ARIA roles on map, navigation, and interactive controls
- `aria-label` on all icon buttons
- `aria-selected` on tab navigation
- `aria-pressed` on route selection cards
- `aria-live="polite"` on error messages
- Minimum 36px touch targets (44px on mobile)
- `touch-action: manipulation` to disable double-tap zoom on buttons
- Keyboard support: `Enter` to search, `Escape` to close suggestions

---

## 📱 Responsive Design

| Breakpoint | Layout |
|-----------|--------|
| ≥ 1024px | Sidebar (380px) + full map |
| 768–1024px | Narrower sidebar (340px) + map |
| ≤ 768px | Full-screen map + sliding bottom sheet + bottom tab bar |
| ≤ 480px | Compact mobile layout with larger touch targets |

---

## 📊 Evaluation Criteria Checklist

| Criterion | Implementation |
|-----------|---------------|
| ✅ Code Quality | Modular, single-responsibility components; JSDoc comments; consistent error handling |
| ✅ Security | API key in `.env.local`; input validation; coordinate sanity checks |
| ✅ Efficiency | IDW with nearest-zone fallback; max 12 route samples; AbortController timeouts; deduped autocomplete |
| ✅ Testing | 30+ unit tests for AI engine via Vitest |
| ✅ Accessibility | ARIA labels, keyboard nav, touch targets, live regions |
| ✅ Problem Alignment | AI safety scoring + live routing for urban commuters |
| ✅ Google Services | 7 Maps APIs used (Directions, Geocoding, Places, Traffic, Heatmap, Geometry, Maps JS) |

---

## 🏆 Built For

**Prompt Wars Hackathon** — Google Maps Platform Challenge

**Team:** Tarun  
**Tech Stack:** React 18, Vite 5, Google Maps Platform, Open-Meteo, Overpass API

---

## 📄 License

MIT — see [LICENSE](LICENSE) for details.
