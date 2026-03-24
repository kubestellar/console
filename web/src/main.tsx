import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import './index.css'
// Initialize i18n before rendering
import './lib/i18n'
// NOTE: registerHooks is loaded dynamically (below) to split the MCP hooks
// (~300 KB) into a separate chunk that downloads in parallel with the main bundle.
// Register demo data generators for unified demo system
import { registerAllDemoGenerators } from './lib/unified/demo'
registerAllDemoGenerators()
// Import cache utilities
import {
  initCacheWorker,
  initPreloadedMeta,
  migrateIDBToSQLite,
  migrateFromLocalStorage,

} from './lib/cache'
// Import dynamic card/stats persistence loaders
import { loadDynamicCards, getAllDynamicCards, loadDynamicStats } from './lib/dynamic-cards'
import { STORAGE_KEY_SQLITE_MIGRATED } from './lib/constants'
import { initAnalytics } from './lib/analytics'
import { prefetchTopDashboards } from './lib/dashboardVisits'

// ── Chunk load error recovery ─────────────────────────────────────────────
// When a new build is deployed, chunk filenames change (content hashes).
// Browsers with cached HTML reference old chunks that no longer exist.
// Vite fires `vite:preloadError` before React error boundaries see the error.
// Auto-reload once to pick up fresh HTML with correct chunk references.
const CHUNK_RELOAD_KEY = 'chunk-reload-ts'
const CHUNK_RELOAD_COOLDOWN_MS = 30_000
window.addEventListener('vite:preloadError', (event) => {
  const lastReload = sessionStorage.getItem(CHUNK_RELOAD_KEY)
  const now = Date.now()
  if (!lastReload || now - parseInt(lastReload) > CHUNK_RELOAD_COOLDOWN_MS) {
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(now))
    // Prevent the error from propagating to error boundaries
    event.preventDefault()
    window.location.reload()
  }
})

// Suppress recharts dimension warnings (these occur when charts render before container is sized)
const originalWarn = console.warn
console.warn = (...args) => {
  if (typeof args[0] === 'string' && args[0].includes('width') && args[0].includes('height') && args[0].includes('chart should be greater than 0')) {
    return // Suppress recharts dimension warnings
  }
  originalWarn.apply(console, args)
}

// Enable MSW mock service worker in demo mode (Netlify previews)
const enableMocking = async () => {
  // Check env var OR detect Netlify domain (more reliable)
  const isDemoMode = import.meta.env.VITE_DEMO_MODE === 'true' ||
    window.location.hostname.includes('netlify.app')

  if (!isDemoMode) {
    return
  }

  try {
    const { worker } = await import('./mocks/browser')

    // Start the worker with onUnhandledRequest set to bypass
    // to allow external resources (fonts, images) to load normally
    await worker.start({
      onUnhandledRequest: 'bypass',
      serviceWorker: {
        url: '/mockServiceWorker.js',
      },
    })
  } catch (error) {
    // If service worker fails to start (e.g., in some browser contexts),
    // log the error but continue rendering the app without mocking
    console.error('MSW service worker failed to start:', error)
  }
}

// Render app after mocking is set up (or fails gracefully)
enableMocking()
  .catch((error) => {
    console.error('MSW initialization failed:', error)
  })
  .finally(() => {
    // ── Sync setup (fast, must happen before render) ──────────────────
    loadDynamicCards()
    const dynamicCards = getAllDynamicCards()
    loadDynamicStats()
    initAnalytics()

    // ── Render FIRST — don't block on async work ──────────────────────
    ReactDOM.createRoot(document.getElementById('root')!).render(
      <React.StrictMode>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </React.StrictMode>,
    )

    // ── Async setup (runs in background after render) ─────────────────
    // Cache worker init (SQLite or IndexedDB fallback)
    ;(async () => {
      try {
        const rpc = await initCacheWorker()

        if (!localStorage.getItem(STORAGE_KEY_SQLITE_MIGRATED)) {
          await migrateFromLocalStorage()
          await migrateIDBToSQLite()
          localStorage.setItem(STORAGE_KEY_SQLITE_MIGRATED, '2')
        }

        const seed = (window as Window & { __CACHE_SEED__?: Array<{ key: string; entry: { data: unknown; timestamp: number; version: number } }> }).__CACHE_SEED__
        if (seed) {
          await rpc.seedCache(seed)
        }

        const { meta } = await rpc.preloadAll()
        initPreloadedMeta(meta)
      } catch (e) {
        console.error('[Cache] SQLite worker init failed, using IndexedDB fallback:', e)
        try { await migrateFromLocalStorage() } catch { /* ignore */ }
      }
    })()

    // Register dynamic card types (needs async import for cardRegistry)
    if (dynamicCards.length > 0) {
      import('./components/cards/cardRegistry').then(({ registerDynamicCardType }) => {
        dynamicCards.forEach(card => {
          registerDynamicCardType(card.id, card.defaultWidth ?? 6)
        })
      })
    }

    // Register unified card data hooks (background — ~300 KB chunk)
    import('./lib/unified/registerHooks')

    // Prefetch route chunks for the user's top 5 most-visited dashboards.
    // Uses requestIdleCallback to avoid competing with initial render.
    prefetchTopDashboards(window.location.pathname)
  })
