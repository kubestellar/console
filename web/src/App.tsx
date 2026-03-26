import { Suspense, useState, useEffect, useRef } from 'react'
import { Routes, Route, Navigate, useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { CardHistoryEntry } from './hooks/useCardHistory'
import { Layout } from './components/layout/Layout'
import { AuthProvider, useAuth } from './lib/auth'
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
import { UnifiedDemoProvider } from './lib/unified/demo'
import { ChunkErrorBoundary } from './components/ChunkErrorBoundary'
import { AppErrorBoundary } from './components/AppErrorBoundary'
import { ROUTES } from './config/routes'
import { usePersistedSettings } from './hooks/usePersistedSettings'
import { SHORT_DELAY_MS } from './lib/constants/network'
import { isDemoMode } from './lib/demoMode'
import { STORAGE_KEY_TOKEN } from './lib/constants'
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
const Clusters = safeLazy(() => import('./components/clusters/Clusters'), 'Clusters')
const Events = safeLazy(() => import('./components/events/Events'), 'Events')
const Workloads = safeLazy(() => import('./components/workloads/Workloads'), 'Workloads')
const Storage = safeLazy(() => import('./components/storage/Storage'), 'Storage')
const Compute = safeLazy(() => import('./components/compute/Compute'), 'Compute')
const ClusterComparisonPage = safeLazy(() => import('./components/compute/ClusterComparisonPage'), 'ClusterComparisonPage')
const Network = safeLazy(() => import('./components/network/Network'), 'Network')
const Security = safeLazy(() => import('./components/security/Security'), 'Security')
const GitOps = safeLazy(() => import('./components/gitops/GitOps'), 'GitOps')
const Alerts = safeLazy(() => import('./components/alerts/Alerts'), 'Alerts')
const Cost = safeLazy(() => import('./components/cost/Cost'), 'Cost')
const Compliance = safeLazy(() => import('./components/compliance/Compliance'), 'Compliance')
const DataCompliance = safeLazy(() => import('./components/data-compliance/DataCompliance'), 'DataCompliance')
const GPUReservations = safeLazy(() => import('./components/gpu/GPUReservations'), 'GPUReservations')
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
const ClusterAdmin = safeLazy(() => import('./components/cluster-admin/ClusterAdmin'), 'ClusterAdmin')
const CICD = safeLazy(() => import('./components/cicd/CICD'), 'CICD')
const Insights = safeLazy(() => import('./components/insights/Insights'), 'Insights')
const MultiTenancy = safeLazy(() => import('./components/multi-tenancy/MultiTenancy'), 'MultiTenancy')
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
const ALWAYS_PREFETCH = new Set(['dashboard', 'settings', 'clusters'])

// Prefetch lazy route chunks after initial page load.
// Batched to avoid overwhelming the Vite dev server with simultaneous
// module transformation requests (which delays navigation on cold start).
if (typeof window !== 'undefined') {
  const PREFETCH_BATCH_SIZE = 8
  const PREFETCH_BATCH_DELAY = 50

  const prefetchRoutes = async () => {
    // Wait for the enabled dashboards list from /health so we only
    // prefetch chunks the user will actually see.
    await fetchEnabledDashboards()
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
    // If we have a token (likely authenticated), render children optimistically
    // to avoid a blank flash. Auth resolves almost instantly from localStorage
    // cache. The stale-while-revalidate pattern in AuthProvider means isLoading
    // is only true when there's no cached user, so this is safe.
    if (localStorage.getItem(STORAGE_KEY_TOKEN)) {
      return <>{children}</>
    }
    return null
  }

  if (!isAuthenticated) {
    // Save the intended destination so AuthCallback can return here after login.
    // This preserves deep-link params like ?mission= through the OAuth round-trip.
    const destination = location.pathname + location.search
    if (destination !== '/' && destination !== '/login') {
      localStorage.setItem(RETURN_TO_KEY, destination)
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
  '/llm-d-benchmarks': 'llm-d Benchmarks',
  '/multi-tenancy': 'Multi-Tenancy',
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
/** Lightweight shell for standalone pages that don't need the full dashboard provider stack */
function LightweightShell({ children }: { children: React.ReactNode }) {
  return (
    <BrandingProvider>
    <ThemeProvider>
    <AppErrorBoundary>
    <ChunkErrorBoundary>
    <Suspense fallback={<LoadingFallback />}>
      {children}
    </Suspense>
    </ChunkErrorBoundary>
    </AppErrorBoundary>
    </ThemeProvider>
    </BrandingProvider>
  )
}

function App() {
  return (
    <BrandingProvider>
    <ThemeProvider>
    <Routes>
      {/* ── Lightweight routes ─────────────────────────────────────────
          Mission landing pages load WITHOUT the heavy dashboard provider
          stack (no DashboardProvider, AlertsProvider, MissionProvider,
          CardEventProvider, etc.). This cuts initial JS from ~1.8MB to
          ~200KB and eliminates cold-start API calls. */}
      <Route path="/missions/:missionId" element={
        <LightweightShell><MissionLandingPage /></LightweightShell>
      } />
      <Route path="/missions" element={
        <LightweightShell><MissionBrowseLink /></LightweightShell>
      } />

      {/* ── Full dashboard routes ─────────────────────────────────────
          Everything else gets the full provider stack. */}
      <Route path="*" element={<FullDashboardApp />} />
    </Routes>
    </ThemeProvider>
    </BrandingProvider>
  )
}

/** Full dashboard app with all providers — loaded only for non-mission routes */
function FullDashboardApp() {
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
      <ChunkErrorBoundary>
      <Suspense fallback={<LoadingFallback />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/welcome" element={<Welcome />} />
        <Route path="/from-lens" element={<FromLens />} />
        <Route path="/from-headlamp" element={<FromHeadlamp />} />
        <Route path="/from-holmesgpt" element={<FromHolmesGPT />} />
        <Route path="/feature-inspektorgadget" element={<FeatureInspektorGadget />} />
        <Route path="/feature-kagent" element={<FeatureKagent />} />
        <Route path="/white-label" element={<WhiteLabel />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        {/* PWA Mini Dashboard - lightweight widget mode (no auth required for local monitoring) */}
        <Route path="/widget" element={<MiniDashboard />} />

        {/* Layout route — all dashboard routes share a single Layout instance.
            KeepAliveOutlet preserves component state across navigations so that
            warm-nav is near-instant (no unmount/remount). */}
        <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route index element={<Dashboard />} />
          <Route path="/custom-dashboard/:id" element={<CustomDashboard />} />
          {/* Test routes — rendered with Layout but not cached by KeepAlive */}
          <Route path="/__perf/all-cards" element={<AllCardsPerfTest />} />
          <Route path="/__compliance/all-cards" element={<CompliancePerfTest />} />
          <Route path="/clusters" element={<Clusters />} />
          <Route path="/workloads" element={<Workloads />} />
          <Route path="/nodes" element={<Nodes />} />
          <Route path="/deployments" element={<Deployments />} />
          <Route path="/pods" element={<Pods />} />
          <Route path="/services" element={<Services />} />
          <Route path="/operators" element={<Operators />} />
          <Route path="/helm" element={<HelmReleases />} />
          <Route path="/logs" element={<Logs />} />
          <Route path="/compute" element={<Compute />} />
          <Route path="/compute/compare" element={<ClusterComparisonPage />} />
          <Route path="/storage" element={<Storage />} />
          <Route path="/network" element={<Network />} />
          <Route path="/events" element={<Events />} />
          <Route path="/security" element={<Security />} />
          <Route path="/gitops" element={<GitOps />} />
          <Route path="/alerts" element={<Alerts />} />
          <Route path="/cost" element={<Cost />} />
          <Route path="/security-posture" element={<Compliance />} />
          {/* Legacy route for backwards compatibility */}
          <Route path="/compliance" element={<Compliance />} />
          <Route path="/data-compliance" element={<DataCompliance />} />
          <Route path="/gpu-reservations" element={<GPUReservations />} />
          <Route path="/history" element={<CardHistoryWithRestore />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/users" element={<UserManagementPage />} />
          <Route path="/namespaces" element={<NamespaceManager />} />
          <Route path="/arcade" element={<Arcade />} />
          <Route path="/deploy" element={<Deploy />} />
          <Route path="/ai-ml" element={<AIML />} />
          <Route path="/ai-agents" element={<AIAgents />} />
          <Route path="/llm-d-benchmarks" element={<LLMdBenchmarks />} />
          <Route path="/cluster-admin" element={<ClusterAdmin />} />
          <Route path="/ci-cd" element={<CICD />} />
          <Route path="/insights" element={<Insights />} />
          <Route path="/multi-tenancy" element={<MultiTenancy />} />
          <Route path="/marketplace" element={<Marketplace />} />
          {/* Dev test routes for unified framework validation */}
          <Route path="/test/unified-card" element={<UnifiedCardTest />} />
          <Route path="/test/unified-stats" element={<UnifiedStatsTest />} />
          <Route path="/test/unified-dashboard" element={<UnifiedDashboardTest />} />
          {/* Mission deep-link: /missions/install-prometheus → opens MissionBrowser.
              Must be inside ProtectedRoute so auth is verified before redirect,
              and the ?mission= param survives the OAuth round-trip. */}
          {/* Mission routes moved outside ProtectedRoute for the landing page */}
          {/* /issue, /issues, /feedback open the feedback modal on the dashboard */}
          <Route path="/issue" element={<IssueRedirect />} />
          <Route path="/issues" element={<IssueRedirect />} />
          <Route path="/feedback" element={<IssueRedirect />} />
          {/* /feature, /features open the feedback modal on the feature tab */}
          <Route path="/feature" element={<FeatureRedirect />} />
          <Route path="/features" element={<FeatureRedirect />} />
        </Route>

        <Route path="*" element={<Navigate to={ROUTES.HOME} replace />} />
      </Routes>
      </Suspense>
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
