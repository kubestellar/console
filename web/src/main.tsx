import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import './index.css'
// Initialize i18n before rendering
import './lib/i18n'
// Register unified card data hooks (must be before App renders)
import './lib/unified/registerHooks'
// Register demo data generators for unified demo system
import { registerAllDemoGenerators } from './lib/unified/demo'
registerAllDemoGenerators()
// Import cache utilities
import {
  initCacheWorker,
  initPreloadedMeta,
  migrateIDBToSQLite,
  migrateFromLocalStorage,
  preloadCacheFromStorage,
} from './lib/cache'
// Import dynamic card/stats persistence loaders
import { loadDynamicCards, getAllDynamicCards, loadDynamicStats } from './lib/dynamic-cards'
import { registerDynamicCardType } from './components/cards/cardRegistry'
import { STORAGE_KEY_SQLITE_MIGRATED } from './lib/constants'

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
  .finally(async () => {
    // Initialize SQLite Web Worker for cache storage (replaces IndexedDB + localStorage)
    try {
      const rpc = await initCacheWorker()

      // One-time migration from IndexedDB + localStorage to SQLite
      if (!localStorage.getItem(STORAGE_KEY_SQLITE_MIGRATED)) {
        await migrateFromLocalStorage() // Clean up legacy ksc_ keys first
        await migrateIDBToSQLite()      // Move IDB data + localStorage meta to SQLite
        localStorage.setItem(STORAGE_KEY_SQLITE_MIGRATED, '2')
      }

      // Seed cache from perf test data if available (set by Playwright addInitScript)
      const seed = (window as Window & { __CACHE_SEED__?: Array<{ key: string; entry: { data: unknown; timestamp: number; version: number } }> }).__CACHE_SEED__
      if (seed) {
        await rpc.seedCache(seed)
      }

      // Preload all metadata into in-memory Map (replaces sync localStorage reads)
      const { meta } = await rpc.preloadAll()
      initPreloadedMeta(meta)
    } catch (e) {
      console.warn('[Cache] SQLite worker init failed, using IndexedDB fallback:', e)
      // Fallback: run legacy migrations and preload from IndexedDB
      try { await migrateFromLocalStorage() } catch { /* ignore */ }
    }

    // Preload cache data from storage before rendering
    // This ensures cached data is available immediately when components mount
    try {
      await preloadCacheFromStorage()
    } catch (e) {
      console.error('[Cache] Preload failed:', e)
    }

    // Restore dynamic cards and stat blocks from localStorage
    loadDynamicCards()
    getAllDynamicCards().forEach(card => {
      registerDynamicCardType(card.id, card.defaultWidth ?? 6)
    })
    loadDynamicStats()

    ReactDOM.createRoot(document.getElementById('root')!).render(
      <React.StrictMode>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </React.StrictMode>,
    )
  })
