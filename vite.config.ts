import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    // The single-bundle output was tipping over the 500kB warning because
    // recharts + supabase-js both ship substantial runtimes. Split them
    // off so the initial parse stays lean and the vendor chunks can be
    // cached independently across deploys. Vite 8 ships Rolldown, whose
    // `manualChunks` types only accept the function form — matching on
    // the module's path is the portable way to carve out vendor slices.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          // Normalise to forward slashes — Rolldown emits OS-native
          // separators on Windows for module IDs, which would otherwise
          // break the path-segment regexes below.
          const p = id.replace(/\\/g, '/');

          if (/\/(recharts|d3-[^/]+)\//.test(p)) return 'vendor-charts';
          if (p.includes('/@supabase/')) return 'vendor-supabase';
          if (
            /\/(react-hook-form|@hookform|zod)\//.test(p)
          ) {
            return 'vendor-forms';
          }
          // Match `react`, `react-dom`, `scheduler`, `react-router*` —
          // and *only* those — by checking the package boundary
          // explicitly. `id.includes('/react/')` worked but was easy
          // to mis-read; this leaves no ambiguity about what counts.
          if (
            /\/react(-dom|-router(?:-dom)?)?\//.test(p) ||
            /\/scheduler\//.test(p)
          ) {
            return 'vendor-react';
          }
          return undefined;
        },
      },
    },
  },
});
