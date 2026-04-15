import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  // ── GitHub Pages deployment ───────────────────────────────
  // Must match the repository name exactly (case-sensitive)
  base: '/Smart-mobility-/',

  server: {
    port: 5173,
  },

  // ── Vitest configuration ──────────────────────────────────
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.js', 'src/**/*.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/aiEngine.js'],
    },
  },
});
