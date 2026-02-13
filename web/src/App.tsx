import { lazy, Suspense, useState, useEffect } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { CardHistoryEntry } from './hooks/useCardHistory'
import { Layout } from './components/layout/Layout'
import { DrillDownModal } from './components/drilldown/DrillDownModal'
import { AuthProvider, useAuth } from './lib/auth'
import { ThemeProvider } from './hooks/useTheme'
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
import { ROUTES } from './config/routes'
import { usePersistedSettings } from './hooks/usePersistedSettings'
import { prefetchCardData } from './lib/prefetchCardData'
import { prefetchCardChunks, prefetchDemoCardChunks } from './components/cards/cardRegistry'
import { isDemoMode } from './lib/demoMode'

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
const CICD = lazy(() => import('./components/cicd/CICD').then(m => ({ default: m.CICD })))
const Marketplace = lazy(() => import('./components/marketplace/Marketplace').then(m => ({ default: m.Marketplace })))
const MiniDashboard = lazy(() => import('./components/widget/MiniDashboard').then(m => ({ default: m.MiniDashboard })))
const UnifiedCardTest = lazy(() => import('./pages/UnifiedCardTest').then(m => ({ default: m.UnifiedCardTest })))
const UnifiedStatsTest = lazy(() => import('./pages/UnifiedStatsTest').then(m => ({ default: m.UnifiedStatsTest })))
const UnifiedDashboardTest = lazy(() => import('./pages/UnifiedDashboardTest').then(m => ({ default: m.UnifiedDashboardTest })))

// Prefetch all lazy route chunks after initial page load.
// Batched to avoid overwhelming the Vite dev server with simultaneous
// module transformation requests (which delays navigation on cold start).
if (typeof window !== 'undefined') {
  const PREFETCH_BATCH_SIZE = 5
  const PREFETCH_BATCH_DELAY = 100

  const prefetchRoutes = () => {
    const chunks = [
      () => import('./components/dashboard/Dashboard'),
      () => import('./components/clusters/Clusters'),
      () => import('./components/workloads/Workloads'),
      () => import('./components/compute/Compute'),
      () => import('./components/events/Events'),
      () => import('./components/nodes/Nodes'),
      () => import('./components/deployments/Deployments'),
      () => import('./components/pods/Pods'),
      () => import('./components/services/Services'),
      () => import('./components/storage/Storage'),
      () => import('./components/network/Network'),
      () => import('./components/security/Security'),
      () => import('./components/gitops/GitOps'),
      () => import('./components/alerts/Alerts'),
      () => import('./components/cost/Cost'),
      () => import('./components/compliance/Compliance'),
      () => import('./components/operators/Operators'),
      () => import('./components/helm/HelmReleases'),
      () => import('./components/settings/Settings'),
      () => import('./components/gpu/GPUReservations'),
      () => import('./components/data-compliance/DataCompliance'),
      () => import('./components/logs/Logs'),
      () => import('./components/arcade/Arcade'),
      () => import('./components/deploy/Deploy'),
      () => import('./components/aiml/AIML'),
      () => import('./components/aiagents/AIAgents'),
      () => import('./components/llmd-benchmarks/LLMdBenchmarks'),
      () => import('./components/cicd/CICD'),
      () => import('./components/marketplace/Marketplace'),
    ]

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
    setTimeout(prefetchRoutes, 500)
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

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    // If we have a token (likely authenticated), render children optimistically
    // to avoid a blank flash. Auth resolves almost instantly from localStorage
    // cache. The stale-while-revalidate pattern in AuthProvider means isLoading
    // is only true when there's no cached user, so this is safe.
    if (localStorage.getItem('token')) {
      return <>{children}</>
    }
    return null
  }

  if (!isAuthenticated) {
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

// Default main dashboard card types — prefetched immediately so the first
// page renders without waiting for Dashboard.tsx to mount and trigger prefetch.
const DEFAULT_MAIN_CARD_TYPES = [
  'console_ai_offline_detection', 'hardware_health', 'cluster_health',
  'resource_usage', 'pod_issues', 'cluster_metrics', 'event_stream',
  'deployment_status', 'events_timeline',
]

// Prefetches core Kubernetes data and card chunks immediately after login
// so dashboard cards render instantly instead of showing skeletons.
function DataPrefetchInit() {
  const { isAuthenticated } = useAuth()
  useEffect(() => {
    if (!isAuthenticated) return
    prefetchCardData()
    // Prefetch default dashboard card chunks immediately — don't wait for
    // Dashboard.tsx to lazy-load and mount before starting chunk downloads.
    prefetchCardChunks(DEFAULT_MAIN_CARD_TYPES)
    // Demo-only card chunks are lower priority — defer 15s in live mode.
    if (isDemoMode()) {
      prefetchDemoCardChunks()
    } else {
      setTimeout(prefetchDemoCardChunks, 15_000)
    }
  }, [isAuthenticated])
  return null
}

function App() {
  return (
    <ThemeProvider>
    <AuthProvider>
    <SettingsSyncInit />
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
      <DrillDownModal />
      <ChunkErrorBoundary>
      <Suspense fallback={<LoadingFallback />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        {/* PWA Mini Dashboard - lightweight widget mode (no auth required for local monitoring) */}
        <Route path="/widget" element={<MiniDashboard />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout>
                  <Dashboard />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/custom-dashboard/:id"
          element={
            <ProtectedRoute>
              <Layout>
                  <CustomDashboard />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/clusters"
          element={
            <ProtectedRoute>
              <Layout>
                  <Clusters />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/workloads"
          element={
            <ProtectedRoute>
              <Layout>
                  <Workloads />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/nodes"
          element={
            <ProtectedRoute>
              <Layout>
                  <Nodes />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/deployments"
          element={
            <ProtectedRoute>
              <Layout>
                  <Deployments />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/pods"
          element={
            <ProtectedRoute>
              <Layout>
                  <Pods />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/services"
          element={
            <ProtectedRoute>
              <Layout>
                  <Services />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/operators"
          element={
            <ProtectedRoute>
              <Layout>
                  <Operators />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/helm"
          element={
            <ProtectedRoute>
              <Layout>
                  <HelmReleases />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/logs"
          element={
            <ProtectedRoute>
              <Layout>
                  <Logs />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/compute"
          element={
            <ProtectedRoute>
              <Layout>
                  <Compute />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/compute/compare"
          element={
            <ProtectedRoute>
              <Layout>
                  <ClusterComparisonPage />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/storage"
          element={
            <ProtectedRoute>
              <Layout>
                  <Storage />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/network"
          element={
            <ProtectedRoute>
              <Layout>
                  <Network />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/events"
          element={
            <ProtectedRoute>
              <Layout>
                  <Events />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/security"
          element={
            <ProtectedRoute>
              <Layout>
                  <Security />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/gitops"
          element={
            <ProtectedRoute>
              <Layout>
                  <GitOps />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/alerts"
          element={
            <ProtectedRoute>
              <Layout>
                  <Alerts />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/cost"
          element={
            <ProtectedRoute>
              <Layout>
                  <Cost />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/security-posture"
          element={
            <ProtectedRoute>
              <Layout>
                  <Compliance />
              </Layout>
            </ProtectedRoute>
          }
        />
        {/* Legacy route for backwards compatibility */}
        <Route
          path="/compliance"
          element={
            <ProtectedRoute>
              <Layout>
                  <Compliance />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/data-compliance"
          element={
            <ProtectedRoute>
              <Layout>
                  <DataCompliance />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/gpu-reservations"
          element={
            <ProtectedRoute>
              <Layout>
                  <GPUReservations />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/history"
          element={
            <ProtectedRoute>
              <Layout>
                  <CardHistoryWithRestore />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <Layout>
                  <Settings />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/users"
          element={
            <ProtectedRoute>
              <Layout>
                  <UserManagementPage />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/namespaces"
          element={
            <ProtectedRoute>
              <Layout>
                  <NamespaceManager />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/arcade"
          element={
            <ProtectedRoute>
              <Layout>
                  <Arcade />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/deploy"
          element={
            <ProtectedRoute>
              <Layout>
                  <Deploy />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/ai-ml"
          element={
            <ProtectedRoute>
              <Layout>
                  <AIML />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/ai-agents"
          element={
            <ProtectedRoute>
              <Layout>
                  <AIAgents />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/llm-d-benchmarks"
          element={
            <ProtectedRoute>
              <Layout>
                  <LLMdBenchmarks />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/ci-cd"
          element={
            <ProtectedRoute>
              <Layout>
                  <CICD />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/marketplace"
          element={
            <ProtectedRoute>
              <Layout>
                  <Marketplace />
              </Layout>
            </ProtectedRoute>
          }
        />
        {/* Dev test routes for unified framework validation */}
        <Route
          path="/test/unified-card"
          element={
            <ProtectedRoute>
              <Layout>
                  <UnifiedCardTest />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/test/unified-stats"
          element={
            <ProtectedRoute>
              <Layout>
                  <UnifiedStatsTest />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/test/unified-dashboard"
          element={
            <ProtectedRoute>
              <Layout>
                  <UnifiedDashboardTest />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to={ROUTES.HOME} replace />} />
      </Routes>
      </Suspense>
      </ChunkErrorBoundary>
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
  )
}

export default App
