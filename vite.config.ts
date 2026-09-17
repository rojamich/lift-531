import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string
}

/** Short commit, with a marker when the tree had uncommitted changes. */
function gitDescription(): string {
  try {
    const sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
    const dirty = execSync('git status --porcelain', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim().length
    return dirty ? `${sha}+` : sha
  } catch {
    // Building outside a checkout, e.g. from a tarball.
    return 'nogit'
  }
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __GIT_SHA__: JSON.stringify(gitDescription()),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // 'prompt', not 'autoUpdate': auto-updating reloads the page the moment a
      // new build is found, which mid-workout would wipe the running rest timer.
      // The app offers the update instead and lets you take it between sets.
      registerType: 'prompt',
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
        // Old precached builds are useless once a new one lands.
        cleanupOutdatedCaches: true,
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
