import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { Login } from './components/auth/Login'
import { AuthCallback } from './components/auth/AuthCallback'
import { Onboarding } from './components/onboarding/Onboarding'
import { Dashboard } from './components/dashboard/Dashboard'
import { Settings } from './components/settings/Settings'
import { Clusters } from './components/clusters/Clusters'
import { Events } from './components/events/Events'
import { Applications } from './components/applications/Applications'
import { Security } from './components/security/Security'
import { GitOps } from './components/gitops/GitOps'
import { CardHistory } from './components/history/CardHistory'
import { CardHistoryEntry } from './hooks/useCardHistory'
import { UserManagementPage } from './pages/UserManagement'
import { NamespaceManager } from './components/namespaces/NamespaceManager'
import { Layout } from './components/layout/Layout'
import { DrillDownModal } from './components/drilldown/DrillDownModal'
import { AuthProvider, useAuth } from './lib/auth'
import { DrillDownProvider } from './hooks/useDrillDown'
import { DashboardProvider, useDashboardContext } from './hooks/useDashboardContext'
import { GlobalFiltersProvider } from './hooks/useGlobalFilters'
import { ToastProvider } from './components/ui/Toast'

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
    <AuthProvider>
      <ToastProvider>
      <GlobalFiltersProvider>
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
          path="/apps"
          element={
            <ProtectedRoute>
              <OnboardedRoute>
                <Layout>
                  <Applications />
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
      </GlobalFiltersProvider>
      </ToastProvider>
    </AuthProvider>
  )
}

export default App
