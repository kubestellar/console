import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { Login } from './components/auth/Login'
import { AuthCallback } from './components/auth/AuthCallback'
import { Onboarding } from './components/onboarding/Onboarding'
import { Dashboard } from './components/dashboard/Dashboard'
import { Settings } from './components/settings/Settings'
import { Clusters } from './components/clusters/Clusters'
import { Events } from './components/events/Events'
import { Workloads } from './components/workloads/Workloads'
import { Storage } from './components/storage/Storage'
import { Compute } from './components/compute/Compute'
import { Network } from './components/network/Network'
import { Security } from './components/security/Security'
import { GitOps } from './components/gitops/GitOps'
import { Alerts } from './components/alerts/Alerts'
import { Cost } from './components/cost/Cost'
import { Compliance } from './components/compliance/Compliance'
import { GPUReservations } from './components/gpu/GPUReservations'
import { Nodes } from './components/nodes/Nodes'
import { Deployments } from './components/deployments/Deployments'
import { Services } from './components/services/Services'
import { Operators } from './components/operators/Operators'
import { HelmReleases } from './components/helm/HelmReleases'
import { Logs } from './components/logs/Logs'
import { Pods } from './components/pods/Pods'
import { CardHistory } from './components/history/CardHistory'
import { CardHistoryEntry } from './hooks/useCardHistory'
import { UserManagementPage } from './pages/UserManagement'
import { NamespaceManager } from './components/namespaces/NamespaceManager'
import { Layout } from './components/layout/Layout'
import { DrillDownModal } from './components/drilldown/DrillDownModal'
import { AuthProvider, useAuth } from './lib/auth'
import { ThemeProvider } from './hooks/useTheme'
import { DrillDownProvider } from './hooks/useDrillDown'
import { DashboardProvider, useDashboardContext } from './hooks/useDashboardContext'
import { GlobalFiltersProvider } from './hooks/useGlobalFilters'
import { MissionProvider } from './hooks/useMissions'
import { ToastProvider } from './components/ui/Toast'
import { AlertsProvider } from './contexts/AlertsContext'

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
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
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
      <ToastProvider>
      <GlobalFiltersProvider>
      <MissionProvider>
      <AlertsProvider>
      <DashboardProvider>
      <DrillDownProvider>
      <DrillDownModal />
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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </DrillDownProvider>
      </DashboardProvider>
      </AlertsProvider>
      </MissionProvider>
      </GlobalFiltersProvider>
      </ToastProvider>
    </AuthProvider>
    </ThemeProvider>
  )
}

export default App
