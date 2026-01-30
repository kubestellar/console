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

// Lazy load all page components for better code splitting
const Login = lazy(() => import('./components/auth/Login').then(m => ({ default: m.Login })))
const AuthCallback = lazy(() => import('./components/auth/AuthCallback').then(m => ({ default: m.AuthCallback })))
const Onboarding = lazy(() => import('./components/onboarding/Onboarding').then(m => ({ default: m.Onboarding })))
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

// Prefetch all lazy route chunks after initial page load.
// This runs during idle time so by the time the user navigates,
// the target chunk is already cached and loads instantly.
if (typeof window !== 'undefined') {
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
    ]
    // Stagger imports to avoid blocking the main thread
    chunks.forEach((load, i) => {
      setTimeout(() => load().catch(() => {}), i * 100)
    })
  }

  // Use requestIdleCallback if available, otherwise setTimeout
  if ('requestIdleCallback' in window) {
    requestIdleCallback(prefetchRoutes, { timeout: 5000 })
  } else {
    setTimeout(prefetchRoutes, 2000)
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
    return null
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
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
    navigate('/')
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
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

function OnboardedRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()

  if (user && !user.onboarded) {
    return <Navigate to="/onboarding" replace />
  }

  return <>{children}</>
}

function App() {
  return (
    <ThemeProvider>
    <AuthProvider>
      <RewardsProvider>
      <ToastProvider>
      <GlobalFiltersProvider>
      <MissionProvider>
      <CardEventProvider>
      <AlertsProvider>
      <DashboardProvider>
      <DrillDownProvider>
      <DrillDownModal />
      <Suspense fallback={<LoadingFallback />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route
          path="/onboarding"
          element={
            <ProtectedRoute>
              <Onboarding />
            </ProtectedRoute>
          }
        />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <OnboardedRoute>
                <Layout>
                  <Dashboard />
                </Layout>
              </OnboardedRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/custom-dashboard/:id"
          element={
            <ProtectedRoute>
              <OnboardedRoute>
                <Layout>
                  <CustomDashboard />
                </Layout>
              </OnboardedRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/clusters"
          element={
            <ProtectedRoute>
              <OnboardedRoute>
                <Layout>
                  <Clusters />
                </Layout>
              </OnboardedRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/workloads"
          element={
            <ProtectedRoute>
              <OnboardedRoute>
                <Layout>
                  <Workloads />
                </Layout>
              </OnboardedRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/nodes"
          element={
            <ProtectedRoute>
              <OnboardedRoute>
                <Layout>
                  <Nodes />
                </Layout>
              </OnboardedRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/deployments"
          element={
            <ProtectedRoute>
              <OnboardedRoute>
                <Layout>
                  <Deployments />
                </Layout>
              </OnboardedRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/pods"
          element={
            <ProtectedRoute>
              <OnboardedRoute>
                <Layout>
                  <Pods />
                </Layout>
              </OnboardedRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/services"
          element={
            <ProtectedRoute>
              <OnboardedRoute>
                <Layout>
                  <Services />
                </Layout>
              </OnboardedRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/operators"
          element={
            <ProtectedRoute>
              <OnboardedRoute>
                <Layout>
                  <Operators />
                </Layout>
              </OnboardedRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/helm"
          element={
            <ProtectedRoute>
              <OnboardedRoute>
                <Layout>
                  <HelmReleases />
                </Layout>
              </OnboardedRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/logs"
          element={
            <ProtectedRoute>
              <OnboardedRoute>
                <Layout>
                  <Logs />
                </Layout>
              </OnboardedRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/compute"
          element={
            <ProtectedRoute>
              <OnboardedRoute>
                <Layout>
                  <Compute />
                </Layout>
              </OnboardedRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/compute/compare"
          element={
            <ProtectedRoute>
              <OnboardedRoute>
                <Layout>
                  <ClusterComparisonPage />
                </Layout>
              </OnboardedRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/storage"
          element={
            <ProtectedRoute>
              <OnboardedRoute>
                <Layout>
                  <Storage />
                </Layout>
              </OnboardedRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/network"
          element={
            <ProtectedRoute>
              <OnboardedRoute>
                <Layout>
                  <Network />
                </Layout>
              </OnboardedRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/events"
          element={
            <ProtectedRoute>
              <OnboardedRoute>
                <Layout>
                  <Events />
                </Layout>
              </OnboardedRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/security"
          element={
            <ProtectedRoute>
              <OnboardedRoute>
                <Layout>
                  <Security />
                </Layout>
              </OnboardedRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/gitops"
          element={
            <ProtectedRoute>
              <OnboardedRoute>
                <Layout>
                  <GitOps />
                </Layout>
              </OnboardedRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/alerts"
          element={
            <ProtectedRoute>
              <OnboardedRoute>
                <Layout>
                  <Alerts />
                </Layout>
              </OnboardedRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/cost"
          element={
            <ProtectedRoute>
              <OnboardedRoute>
                <Layout>
                  <Cost />
                </Layout>
              </OnboardedRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/security-posture"
          element={
            <ProtectedRoute>
              <OnboardedRoute>
                <Layout>
                  <Compliance />
                </Layout>
              </OnboardedRoute>
            </ProtectedRoute>
          }
        />
        {/* Legacy route for backwards compatibility */}
        <Route
          path="/compliance"
          element={
            <ProtectedRoute>
              <OnboardedRoute>
                <Layout>
                  <Compliance />
                </Layout>
              </OnboardedRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/data-compliance"
          element={
            <ProtectedRoute>
              <OnboardedRoute>
                <Layout>
                  <DataCompliance />
                </Layout>
              </OnboardedRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/gpu-reservations"
          element={
            <ProtectedRoute>
              <OnboardedRoute>
                <Layout>
                  <GPUReservations />
                </Layout>
              </OnboardedRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/history"
          element={
            <ProtectedRoute>
              <OnboardedRoute>
                <Layout>
                  <CardHistoryWithRestore />
                </Layout>
              </OnboardedRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <OnboardedRoute>
                <Layout>
                  <Settings />
                </Layout>
              </OnboardedRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/users"
          element={
            <ProtectedRoute>
              <OnboardedRoute>
                <Layout>
                  <UserManagementPage />
                </Layout>
              </OnboardedRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/namespaces"
          element={
            <ProtectedRoute>
              <OnboardedRoute>
                <Layout>
                  <NamespaceManager />
                </Layout>
              </OnboardedRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/arcade"
          element={
            <ProtectedRoute>
              <OnboardedRoute>
                <Layout>
                  <Arcade />
                </Layout>
              </OnboardedRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/deploy"
          element={
            <ProtectedRoute>
              <OnboardedRoute>
                <Layout>
                  <Deploy />
                </Layout>
              </OnboardedRoute>
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
      </DrillDownProvider>
      </DashboardProvider>
      </AlertsProvider>
      </CardEventProvider>
      </MissionProvider>
      </GlobalFiltersProvider>
      </ToastProvider>
      </RewardsProvider>
    </AuthProvider>
    </ThemeProvider>
  )
}

export default App
