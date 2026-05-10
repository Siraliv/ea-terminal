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
          if (id.includes('node_modules')) {
            if (id.includes('recharts') || id.includes('d3-')) {
              return 'vendor-charts';
            }
            if (id.includes('@supabase')) return 'vendor-supabase';
            if (
              id.includes('react-hook-form') ||
              id.includes('@hookform') ||
              id.includes('zod')
            ) {
              return 'vendor-forms';
            }
            if (
              id.includes('react-router') ||
              id.includes('/react/') ||
              id.includes('/react-dom/') ||
              id.includes('scheduler')
            ) {
              return 'vendor-react';
            }
          }
          return undefined;
        },
      },
    },
  },
});
