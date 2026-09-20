import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindxml from '@tailwindcss/vite'
import path from 'path'
import prerender from '@prerenderer/rollup-plugin'
import JSDOMRenderer from '@prerenderer/renderer-jsdom'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(), 
    tailwindxml(),
    prerender({
      routes: ['/', '/about', '/contact'],
      renderer: new JSDOMRenderer(),
      server: {
        port: 3000,
        host: 'localhost',
      },
    })
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'shared/messageMergeEngine': path.resolve(__dirname, '../shared/messageMergeEngine.ts'),
      'shared': path.resolve(__dirname, '../shared'),
    },
    extensions: ['.ts', '.tsx', '.mjs', '.js', '.jsx', '.json'],
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    allowedHosts: true,
  },
  build: {
    sourcemap: 'hidden', // generates .map files for production debugging without exposing to users
    chunkSizeWarningLimit: 1600,
    target: 'es2020',   // broader mobile WebView and Android browser support
    minify: 'terser',   // terser is more conservative than esbuild, reducing TDZ crashes
    terserOptions: {
      compress: {
        // Disable inlining which can cause TDZ issues in compressed bundles
        inline: false,
        keep_classnames: true,
        keep_fnames: true,
        // Reliably drop all console.* and debugger statements in production.
        // esbuild.pure only tree-shakes side-effect-free calls, not standalone statements.
        drop_console: true,
        drop_debugger: true,
      },
      mangle: {
        keep_classnames: true,
        keep_fnames: true,
      },
    },
    rollupOptions: {
      output: {
        // Granular vendor chunk splitting for optimal browser caching.
        // Each sub-chunk is independently cached — returning users only re-download
        // the chunk that changed, not the entire 1.4 MB vendor blob.
        manualChunks: (id) => {
          if (!id.includes('node_modules')) return undefined;
          
          // Agora video SDK — very large (~1.5MB), isolated to video call feature
          if (id.includes('node_modules/agora') || id.includes('agora-rtc')) {
            return 'agora-vendor';
          }
          // Supabase — auth and realtime client library
          if (id.includes('node_modules/@supabase')) {
            return 'vendor-supabase';
          }
          // Chart.js — dashboard & admin graphs
          if (id.includes('node_modules/chart.js') || id.includes('node_modules/react-chartjs-2')) {
            return 'vendor-charts';
          }
          // React core framework
          if (id.includes('node_modules/react/') ||
              id.includes('node_modules/react-dom/') ||
              id.includes('node_modules/scheduler/')) {
            return 'vendor-react';
          }
          // React Router
          if (id.includes('node_modules/react-router') || id.includes('node_modules/@remix-run')) {
            return 'vendor-router';
          }
          // Socket.IO + transport dependencies
          if (id.includes('socket.io') || id.includes('engine.io') || id.includes('component-emitter')) {
            return 'vendor-socket';
          }
          // Framer motion
          if (id.includes('node_modules/framer-motion')) {
            return 'vendor-motion';
          }
          // Default vendor chunk for remaining dependencies
          return 'vendor';
        },
      },
    },
  },

  preview: {
    host: '0.0.0.0',
    port: parseInt(process.env.PORT || '4173'),
    allowedHosts: ['notestandard.com', 'api.notestandard.com', '.onrender.com', 'localhost'],
  },
})
