import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import './index.css'
// Initialize i18n before rendering
import './lib/i18n'
// Import cache migration utility
import { migrateFromLocalStorage } from './lib/cache'
// Import dynamic card/stats persistence loaders
import { loadDynamicCards, getAllDynamicCards, loadDynamicStats } from './lib/dynamic-cards'
import { registerDynamicCardType } from './components/cards/cardRegistry'
// Register unified card hooks at startup
import './lib/unified/registerHooks'
// Import backend cache reset for demo mode
import { resetBackendAvailabilityCache } from './lib/api'

// Suppress recharts dimension warnings (these occur when charts render before container is sized)
const originalWarn = console.warn
console.warn = (...args) => {
  if (typeof args[0] === 'string' && args[0].includes('width') && args[0].includes('height') && args[0].includes('chart should be greater than 0')) {
    return // Suppress recharts dimension warnings
  }
  originalWarn.apply(console, args)
}

// Enable MSW mock service worker in demo mode (Netlify previews or localStorage toggle)
const enableMocking = async () => {
  // Check env var, Netlify domain, OR localStorage demo mode toggle
  const isDemoMode = import.meta.env.VITE_DEMO_MODE === 'true' ||
    window.location.hostname.includes('netlify.app') ||
    localStorage.getItem('kc-demo-mode') === 'true'

  if (!isDemoMode) {
    return
  }

  try {
    const { worker } = await import('./mocks/browser')

    // Start the worker with onUnhandledRequest set to bypass
    // to allow external resources (fonts, images) to load normally
    await worker.start({
      onUnhandledRequest: 'bypass',
      quiet: true, // Suppress verbose request logging in console
      serviceWorker: {
        url: '/mockServiceWorker.js',
      },
    })

    // Reset backend availability cache so fresh checks go through MSW
    // This must happen AFTER MSW starts to ensure the health check uses mocks
    resetBackendAvailabilityCache()
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
    // Migrate old localStorage cache to IndexedDB (one-time migration)
    try {
      await migrateFromLocalStorage()
    } catch (e) {
      console.error('[Cache] Migration failed:', e)
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
