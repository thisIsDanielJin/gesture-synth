import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vitest config lives here too — Vitest 3 ships its own Vite copy whose Plugin
// types clash with the app's Vite when imported from `vitest/config`, so we
// keep a single `vite/defineConfig` here and let Vitest pick up the `test`
// field at runtime. The triple-slash reference brings the typings in.
/// <reference types="vitest" />

export default defineConfig({
  plugins: [react()],
  // @ts-expect-error vitest types are loaded via reference, not augmented onto Vite's UserConfig
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/__tests__/setup.ts',
  },
});
