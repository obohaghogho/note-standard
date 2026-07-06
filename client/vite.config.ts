import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindxml from '@tailwindcss/vite'
import path from 'path'
import prerender from '@prerenderer/rollup-plugin'
import JSDOMRenderer from '@prerenderer/renderer-jsdom'

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
      'shared': path.resolve(__dirname, '../shared'),
    },
  },
  server: {
    host: true,
    strictPort: true,
    allowedHosts: ['127.0.0.1.nip.io'],
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
      },
      mangle: {
        keep_classnames: true,
        keep_fnames: true,
      },
    },
    rollupOptions: {
      output: {
        // Split large vendor libraries into separate cached chunks.
        // After first download, returning users only re-download changed chunks.
        manualChunks: (id) => {
          // Core React — always needed
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'react-vendor';
          }
          // Routing
          if (id.includes('node_modules/react-router')) {
            return 'router-vendor';
          }
          // Supabase client (large)
          if (id.includes('node_modules/@supabase')) {
            return 'supabase-vendor';
          }
          // Socket.io client
          if (id.includes('node_modules/socket.io-client') || id.includes('node_modules/engine.io-client')) {
            return 'socket-vendor';
          }
          // Charts & data viz (heavy, only used in dashboards)
          if (id.includes('node_modules/recharts') || id.includes('node_modules/chart.js') || id.includes('node_modules/d3')) {
            return 'charts-vendor';
          }
          // PDF / document generation
          if (id.includes('node_modules/pdfmake') || id.includes('node_modules/jspdf') || id.includes('node_modules/html2canvas')) {
            return 'pdf-vendor';
          }
          // Agora video SDK (very large)
          if (id.includes('node_modules/agora')) {
            return 'agora-vendor';
          }
          // Framer motion (animation)
          if (id.includes('node_modules/framer-motion')) {
            return 'framer-vendor';
          }
          // UI icon libraries
          if (id.includes('node_modules/lucide-react') || id.includes('node_modules/@heroicons')) {
            return 'icons-vendor';
          }
          // Remaining large node_modules → vendor chunk (cached independently)
          if (id.includes('node_modules')) {
            return 'vendor';
          }
          return undefined; // fix consistent-return
        },
      },
    },
  },
  esbuild: {
    pure: ['console.log'],
  },
  preview: {
    host: '0.0.0.0',
    port: parseInt(process.env.PORT || '4173'),
    allowedHosts: ['notestandard.com', 'api.notestandard.com', '.onrender.com', 'localhost'],
  },
})
