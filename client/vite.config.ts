import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindxml from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindxml()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: true,
    strictPort: true,
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
