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
/** Cooldown between auto-reloads to prevent infinite reload loops on persistent errors */
const CHUNK_RELOAD_COOLDOWN_MS = 5_000
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

// ── Proactive stale-HTML detection ───────────────────────────────────────
// On visibility change (user returns to tab) or periodic interval, fetch
// index.html and compare the app-build-id <meta> tag. If the server has a
// newer build, reload immediately to pick up correct chunk references.
const STALE_CHECK_INTERVAL_MS = 120_000 // check every 2 minutes
/** Timeout for the stale-HTML fetch — keep short to avoid blocking tab restore */
const STALE_CHECK_FETCH_TIMEOUT_MS = 5_000
const STALE_CHECK_KEY = 'stale-check-ts'

function getLocalBuildId(): string | null {
  const meta = document.querySelector('meta[name="app-build-id"]')
  return meta?.getAttribute('content') ?? null
}

async function checkForStaleHtml(): Promise<void> {
  // Throttle: at most once per interval
  const lastCheck = sessionStorage.getItem(STALE_CHECK_KEY)
  const now = Date.now()
  if (lastCheck && now - parseInt(lastCheck) < STALE_CHECK_INTERVAL_MS) return
  sessionStorage.setItem(STALE_CHECK_KEY, String(now))

  const localId = getLocalBuildId()
  if (!localId) return // dev mode or missing meta — skip

  try {
    const resp = await fetch('/?_stale_check=' + now, {
      cache: 'no-store',
      headers: { Accept: 'text/html' },
      signal: AbortSignal.timeout(STALE_CHECK_FETCH_TIMEOUT_MS),
    })
    if (!resp.ok) return
    const html = await resp.text()
    const match = html.match(/meta\s+name="app-build-id"\s+content="([^"]+)"/)
    if (match && match[1] !== localId) {
      // Server has a newer build — force reload
      sessionStorage.setItem(CHUNK_RELOAD_KEY, String(now))
      window.location.reload()
    }
  } catch {
    // Network error — skip silently
  }
}

// Check when user returns to the tab (common scenario: deploy happened while tab was backgrounded)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    checkForStaleHtml()
  }
})

// Also check on a periodic interval for long-lived tabs
// Store interval ID so the timer is trackable (avoids orphaned-timer lint warnings)
const _staleCheckInterval = setInterval(checkForStaleHtml, STALE_CHECK_INTERVAL_MS)
// Suppress unused-variable warning — the interval intentionally runs for the app lifetime
void _staleCheckInterval

// Clean up the stale-check interval during Vite HMR so hot reloads
// don't accumulate orphaned timers (#12589).
if (import.meta.hot) {
  import.meta.hot.dispose(() => clearInterval(_staleCheckInterval))
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
    // Import and start MSW via the dynamically-imported chunk so the
    // mockServiceWorker.js URL string never appears in the index bundle.
    const { startMocking: start } = await import('./mocks/browser')
    await start()
  } catch (error: unknown) {
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
      <BrowserRouter>
        <App />
      </BrowserRouter>,
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
      } catch (e: unknown) {
        console.warn('[Cache] SQLite worker init: using IndexedDB fallback:', e)
        try { await migrateFromLocalStorage() } catch (migrateErr: unknown) { console.warn('[Cache] failed to migrate from localStorage:', migrateErr) }
      }
    })()

    // Register dynamic card types (needs async import for cardRegistry)
    if (dynamicCards.length > 0) {
      import('./components/cards/cardRegistry').then(({ registerDynamicCardType }) => {
        dynamicCards.forEach(card => {
          registerDynamicCardType(card.id, card.defaultWidth ?? 6)
        })
      }).catch(() => { /* ignore — dynamic card registration is non-critical */ })
    }

    // Register unified card data hooks (background — ~300 KB chunk)
    import('./lib/unified/registerHooks').catch(() => { /* ignore — hook registration is non-critical */ })

    // #6747 — Validate CARD_INSTALL_MAP keys against the live card registry
    // at startup. The validator already logs a single console.warn listing
    // any dead aliases (typos, cards retired from the registry but still
    // present in the install map). We call it ONCE here from bootstrap so
    // the check actually runs at runtime instead of only in tests. Dev-only
    // so production bundles don't spend cycles on it.
    if (import.meta.env.DEV) {
      Promise.all([
        import('./lib/cards/cardInstallMap'),
        import('./config/cards'),
        import('./components/cards/cardRegistry'),
      ])
        .then(([{ validateCardInstallMap }, { getUnifiedCardTypes }, { getRegisteredCardTypes }]) => {
          // #6754 — validateCardInstallMap needs the union of config-based
          // cards (getUnifiedCardTypes, from CARD_CONFIGS) AND component-only
          // registered cards (getRegisteredCardTypes, from CARD_COMPONENTS).
          // Using only config-based types would incorrectly flag component-only
          // cards as install-map entries without a backing card type.
          const knownTypes = Array.from(
            new Set([...getUnifiedCardTypes(), ...getRegisteredCardTypes()]),
          )
          validateCardInstallMap(knownTypes)
        })
        .catch(() => { /* ignore — validation is non-critical diagnostic */ })
    }

    // Prefetch route chunks for the user's top 5 most-visited dashboards.
    // Uses requestIdleCallback to avoid competing with initial render.
    prefetchTopDashboards(window.location.pathname)
  })
