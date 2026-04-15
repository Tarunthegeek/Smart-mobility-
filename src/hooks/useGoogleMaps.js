/**
 * useGoogleMaps — dynamically loads the Google Maps JavaScript API.
 * Supports: Maps, Directions, Geocoding, Places, Visualization (HeatmapLayer), Geometry
 */
import { useState, useEffect } from 'react';

let loadPromise = null;

export function loadGoogleMapsScript(apiKey) {
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    if (window.google?.maps) {
      resolve(window.google.maps);
      return;
    }

    const script = document.createElement('script');
    script.src =
      `https://maps.googleapis.com/maps/api/js` +
      `?key=${apiKey}` +
      `&libraries=places,visualization,geometry` +
      `&v=weekly` +
      `&callback=__gmapsLoaded`;
    script.async = true;
    script.defer = true;

    window.__gmapsLoaded = () => {
      delete window.__gmapsLoaded;
      resolve(window.google.maps);
    };

    script.onerror = () => {
      loadPromise = null;
      reject(new Error('Failed to load Google Maps — check your API key.'));
    };

    document.head.appendChild(script);
  });

  return loadPromise;
}

export function useGoogleMaps(apiKey) {
  const [maps, setMaps]       = useState(null);
  const [error, setError]     = useState(null);
  // Start as loading=true when a key is available so the UI never sees loading=false+maps=null
  const [loading, setLoading] = useState(!!apiKey);

  useEffect(() => {
    if (!apiKey) return;
    setLoading(true);
    setError(null);

    // If already loaded with same key, resolve immediately
    if (window.google?.maps) {
      setMaps(window.google.maps);
      setLoading(false);
      return;
    }

    loadGoogleMapsScript(apiKey)
      .then(m => { setMaps(m); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [apiKey]);

  return { maps, loading, error };
}
