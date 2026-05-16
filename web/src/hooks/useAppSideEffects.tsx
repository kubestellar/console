/**
 * App-wide side effects: chunk prefetching, analytics tracking, data
 * prefetching, orbit auto-runner, settings sync, and live URL bridging.
 *
 * These are "invisible" components/hooks that run purely for side effects
 * (they render null). Extracted from App.tsx to keep the root component
 * focused on provider composition and routing.
 */
import { useState, useEffect, useRef, useMemo, useSyncExternalStore } from 'react'
import { useLocation, useNavigationType, UNSAFE_LocationContext } from 'react-router-dom'
import type { Location } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useBranding } from '../hooks/useBranding'
import { useOrbitAutoRun } from '../hooks/useOrbitAutoRun'
import { usePersistedSettings } from '../hooks/usePersistedSettings'
import { ROUTES } from '../config/routes'
import { SHORT_DELAY_MS } from '../lib/constants/network'
import { isDemoMode } from '../lib/demoMode'
import { emitPageView, emitDashboardViewed } from '../lib/analytics'
import { fetchEnabledDashboards, getEnabledDashboardIds } from '../hooks/useSidebarConfig'
import { DASHBOARD_CHUNKS } from '../lib/dashboardChunks'
import { ROUTE_TITLES, pathToDashboardId } from '../routes/routeTitles'
import { reportAppError } from '../lib/errors/handleError'

// ---------------------------------------------------------------------------
// Chunk prefetching
// ---------------------------------------------------------------------------

// Always prefetched regardless of enabled dashboards
const ALWAYS_PREFETCH = new Set(['dashboard', 'settings', 'clusters', 'cluster-admin', 'security', 'deploy'])

// Timing constants (milliseconds)
const PREFETCH_DEMO_CARDS_DELAY_MS = 15_000

/** Max wait (ms) for the enabled-dashboards list before prefetching all chunks */
const PREFETCH_DASHBOARD_TIMEOUT_MS = 2_000

/** Routes where chunk prefetching is skipped to avoid errors during OAuth flow (#9767) */
const SKIP_PREFETCH_PATHS: ReadonlySet<string> = new Set([ROUTES.LOGIN, ROUTES.AUTH_CALLBACK])

const PREFETCH_BATCH_SIZE = 8
const PREFETCH_BATCH_DELAY = 50

// Prefetch lazy route chunks after initial page load.
// Batched to avoid overwhelming the Vite dev server with simultaneous
// module transformation requests (which delays navigation on cold start).
if (typeof window !== 'undefined') {
  const prefetchRoutes = async () => {
    // Skip prefetching on auth pages — during OAuth redirects, the browser
    // navigates away before chunks finish loading, causing chunk_load errors.
    if (SKIP_PREFETCH_PATHS.has(window.location.pathname)) return
    // Wait for the enabled dashboards list from /health so we only
    // prefetch chunks the user will actually see. Timeout after 2s
    // and prefetch all chunks — better to over-prefetch than leave
    // chunks uncached and block navigation.
    try {
      let timeoutId: ReturnType<typeof setTimeout> | undefined
      await Promise.race([
        fetchEnabledDashboards().finally(() => clearTimeout(timeoutId)),
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error('timeout')), PREFETCH_DASHBOARD_TIMEOUT_MS)
        }),
      ])
    } catch (error: unknown) {
      reportAppError(error, {
        context: '[AppSideEffects] Failed to prefetch enabled dashboard list',
        level: 'warn',
        fallbackMessage: 'prefetch dashboard list failed',
      })
      // Timeout or error — fall through to prefetch all
    }
    const enabledIds = getEnabledDashboardIds()

    // null = show all dashboards, otherwise only enabled + always-needed
    const chunks = enabledIds
      ? Object.entries(DASHBOARD_CHUNKS)
          .filter(([id]) => enabledIds.includes(id) || ALWAYS_PREFETCH.has(id))
          .map(([, load]) => load)
      : Object.values(DASHBOARD_CHUNKS)

    if (isDemoMode()) {
      // Demo mode: fire all immediately (synchronous data, no server load)
      chunks.forEach(load => load().catch((error: unknown) => {
        reportAppError(error, {
          context: '[AppSideEffects] Demo chunk prefetch failed',
          level: 'warn',
          fallbackMessage: 'demo chunk prefetch failed',
        })
      }))
      return
    }

    // Live mode: batch imports to avoid saturating the dev server
    let offset = 0
    const loadBatch = () => {
      const batch = chunks.slice(offset, offset + PREFETCH_BATCH_SIZE)
      if (batch.length === 0) return
      Promise.allSettled(batch.map(load => load().catch((error: unknown) => {
        reportAppError(error, {
          context: '[AppSideEffects] Dashboard chunk prefetch failed',
          level: 'warn',
          fallbackMessage: 'dashboard chunk prefetch failed',
        })
      }))).then(() => {
        offset += PREFETCH_BATCH_SIZE
        setTimeout(loadBatch, PREFETCH_BATCH_DELAY)
      })
    }
    loadBatch()
  }

  // In demo mode, fire immediately. Otherwise defer 500ms to let
  // the first page render, then start caching all chunks so
  // subsequent navigations are instant.
  if (isDemoMode()) {
    prefetchRoutes()
  } else {
    setTimeout(prefetchRoutes, SHORT_DELAY_MS)
  }
}

// ---------------------------------------------------------------------------
// Invisible side-effect components
// ---------------------------------------------------------------------------

/** Runs orbit auto-maintenance checks — must be inside provider tree */
export function OrbitAutoRunner() { useOrbitAutoRun(); return null }

// Runs usePersistedSettings early to restore settings from ~/.kc/settings.json
// if localStorage was cleared. Must be inside AuthProvider for API access.
export function SettingsSyncInit() {
  usePersistedSettings()
  return null
}

// ---------------------------------------------------------------------------
// Page view tracking
// ---------------------------------------------------------------------------

// Loading fallback delay — avoids spinner flash on fast navigation
const LOADING_FLASH_DELAY_MS = 200

// Default main dashboard card types — prefetched immediately so the first
// page renders without waiting for Dashboard.tsx to mount and trigger prefetch.
const DEFAULT_MAIN_CARD_TYPES = [
  'console_ai_offline_detection', 'hardware_health', 'cluster_health',
  'resource_usage', 'pod_issues', 'cluster_metrics', 'event_stream',
  'deployment_status', 'events_timeline',
]

// Track page views in Google Analytics on route change and set document title
export function PageViewTracker() {
  const location = useLocation()
  const { appName } = useBranding()
  const pageEnteredRef = useRef<{ path: string; timestamp: number } | null>(null)

  // Flush duration for current page (used on route change and tab close)
  const flushDuration = () => {
    if (pageEnteredRef.current) {
      const durationMs = Date.now() - pageEnteredRef.current.timestamp
      const dashboardId = pathToDashboardId(pageEnteredRef.current.path)
      if (dashboardId) {
        emitDashboardViewed(dashboardId, durationMs)
      }
    }
  }

  // Capture final page duration when the tab becomes hidden (covers tab close/switch)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flushDuration()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])

  useEffect(() => {
    // Emit duration for previous page
    flushDuration()

    // Track new page entry
    pageEnteredRef.current = { path: location.pathname, timestamp: Date.now() }

    let lookupPath = location.pathname
    if (lookupPath.startsWith(`${ROUTES.EMBED_BASE}/`)) {
      lookupPath = ROUTES.EMBED_BASE
    }

    const section = ROUTE_TITLES[lookupPath]
    const title = section ? `${section} - ${appName}` : appName
    document.title = title
    emitPageView(location.pathname)
  }, [location.pathname, appName])

  return null
}

// Prefetches core Kubernetes data and card chunks immediately after login
// so dashboard cards render instantly instead of showing skeletons.
// Uses dynamic imports to keep prefetchCardData (~92 KB useCachedData) and
// cardRegistry (~52 KB + 195 KB card configs) out of the main chunk.
export function DataPrefetchInit() {
  const { isAuthenticated } = useAuth()
  useEffect(() => {
    if (!isAuthenticated) return
    // Dynamic import: prefetchCardData pulls in useCachedData (~92 KB)
    import('../lib/prefetchCardData').then(m => m.prefetchCardData()).catch((error: unknown) => {
      reportAppError(error, {
        context: '[AppSideEffects] prefetchCardData import failed',
        level: 'warn',
        fallbackMessage: 'prefetch card data import failed',
      })
    })
    // Dynamic import: cardRegistry pulls in card configs (~195 KB)
    import('../components/cards/cardRegistry').then(m => {
      // Prefetch default dashboard card chunks immediately — don't wait for
      // Dashboard.tsx to lazy-load and mount before starting chunk downloads.
      m.prefetchCardChunks(DEFAULT_MAIN_CARD_TYPES)
      // Demo-only card chunks are lower priority — defer in live mode.
      if (isDemoMode()) {
        m.prefetchDemoCardChunks()
      } else {
        setTimeout(m.prefetchDemoCardChunks, PREFETCH_DEMO_CARDS_DELAY_MS)
      }
    }).catch((error: unknown) => {
      reportAppError(error, {
        context: '[AppSideEffects] cardRegistry import failed',
        level: 'warn',
        fallbackMessage: 'card registry import failed',
      })
    })
  }, [isAuthenticated])
  return null
}

// Loading fallback component with delay to prevent flash on fast navigation
export function LoadingFallback() {
  const [showLoading, setShowLoading] = useState(false)

  useEffect(() => {
    // Only show loading spinner if it takes more than LOADING_FLASH_DELAY_MS
    const timer = setTimeout(() => {
      setShowLoading(true)
    }, LOADING_FLASH_DELAY_MS)

    return () => clearTimeout(timer)
  }, [])

  if (!showLoading) {
    // Invisible placeholder maintains layout dimensions during route transitions,
    // preventing the content area from collapsing to 0 height (blank flash).
    return <div className="min-h-screen" />
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      {/* Full border with transparent sides enables GPU acceleration during rotation */}
      <div className="animate-spin rounded-full h-8 w-8 border-2 border-transparent border-t-primary" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Live URL subscriber — bypasses React Router's useLocation, whose state
// update is wrapped in startTransition and can be interrupted on busy pages.
// Listen to real History API mutations so pathname/search/hash stay in sync
// with the visible route instead of briefly lagging behind the URL.
// ---------------------------------------------------------------------------

const LIVE_LOCATION_EVENT = 'kc:locationchange'
const HISTORY_PATCHED_FLAG = '__kcHistoryPatched__'
const getLiveUrl = () => `${window.location.pathname}${window.location.search}${window.location.hash}`

type PatchedHistory = History & {
  [HISTORY_PATCHED_FLAG]?: boolean
}

function installLocationChangeBridge() {
  if (typeof window === 'undefined') return () => {}
  const historyWithFlag = window.history as PatchedHistory
  if (historyWithFlag[HISTORY_PATCHED_FLAG]) return () => {}

  const originalPushState = window.history.pushState
  const originalReplaceState = window.history.replaceState
  const notifyLocationChange = () => {
    window.dispatchEvent(new Event(LIVE_LOCATION_EVENT))
  }
  const wrapHistoryMethod = (method: 'pushState' | 'replaceState') => {
    const original = method === 'pushState' ? originalPushState : originalReplaceState
    window.history[method] = function (...args: Parameters<History[typeof method]>) {
      const result = original.apply(this, args)
      notifyLocationChange()
      return result
    }
  }

  wrapHistoryMethod('pushState')
  wrapHistoryMethod('replaceState')
  window.addEventListener('popstate', notifyLocationChange)
  window.addEventListener('hashchange', notifyLocationChange)
  historyWithFlag[HISTORY_PATCHED_FLAG] = true

  return () => {
    window.removeEventListener('popstate', notifyLocationChange)
    window.removeEventListener('hashchange', notifyLocationChange)
    window.history.pushState = originalPushState
    window.history.replaceState = originalReplaceState
    historyWithFlag[HISTORY_PATCHED_FLAG] = false
  }
}

if (typeof window !== 'undefined') {
  const removeLocationChangeBridge = installLocationChangeBridge()
  if (import.meta.hot) {
    import.meta.hot.dispose(removeLocationChangeBridge)
  }
}

export function useLiveUrl(): string {
  return useSyncExternalStore(
    (notify) => {
      window.addEventListener(LIVE_LOCATION_EVENT, notify)
      return () => {
        window.removeEventListener(LIVE_LOCATION_EVENT, notify)
      }
    },
    getLiveUrl,
    () => ROUTES.HOME,
  )
}

export function LiveLocationProvider({
  location,
  navigationType,
  children,
}: {
  location: Location
  navigationType: ReturnType<typeof useNavigationType>
  children: React.ReactNode
}) {
  const contextValue = useMemo(
    () => ({ location, navigationType }),
    [location, navigationType],
  )

  return (
    <UNSAFE_LocationContext.Provider value={contextValue}>
      {children}
    </UNSAFE_LocationContext.Provider>
  )
}
