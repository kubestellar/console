import { Suspense, useState, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { Routes, Route, Navigate, useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import type { Location } from 'react-router-dom'
import { CardHistoryEntry } from './hooks/useCardHistory'
import { Layout } from './components/layout/Layout'
import { AuthProvider, useAuth, isJWTExpired } from './lib/auth'
import { DEMO_TOKEN_VALUE } from './lib/constants'
import { ThemeProvider } from './hooks/useTheme'
import { BrandingProvider, useBranding } from './hooks/useBranding'
import { DrillDownProvider } from './hooks/useDrillDown'
import { DashboardProvider, useDashboardContext } from './hooks/useDashboardContext'
import { GlobalFiltersProvider } from './hooks/useGlobalFilters'
import { MissionProvider } from './hooks/useMissions'
import { CardEventProvider } from './lib/cardEvents'
import { ToastProvider } from './components/ui/Toast'
import { AlertsProvider } from './contexts/AlertsContext'
import { RewardsProvider } from './hooks/useRewards'
import { NPSSurvey } from './components/feedback'
import { useOrbitAutoRun } from './hooks/useOrbitAutoRun'
import { UnifiedDemoProvider } from './lib/unified/demo'
import { ChunkErrorBoundary } from './components/ChunkErrorBoundary'
import { AppErrorBoundary } from './components/AppErrorBoundary'
import { ROUTES } from './config/routes'
import { usePersistedSettings } from './hooks/usePersistedSettings'
import { SHORT_DELAY_MS } from './lib/constants/network'
import { isDemoMode } from './lib/demoMode'
import { STORAGE_KEY_TOKEN } from './lib/constants'
import { safeGet, safeSet } from './lib/safeLocalStorage'
import { emitPageView, emitDashboardViewed } from './lib/analytics'
import { fetchEnabledDashboards, getEnabledDashboardIds } from './hooks/useSidebarConfig'
import { safeLazy } from './lib/safeLazy'
// Dashboard is the landing page — import eagerly to avoid Suspense delay on reload
import { Dashboard } from './components/dashboard/Dashboard'

const MissionLandingPage = safeLazy(() => import('./components/missions/MissionLandingPage'), 'MissionLandingPage')

// Lazy-load DrillDownModal — the drilldown views (~64 KB) are only needed
// when a user clicks into a card detail, not on initial page render.
const DrillDownModal = safeLazy(() => import('./components/drilldown/DrillDownModal'), 'DrillDownModal')

// Lazy load all page components for better code splitting.
// safeLazy() validates the named export exists, throwing a recognisable
// "chunk may be stale" error that ChunkErrorBoundary auto-recovers from.
const Login = safeLazy(() => import('./components/auth/Login'), 'Login')
const AuthCallback = safeLazy(() => import('./components/auth/AuthCallback'), 'AuthCallback')
const CustomDashboard = safeLazy(() => import('./components/dashboard/CustomDashboard'), 'CustomDashboard')
const Settings = safeLazy(() => import('./components/settings/Settings'), 'Settings')
// Eagerly import key sidebar dashboards to prevent React Router's
// startTransition from keeping the old route visible during lazy loading.
import { Clusters } from './components/clusters/Clusters'
const Events = safeLazy(() => import('./components/events/Events'), 'Events')
const Workloads = safeLazy(() => import('./components/workloads/Workloads'), 'Workloads')
const Storage = safeLazy(() => import('./components/storage/Storage'), 'Storage')
const Compute = safeLazy(() => import('./components/compute/Compute'), 'Compute')
const ClusterComparisonPage = safeLazy(() => import('./components/compute/ClusterComparisonPage'), 'ClusterComparisonPage')
const Network = safeLazy(() => import('./components/network/Network'), 'Network')
import { Security } from './components/security/Security'
const GitOps = safeLazy(() => import('./components/gitops/GitOps'), 'GitOps')
const Alerts = safeLazy(() => import('./components/alerts/Alerts'), 'Alerts')
const Cost = safeLazy(() => import('./components/cost/Cost'), 'Cost')
const Compliance = safeLazy(() => import('./components/compliance/Compliance'), 'Compliance')
const DataCompliance = safeLazy(() => import('./components/data-compliance/DataCompliance'), 'DataCompliance')
const GPUReservations = safeLazy(() => import('./components/gpu/GPUReservations'), 'GPUReservations')
const KarmadaOps = safeLazy(() => import('./components/karmada-ops/KarmadaOps'), 'KarmadaOps')
const Nodes = safeLazy(() => import('./components/nodes/Nodes'), 'Nodes')
const Deployments = safeLazy(() => import('./components/deployments/Deployments'), 'Deployments')
const Services = safeLazy(() => import('./components/services/Services'), 'Services')
const Operators = safeLazy(() => import('./components/operators/Operators'), 'Operators')
const HelmReleases = safeLazy(() => import('./components/helm/HelmReleases'), 'HelmReleases')
const Logs = safeLazy(() => import('./components/logs/Logs'), 'Logs')
const Pods = safeLazy(() => import('./components/pods/Pods'), 'Pods')
const CardHistory = safeLazy(() => import('./components/history/CardHistory'), 'CardHistory')
const UserManagementPage = safeLazy(() => import('./pages/UserManagement'), 'UserManagementPage')
const NamespaceManager = safeLazy(() => import('./components/namespaces/NamespaceManager'), 'NamespaceManager')
const Arcade = safeLazy(() => import('./components/arcade/Arcade'), 'Arcade')
const Deploy = safeLazy(() => import('./components/deploy/Deploy'), 'Deploy')
const AIML = safeLazy(() => import('./components/aiml/AIML'), 'AIML')
const AIAgents = safeLazy(() => import('./components/aiagents/AIAgents'), 'AIAgents')
const LLMdBenchmarks = safeLazy(() => import('./components/llmd-benchmarks/LLMdBenchmarks'), 'LLMdBenchmarks')
import { ClusterAdmin } from './components/cluster-admin/ClusterAdmin'
const CICD = safeLazy(() => import('./components/cicd/CICD'), 'CICD')
const Insights = safeLazy(() => import('./components/insights/Insights'), 'Insights')
const MultiTenancy = safeLazy(() => import('./components/multi-tenancy/MultiTenancy'), 'MultiTenancy')
const Drasi = safeLazy(() => import('./components/drasi/Drasi'), 'Drasi')
const Marketplace = safeLazy(() => import('./components/marketplace/Marketplace'), 'Marketplace')
const MiniDashboard = safeLazy(() => import('./components/widget/MiniDashboard'), 'MiniDashboard')
const Welcome = safeLazy(() => import('./pages/Welcome'), 'Welcome')
const FromLens = safeLazy(() => import('./pages/FromLens'), 'FromLens')
const FromHeadlamp = safeLazy(() => import('./pages/FromHeadlamp'), 'FromHeadlamp')
const FromHolmesGPT = safeLazy(() => import('./pages/FromHolmesGPT'), 'FromHolmesGPT')
const FeatureInspektorGadget = safeLazy(() => import('./pages/FeatureInspektorGadget'), 'FeatureInspektorGadget')
const FeatureKagent = safeLazy(() => import('./pages/FeatureKagent'), 'FeatureKagent')
const WhiteLabel = safeLazy(() => import('./pages/WhiteLabel'), 'WhiteLabel')
const UnifiedCardTest = safeLazy(() => import('./pages/UnifiedCardTest'), 'UnifiedCardTest')
const UnifiedStatsTest = safeLazy(() => import('./pages/UnifiedStatsTest'), 'UnifiedStatsTest')
const UnifiedDashboardTest = safeLazy(() => import('./pages/UnifiedDashboardTest'), 'UnifiedDashboardTest')
const AllCardsPerfTest = safeLazy(() => import('./pages/AllCardsPerfTest'), 'AllCardsPerfTest')
const CompliancePerfTest = safeLazy(() => import('./pages/CompliancePerfTest'), 'CompliancePerfTest')

// Dashboard ID → chunk import map (shared with hover prefetch in Sidebar)
import { DASHBOARD_CHUNKS } from './lib/dashboardChunks'

// Always prefetched regardless of enabled dashboards
const ALWAYS_PREFETCH = new Set(['dashboard', 'settings', 'clusters', 'cluster-admin', 'security', 'deploy'])

// Prefetch lazy route chunks after initial page load.
// Batched to avoid overwhelming the Vite dev server with simultaneous
// module transformation requests (which delays navigation on cold start).
if (typeof window !== 'undefined') {
  const PREFETCH_BATCH_SIZE = 8
  const PREFETCH_BATCH_DELAY = 50
  /** Max wait (ms) for the enabled-dashboards list before prefetching all chunks */
  const PREFETCH_DASHBOARD_TIMEOUT_MS = 2_000

  const prefetchRoutes = async () => {
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
    } catch {
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
      chunks.forEach(load => load().catch(() => {}))
      return
    }

    // Live mode: batch imports to avoid saturating the dev server
    let offset = 0
    const loadBatch = () => {
      const batch = chunks.slice(offset, offset + PREFETCH_BATCH_SIZE)
      if (batch.length === 0) return
      Promise.allSettled(batch.map(load => load().catch(() => {}))).then(() => {
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

/** Runs orbit auto-maintenance checks — must be inside provider tree */
function OrbitAutoRunner() { useOrbitAutoRun(); return null }

// Wrap lazy route elements in their own Suspense boundary so the route
// change is immediate. Without this, React 18's concurrent transitions
// keep the OLD route visible while the new lazy component loads.
function SuspenseRoute({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<LoadingFallback />}>{children}</Suspense>
}

// Loading fallback component with delay to prevent flash on fast navigation
function LoadingFallback() {
  const [showLoading, setShowLoading] = useState(false)

  useEffect(() => {
    // Only show loading spinner if it takes more than 200ms
    const timer = setTimeout(() => {
      setShowLoading(true)
    }, 200)

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

// Wrapper for CardHistory that provides the restore functionality
function CardHistoryWithRestore() {
  const navigate = useNavigate()
  const { setPendingRestoreCard } = useDashboardContext()

  const handleRestoreCard = (entry: CardHistoryEntry) => {
    // Set the card to be restored in context
    setPendingRestoreCard({
      cardType: entry.cardType,
      cardTitle: entry.cardTitle,
      config: entry.config,
      dashboardId: entry.dashboardId,
    })
    // Navigate to the dashboard
    navigate(ROUTES.HOME)
  }

  return <CardHistory onRestoreCard={handleRestoreCard} />
}

/** Key for preserving the intended destination through the OAuth login flow */
const RETURN_TO_KEY = 'kubestellar-return-to'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    // #6058 — Optimistically render only when the token in localStorage is
    // either the demo sentinel or a JWT that's still within its exp window.
    // If the token is expired, showing protected children would leak content
    // to an unauthenticated user during the brief refreshUser() window. In
    // that case render nothing (a spinner placeholder) until auth resolves.
    const storedToken = safeGet(STORAGE_KEY_TOKEN)
    if (storedToken && (storedToken === DEMO_TOKEN_VALUE || !isJWTExpired(storedToken))) {
      return <>{children}</>
    }
    return null
  }

  if (!isAuthenticated) {
    // Save the intended destination so AuthCallback can return here after login.
    // This preserves deep-link params like ?mission= through the OAuth round-trip.
    const destination = location.pathname + location.search
    if (destination !== '/' && destination !== '/login') {
      safeSet(RETURN_TO_KEY, destination)
    }
    return <Navigate to={ROUTES.LOGIN} replace />
  }

  return <>{children}</>
}

// Runs usePersistedSettings early to restore settings from ~/.kc/settings.json
// if localStorage was cleared. Must be inside AuthProvider for API access.
function SettingsSyncInit() {
  usePersistedSettings()
  return null
}

/** Redirect /missions → /?browse=missions to open MissionBrowser.
 *  Redirect /missions/:missionId → /?mission=:missionId to open a specific mission.
 *  Preserves UTM and other query params so GA4 campaign attribution survives the redirect. */
function IssueRedirect() {
  const navigate = useNavigate()
  const dispatched = useRef(false)
  useEffect(() => {
    if (!dispatched.current) {
      dispatched.current = true
      navigate(ROUTES.HOME, { replace: true })
      window.dispatchEvent(new CustomEvent('open-feedback'))
    }
  }, [navigate])
  return null
}

function FeatureRedirect() {
  const navigate = useNavigate()
  const dispatched = useRef(false)
  useEffect(() => {
    if (!dispatched.current) {
      dispatched.current = true
      navigate(ROUTES.HOME, { replace: true })
      window.dispatchEvent(new CustomEvent('open-feedback-feature'))
    }
  }, [navigate])
  return null
}

function MissionBrowseLink() {
  const [searchParams] = useSearchParams()
  const params = new URLSearchParams(searchParams)
  params.set('browse', 'missions')
  return <Navigate to={`/?${params.toString()}`} replace />
}

// MissionDeepLink removed — replaced by MissionLandingPage standalone component

// Route-to-title map for GA4 page view granularity and browser tab labeling
const ROUTE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/clusters': 'My Clusters',
  '/cluster-admin': 'Cluster Admin',
  '/nodes': 'Nodes',
  '/namespaces': 'Namespaces',
  '/deployments': 'Deployments',
  '/pods': 'Pods',
  '/services': 'Services',
  '/workloads': 'Workloads',
  '/operators': 'Operators',
  '/helm': 'Helm',
  '/logs': 'Logs',
  '/events': 'Events',
  '/compute': 'Compute',
  '/compute/compare': 'Cluster Comparison',
  '/storage': 'Storage',
  '/network': 'Network',
  '/alerts': 'Alerts',
  '/security': 'Security',
  '/security-posture': 'Security Posture',
  '/compliance': 'Compliance',
  '/data-compliance': 'Data Compliance',
  '/gitops': 'GitOps',
  '/cost': 'Cost',
  '/gpu-reservations': 'GPU Reservations',
  '/deploy': 'Deploy',
  '/ai-ml': 'AI/ML',
  '/ai-agents': 'AI Agents',
  '/ci-cd': 'CI/CD',
  '/karmada-ops': 'Karmada Ops',
  '/llm-d-benchmarks': 'llm-d Benchmarks',
  '/multi-tenancy': 'Multi-Tenancy',
  '/drasi': 'Drasi',
  '/arcade': 'Arcade',
  '/marketplace': 'Marketplace',
  '/missions': 'Missions',
  '/history': 'Card History',
  '/settings': 'Settings',
  '/users': 'User Management',
  '/login': 'Login',
  '/from-lens': 'Switching from Lens',
  '/from-headlamp': 'Coming from Headlamp',
  '/from-holmesgpt': 'Coming from HolmesGPT',
  '/feature-inspektorgadget': 'Inspektor Gadget Integration',
  '/feature-kagent': 'Kagent Integration',
  '/white-label': 'White-Label Your Console',
}

/** Map route paths to dashboard IDs for duration analytics */
function pathToDashboardId(path: string): string | null {
  if (path === '/') return 'main'
  if (path.startsWith('/custom-dashboard/')) return path.replace('/custom-dashboard/', 'custom-')
  const id = path.replace(/^\//, '')
  return id || null
}

// Track page views in Google Analytics on route change and set document title
function PageViewTracker() {
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

    const section = ROUTE_TITLES[location.pathname]
    const title = section ? `${section} - ${appName}` : appName
    document.title = title
    emitPageView(location.pathname)
  }, [location.pathname, appName])

  return null
}

// Default main dashboard card types — prefetched immediately so the first
// page renders without waiting for Dashboard.tsx to mount and trigger prefetch.
const DEFAULT_MAIN_CARD_TYPES = [
  'console_ai_offline_detection', 'hardware_health', 'cluster_health',
  'resource_usage', 'pod_issues', 'cluster_metrics', 'event_stream',
  'deployment_status', 'events_timeline',
]

// Prefetches core Kubernetes data and card chunks immediately after login
// so dashboard cards render instantly instead of showing skeletons.
// Uses dynamic imports to keep prefetchCardData (~92 KB useCachedData) and
// cardRegistry (~52 KB + 195 KB card configs) out of the main chunk.
function DataPrefetchInit() {
  const { isAuthenticated } = useAuth()
  useEffect(() => {
    if (!isAuthenticated) return
    // Dynamic import: prefetchCardData pulls in useCachedData (~92 KB)
    import('./lib/prefetchCardData').then(m => m.prefetchCardData()).catch(() => {})
    // Dynamic import: cardRegistry pulls in card configs (~195 KB)
    import('./components/cards/cardRegistry').then(m => {
      // Prefetch default dashboard card chunks immediately — don't wait for
      // Dashboard.tsx to lazy-load and mount before starting chunk downloads.
      m.prefetchCardChunks(DEFAULT_MAIN_CARD_TYPES)
      // Demo-only card chunks are lower priority — defer 15s in live mode.
      if (isDemoMode()) {
        m.prefetchDemoCardChunks()
      } else {
        setTimeout(m.prefetchDemoCardChunks, 15_000)
      }
    }).catch(() => {})
  }, [isAuthenticated])
  return null
}

// ⚠️ PERFORMANCE CRITICAL — DO NOT MOVE MISSION ROUTES INTO FullDashboardApp ⚠️
//
// Mission landing pages (/missions/:missionId) MUST stay in LightweightShell,
// NOT inside the FullDashboardApp provider stack. The full stack loads 12
// providers + 156 JS chunks (1.8MB) which caused 10-20s cold-cache load times.
// LightweightShell loads only ~200KB. If you move mission routes back into
// FullDashboardApp, the CNCF outreach links will be unusably slow.
//
/** Lightweight shell for standalone pages that don't need the full dashboard provider stack.
 *  Includes PageViewTracker so GA4 page_view events fire for landing pages too. */
function LightweightShell({ children }: { children: React.ReactNode }) {
  return (
    <BrandingProvider>
    <ThemeProvider>
    <AppErrorBoundary>
    <ChunkErrorBoundary>
    <PageViewTracker />
    <Suspense fallback={<LoadingFallback />}>
      {children}
    </Suspense>
    </ChunkErrorBoundary>
    </AppErrorBoundary>
    </ThemeProvider>
    </BrandingProvider>
  )
}

// Live pathname subscriber — bypasses React Router's useLocation, whose
// state update is wrapped in startTransition and can be perpetually
// interrupted on cluster-heavy pages (the "needs 2 clicks" symptom from
// issue 7865). Polls window.location.pathname and notifies React via
// useSyncExternalStore, which guarantees a synchronous (non-deferrable)
// update. We pass this value to <Routes location={...}> below so route
// matching uses the real URL, not React Router's stale internal state.
const LIVE_PATH_POLL_MS = 60
function useLivePathname(): string {
  return useSyncExternalStore(
    (notify) => {
      let last = window.location.pathname
      const tick = () => {
        const cur = window.location.pathname
        if (cur !== last) { last = cur; notify() }
      }
      const interval = setInterval(tick, LIVE_PATH_POLL_MS)
      const handler = () => notify()
      window.addEventListener('popstate', handler)
      return () => {
        clearInterval(interval)
        window.removeEventListener('popstate', handler)
      }
    },
    () => window.location.pathname,
    () => '/'
  )
}

function App() {
  const livePath = useLivePathname()
  // Merge the real router location (which carries search/hash/state and —
  // critically — a real `key` that changes on every navigation) with the
  // live pathname. Hardcoding `key: 'default'` breaks effects across the
  // app that fire on `location.key` change (Dashboard, Clusters, Compute
  // re-fetch; Settings distinguishes direct load vs in-app nav via
  // `location.key !== 'default'`).
  const routerLocation = useLocation()
  const liveLocation = useMemo(
    () => ({ ...routerLocation, pathname: livePath }),
    [routerLocation, livePath],
  )
  return (
    <BrandingProvider>
    <ThemeProvider>
    <Routes location={liveLocation}>
      {/* ── Lightweight routes ─────────────────────────────────────────
          Mission landing pages load WITHOUT the heavy dashboard provider
          stack (no DashboardProvider, AlertsProvider, MissionProvider,
          CardEventProvider, etc.). This cuts initial JS from ~1.8MB to
          ~200KB and eliminates cold-start API calls. */}
      <Route path={ROUTES.MISSION} element={
        <LightweightShell><MissionLandingPage /></LightweightShell>
      } />
      <Route path={ROUTES.MISSIONS} element={
        <LightweightShell><MissionBrowseLink /></LightweightShell>
      } />

      {/* ── Public landing pages ──────────────────────────────────────
          Marketing/comparison pages that must render without auth.
          On Netlify (no Go backend), AuthProvider blocks forever
          waiting for /api/me — these pages skip that entirely. */}
      <Route path={ROUTES.FROM_LENS} element={<LightweightShell><FromLens /></LightweightShell>} />
      <Route path={ROUTES.FROM_HEADLAMP} element={<LightweightShell><FromHeadlamp /></LightweightShell>} />
      <Route path={ROUTES.FROM_HOLMESGPT} element={<LightweightShell><FromHolmesGPT /></LightweightShell>} />
      <Route path={ROUTES.FEATURE_INSPEKTORGADGET} element={<LightweightShell><FeatureInspektorGadget /></LightweightShell>} />
      <Route path={ROUTES.FEATURE_KAGENT} element={<LightweightShell><FeatureKagent /></LightweightShell>} />
      <Route path={ROUTES.WHITE_LABEL} element={<LightweightShell><WhiteLabel /></LightweightShell>} />
      <Route path={ROUTES.WELCOME} element={<LightweightShell><Welcome /></LightweightShell>} />

      {/* ── Full dashboard routes ─────────────────────────────────────
          Everything else gets the full provider stack. */}
      <Route path="*" element={<FullDashboardApp liveLocation={liveLocation} />} />
    </Routes>
    </ThemeProvider>
    </BrandingProvider>
  )
}

/** Full dashboard app with all providers — loaded only for non-mission routes */
function FullDashboardApp({ liveLocation }: { liveLocation: Location }) {
  return (
    <AuthProvider>
    <SettingsSyncInit />
    <PageViewTracker />
    <DataPrefetchInit />
    <UnifiedDemoProvider>
      <RewardsProvider>
      <ToastProvider>
      <GlobalFiltersProvider>
      <MissionProvider>
      <CardEventProvider>
      <AlertsProvider>
      <DashboardProvider>
      <DrillDownProvider>
      <AppErrorBoundary>
      <Suspense fallback={null}><DrillDownModal /></Suspense>
      <NPSSurvey />
      <OrbitAutoRunner />
      <ChunkErrorBoundary>
      <Routes location={liveLocation}>
        <Route path={ROUTES.LOGIN} element={<SuspenseRoute><Login /></SuspenseRoute>} />
        <Route path={ROUTES.AUTH_CALLBACK} element={<SuspenseRoute><AuthCallback /></SuspenseRoute>} />
        {/* PWA Mini Dashboard - lightweight widget mode (no auth required for local monitoring) */}
        <Route path={ROUTES.WIDGET} element={<SuspenseRoute><MiniDashboard /></SuspenseRoute>} />

        {/* Layout route — all dashboard routes share a single Layout instance.
            KeepAliveOutlet preserves component state across navigations so that
            warm-nav is near-instant (no unmount/remount). */}
        <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route index element={<Dashboard />} />
          <Route path={ROUTES.CUSTOM_DASHBOARD} element={<CustomDashboard />} />
          {/* Test routes — rendered with Layout but not cached by KeepAlive */}
          <Route path={ROUTES.PERF_ALL_CARDS} element={<AllCardsPerfTest />} />
          <Route path={ROUTES.PERF_COMPLIANCE} element={<CompliancePerfTest />} />
          <Route path={ROUTES.CLUSTERS} element={<SuspenseRoute><Clusters /></SuspenseRoute>} />
          <Route path={ROUTES.WORKLOADS} element={<SuspenseRoute><Workloads /></SuspenseRoute>} />
          <Route path={ROUTES.NODES} element={<SuspenseRoute><Nodes /></SuspenseRoute>} />
          <Route path={ROUTES.DEPLOYMENTS} element={<SuspenseRoute><Deployments /></SuspenseRoute>} />
          <Route path={ROUTES.PODS} element={<SuspenseRoute><Pods /></SuspenseRoute>} />
          <Route path={ROUTES.SERVICES} element={<SuspenseRoute><Services /></SuspenseRoute>} />
          <Route path={ROUTES.OPERATORS} element={<SuspenseRoute><Operators /></SuspenseRoute>} />
          <Route path={ROUTES.HELM} element={<SuspenseRoute><HelmReleases /></SuspenseRoute>} />
          <Route path={ROUTES.LOGS} element={<SuspenseRoute><Logs /></SuspenseRoute>} />
          <Route path={ROUTES.COMPUTE} element={<SuspenseRoute><Compute /></SuspenseRoute>} />
          <Route path={ROUTES.COMPUTE_COMPARE} element={<SuspenseRoute><ClusterComparisonPage /></SuspenseRoute>} />
          <Route path={ROUTES.STORAGE} element={<SuspenseRoute><Storage /></SuspenseRoute>} />
          <Route path={ROUTES.NETWORK} element={<SuspenseRoute><Network /></SuspenseRoute>} />
          <Route path={ROUTES.EVENTS} element={<SuspenseRoute><Events /></SuspenseRoute>} />
          <Route path={ROUTES.SECURITY} element={<SuspenseRoute><Security /></SuspenseRoute>} />
          <Route path={ROUTES.GITOPS} element={<SuspenseRoute><GitOps /></SuspenseRoute>} />
          <Route path={ROUTES.ALERTS} element={<SuspenseRoute><Alerts /></SuspenseRoute>} />
          <Route path={ROUTES.COST} element={<SuspenseRoute><Cost /></SuspenseRoute>} />
          <Route path={ROUTES.SECURITY_POSTURE} element={<SuspenseRoute><Compliance /></SuspenseRoute>} />
          {/* Legacy route for backwards compatibility */}
          <Route path={ROUTES.COMPLIANCE} element={<SuspenseRoute><Compliance /></SuspenseRoute>} />
          <Route path={ROUTES.DATA_COMPLIANCE} element={<SuspenseRoute><DataCompliance /></SuspenseRoute>} />
          <Route path={ROUTES.GPU_RESERVATIONS} element={<SuspenseRoute><GPUReservations /></SuspenseRoute>} />
          <Route path={ROUTES.KARMADA_OPS} element={<SuspenseRoute><KarmadaOps /></SuspenseRoute>} />
          <Route path={ROUTES.HISTORY} element={<SuspenseRoute><CardHistoryWithRestore /></SuspenseRoute>} />
          <Route path={ROUTES.SETTINGS} element={<SuspenseRoute><Settings /></SuspenseRoute>} />
          <Route path={ROUTES.USERS} element={<SuspenseRoute><UserManagementPage /></SuspenseRoute>} />
          <Route path={ROUTES.NAMESPACES} element={<SuspenseRoute><NamespaceManager /></SuspenseRoute>} />
          <Route path={ROUTES.ARCADE} element={<SuspenseRoute><Arcade /></SuspenseRoute>} />
          <Route path={ROUTES.DEPLOY} element={<SuspenseRoute><Deploy /></SuspenseRoute>} />
          <Route path={ROUTES.AI_ML} element={<SuspenseRoute><AIML /></SuspenseRoute>} />
          <Route path={ROUTES.AI_AGENTS} element={<SuspenseRoute><AIAgents /></SuspenseRoute>} />
          <Route path={ROUTES.LLM_D_BENCHMARKS} element={<SuspenseRoute><LLMdBenchmarks /></SuspenseRoute>} />
          <Route path={ROUTES.CLUSTER_ADMIN} element={<SuspenseRoute><ClusterAdmin /></SuspenseRoute>} />
          <Route path={ROUTES.CI_CD} element={<SuspenseRoute><CICD /></SuspenseRoute>} />
          <Route path={ROUTES.INSIGHTS} element={<SuspenseRoute><Insights /></SuspenseRoute>} />
          <Route path={ROUTES.MULTI_TENANCY} element={<SuspenseRoute><MultiTenancy /></SuspenseRoute>} />
          <Route path={ROUTES.DRASI} element={<SuspenseRoute><Drasi /></SuspenseRoute>} />
          <Route path={ROUTES.MARKETPLACE} element={<SuspenseRoute><Marketplace /></SuspenseRoute>} />
          {/* Dev test routes for unified framework validation */}
          <Route path={ROUTES.TEST_UNIFIED_CARD} element={<UnifiedCardTest />} />
          <Route path={ROUTES.TEST_UNIFIED_STATS} element={<UnifiedStatsTest />} />
          <Route path={ROUTES.TEST_UNIFIED_DASHBOARD} element={<UnifiedDashboardTest />} />
          {/* Mission deep-link: /missions/install-prometheus → opens MissionBrowser.
              Must be inside ProtectedRoute so auth is verified before redirect,
              and the ?mission= param survives the OAuth round-trip. */}
          {/* Mission routes moved outside ProtectedRoute for the landing page */}
          {/* /issue, /issues, /feedback open the feedback modal on the dashboard */}
          <Route path={ROUTES.ISSUE} element={<IssueRedirect />} />
          <Route path={ROUTES.ISSUES} element={<IssueRedirect />} />
          <Route path={ROUTES.FEEDBACK} element={<IssueRedirect />} />
          {/* /feature, /features open the feedback modal on the feature tab */}
          <Route path={ROUTES.FEATURE} element={<FeatureRedirect />} />
          <Route path={ROUTES.FEATURES} element={<FeatureRedirect />} />
        </Route>

        <Route path="*" element={<Navigate to={ROUTES.HOME} replace />} />
      </Routes>
      </ChunkErrorBoundary>
      </AppErrorBoundary>
      </DrillDownProvider>
      </DashboardProvider>
      </AlertsProvider>
      </CardEventProvider>
      </MissionProvider>
      </GlobalFiltersProvider>
      </ToastProvider>
      </RewardsProvider>
    </UnifiedDemoProvider>
    </AuthProvider>
  )
}

export default App
