import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Lift — 5/3/1 Tracker',
        short_name: 'Lift',
        description: 'Wendler 5/3/1 training log for two.',
        theme_color: '#0b0f17',
        background_color: '#0b0f17',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallbackDenylist: [/^\/__/],
      },
    }),
  ],
  build: {
    // Firebase is most of the bundle and changes far less often than app code,
    // so keeping it in its own chunk means an app update is a small download.
    rolldownOptions: {
      output: {
        advancedChunks: {
          groups: [{ name: 'firebase', test: /node_modules[\\/]@?firebase/ }],
        },
      },
    },
    chunkSizeWarningLimit: 700,
  },
})
