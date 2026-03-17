import { lazy, Suspense, useState, useEffect, useRef } from 'react'
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
import { MissionLandingPage } from './components/missions/MissionLandingPage'

// Lazy-load DrillDownModal — the drilldown views (~64 KB) are only needed
// when a user clicks into a card detail, not on initial page render.
const DrillDownModal = lazy(() =>
  import('./components/drilldown/DrillDownModal').then(m => ({ default: m.DrillDownModal }))
)

// Lazy load all page components for better code splitting
const Login = lazy(() => import('./components/auth/Login').then(m => ({ default: m.Login })))
const AuthCallback = lazy(() => import('./components/auth/AuthCallback').then(m => ({ default: m.AuthCallback })))
const Dashboard = lazy(() => import('./components/dashboard/Dashboard').then(m => ({ default: m.Dashboard })))
const CustomDashboard = lazy(() => import('./components/dashboard/CustomDashboard').then(m => ({ default: m.CustomDashboard })))
const Settings = lazy(() => import('./components/settings/Settings').then(m => ({ default: m.Settings })))
const Clusters = lazy(() => import('./components/clusters/Clusters').then(m => ({ default: m.Clusters })))
const Events = lazy(() => import('./components/events/Events').then(m => ({ default: m.Events })))
const Workloads = lazy(() => import('./components/workloads/Workloads').then(m => ({ default: m.Workloads })))
const Storage = lazy(() => import('./components/storage/Storage').then(m => ({ default: m.Storage })))
const Compute = lazy(() => import('./components/compute/Compute').then(m => ({ default: m.Compute })))
const ClusterComparisonPage = lazy(() => import('./components/compute/ClusterComparisonPage').then(m => ({ default: m.ClusterComparisonPage })))
const Network = lazy(() => import('./components/network/Network').then(m => ({ default: m.Network })))
const Security = lazy(() => import('./components/security/Security').then(m => ({ default: m.Security })))
const GitOps = lazy(() => import('./components/gitops/GitOps').then(m => ({ default: m.GitOps })))
const Alerts = lazy(() => import('./components/alerts/Alerts').then(m => ({ default: m.Alerts })))
const Cost = lazy(() => import('./components/cost/Cost').then(m => ({ default: m.Cost })))
const Compliance = lazy(() => import('./components/compliance/Compliance').then(m => ({ default: m.Compliance })))
const DataCompliance = lazy(() => import('./components/data-compliance/DataCompliance').then(m => ({ default: m.DataCompliance })))
const GPUReservations = lazy(() => import('./components/gpu/GPUReservations').then(m => ({ default: m.GPUReservations })))
const Nodes = lazy(() => import('./components/nodes/Nodes').then(m => ({ default: m.Nodes })))
const Deployments = lazy(() => import('./components/deployments/Deployments').then(m => ({ default: m.Deployments })))
const Services = lazy(() => import('./components/services/Services').then(m => ({ default: m.Services })))
const Operators = lazy(() => import('./components/operators/Operators').then(m => ({ default: m.Operators })))
const HelmReleases = lazy(() => import('./components/helm/HelmReleases').then(m => ({ default: m.HelmReleases })))
const Logs = lazy(() => import('./components/logs/Logs').then(m => ({ default: m.Logs })))
const Pods = lazy(() => import('./components/pods/Pods').then(m => ({ default: m.Pods })))
const CardHistory = lazy(() => import('./components/history/CardHistory').then(m => ({ default: m.CardHistory })))
const UserManagementPage = lazy(() => import('./pages/UserManagement').then(m => ({ default: m.UserManagementPage })))
const NamespaceManager = lazy(() => import('./components/namespaces/NamespaceManager').then(m => ({ default: m.NamespaceManager })))
const Arcade = lazy(() => import('./components/arcade/Arcade').then(m => ({ default: m.Arcade })))
const Deploy = lazy(() => import('./components/deploy/Deploy').then(m => ({ default: m.Deploy })))
const AIML = lazy(() => import('./components/aiml/AIML').then(m => ({ default: m.AIML })))
const AIAgents = lazy(() => import('./components/aiagents/AIAgents').then(m => ({ default: m.AIAgents })))
const LLMdBenchmarks = lazy(() => import('./components/llmd-benchmarks/LLMdBenchmarks').then(m => ({ default: m.LLMdBenchmarks })))
const ClusterAdmin = lazy(() => import('./components/cluster-admin/ClusterAdmin').then(m => ({ default: m.ClusterAdmin })))
const CICD = lazy(() => import('./components/cicd/CICD').then(m => ({ default: m.CICD })))
const Insights = lazy(() => import('./components/insights/Insights').then(m => ({ default: m.Insights })))
const MultiTenancy = lazy(() => import('./components/multi-tenancy/MultiTenancy').then(m => ({ default: m.MultiTenancy })))
const Marketplace = lazy(() => import('./components/marketplace/Marketplace').then(m => ({ default: m.Marketplace })))
const MiniDashboard = lazy(() => import('./components/widget/MiniDashboard').then(m => ({ default: m.MiniDashboard })))
const FromLens = lazy(() => import('./pages/FromLens').then(m => ({ default: m.FromLens })))
const FromHeadlamp = lazy(() => import('./pages/FromHeadlamp').then(m => ({ default: m.FromHeadlamp })))
const WhiteLabel = lazy(() => import('./pages/WhiteLabel').then(m => ({ default: m.WhiteLabel })))
const UnifiedCardTest = lazy(() => import('./pages/UnifiedCardTest').then(m => ({ default: m.UnifiedCardTest })))
const UnifiedStatsTest = lazy(() => import('./pages/UnifiedStatsTest').then(m => ({ default: m.UnifiedStatsTest })))
const UnifiedDashboardTest = lazy(() => import('./pages/UnifiedDashboardTest').then(m => ({ default: m.UnifiedDashboardTest })))
const AllCardsPerfTest = lazy(() => import('./pages/AllCardsPerfTest').then(m => ({ default: m.AllCardsPerfTest })))
const CompliancePerfTest = lazy(() => import('./pages/CompliancePerfTest').then(m => ({ default: m.CompliancePerfTest })))

// Dashboard ID → chunk import map for selective prefetching.
// Only chunks for enabled dashboards are prefetched; disabled ones
// still lazy-load on demand if the user navigates directly via URL.
const DASHBOARD_CHUNKS: Record<string, () => Promise<unknown>> = {
  'dashboard': () => import('./components/dashboard/Dashboard'),
  'clusters': () => import('./components/clusters/Clusters'),
  'workloads': () => import('./components/workloads/Workloads'),
  'compute': () => import('./components/compute/Compute'),
  'events': () => import('./components/events/Events'),
  'nodes': () => import('./components/nodes/Nodes'),
  'deployments': () => import('./components/deployments/Deployments'),
  'pods': () => import('./components/pods/Pods'),
  'services': () => import('./components/services/Services'),
  'storage': () => import('./components/storage/Storage'),
  'network': () => import('./components/network/Network'),
  'security': () => import('./components/security/Security'),
  'gitops': () => import('./components/gitops/GitOps'),
  'alerts': () => import('./components/alerts/Alerts'),
  'cost': () => import('./components/cost/Cost'),
  'compliance': () => import('./components/compliance/Compliance'),
  'operators': () => import('./components/operators/Operators'),
  'helm': () => import('./components/helm/HelmReleases'),
  'settings': () => import('./components/settings/Settings'),
  'gpu-reservations': () => import('./components/gpu/GPUReservations'),
  'data-compliance': () => import('./components/data-compliance/DataCompliance'),
  'logs': () => import('./components/logs/Logs'),
  'arcade': () => import('./components/arcade/Arcade'),
  'deploy': () => import('./components/deploy/Deploy'),
  'ai-ml': () => import('./components/aiml/AIML'),
  'ai-agents': () => import('./components/aiagents/AIAgents'),
  'llm-d-benchmarks': () => import('./components/llmd-benchmarks/LLMdBenchmarks'),
  'cluster-admin': () => import('./components/cluster-admin/ClusterAdmin'),
  'ci-cd': () => import('./components/cicd/CICD'),
  'insights': () => import('./components/insights/Insights'),
  'multi-tenancy': () => import('./components/multi-tenancy/MultiTenancy'),
  'marketplace': () => import('./components/marketplace/Marketplace'),
}

// Dashboard always prefetched (it's the home page)
const ALWAYS_PREFETCH = new Set(['dashboard'])

// Prefetch lazy route chunks after initial page load.
// Batched to avoid overwhelming the Vite dev server with simultaneous
// module transformation requests (which delays navigation on cold start).
if (typeof window !== 'undefined') {
  const PREFETCH_BATCH_SIZE = 5
  const PREFETCH_BATCH_DELAY = 100

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

function App() {
  return (
    <BrandingProvider>
    <ThemeProvider>
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
      <Suspense fallback={null}><DrillDownModal /></Suspense>
      <AppErrorBoundary>
      <ChunkErrorBoundary>
      <Suspense fallback={<LoadingFallback />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/from-lens" element={<FromLens />} />
        <Route path="/from-headlamp" element={<FromHeadlamp />} />
        <Route path="/white-label" element={<WhiteLabel />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        {/* PWA Mini Dashboard - lightweight widget mode (no auth required for local monitoring) */}
        <Route path="/widget" element={<MiniDashboard />} />

        {/* Mission landing page — standalone page for deep-linked missions.
            Loads instantly without the full dashboard SPA. Shows mission
            preview with "Import & Open Console" CTA. Outside ProtectedRoute
            so unauthenticated users can see the mission details. */}
        <Route path="/missions/:missionId" element={<MissionLandingPage />} />
        <Route path="/missions" element={<MissionBrowseLink />} />

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
    </ThemeProvider>
    </BrandingProvider>
  )
}

export default App
