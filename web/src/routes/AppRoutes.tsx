/**
 * Route definitions and route-level helper components.
 *
 * Contains ProtectedRoute, auth helpers, LightweightShell, SuspenseRoute,
 * and the full FullDashboardApp provider + route tree.
 *
 * Extracted from App.tsx so the root component only handles live-URL
 * bridging and top-level provider composition.
 */
import { Suspense, useEffect, useRef } from 'react'
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import type { Location } from 'react-router-dom'
import { CardHistoryEntry } from '../hooks/useCardHistory'
import { Layout } from '../components/layout/Layout'
import { AuthProvider, useAuth, isJWTExpired } from '../lib/auth'
import { DEMO_TOKEN_VALUE } from '../lib/constants'
import { BrandingProvider } from '../hooks/useBranding'
import { ThemeProvider } from '../hooks/useTheme'
import { DrillDownProvider } from '../hooks/useDrillDown'
import { DashboardProvider, useDashboardContext } from '../hooks/useDashboardContext'
import { GlobalFiltersProvider } from '../hooks/useGlobalFilters'
import { MissionProvider } from '../hooks/useMissions'
import { CardEventProvider } from '../lib/cardEvents'
import { ToastProvider } from '../components/ui/Toast'
import { AlertsProvider } from '../contexts/AlertsContext'
import { RewardsProvider } from '../hooks/useRewards'
import { NPSSurvey } from '../components/feedback'
import { UnifiedDemoProvider } from '../lib/unified/demo'
import { ChunkErrorBoundary } from '../components/ChunkErrorBoundary'
import { AppErrorBoundary } from '../components/AppErrorBoundary'
import { PageErrorBoundary } from '../components/PageErrorBoundary'
import { ROUTES } from '../config/routes'
import { STORAGE_KEY_TOKEN } from '../lib/constants'
import { safeGet, safeSet } from '../lib/safeLocalStorage'
import {
  OrbitAutoRunner, SettingsSyncInit, PageViewTracker, DataPrefetchInit,
  LoadingFallback,
} from '../hooks/useAppSideEffects'
import {
  Dashboard, Login, AuthCallback, Clusters,
  MissionLandingPage, DrillDownModal, CustomDashboard, Settings,
  Events, Workloads, Storage, Compute, ClusterComparisonPage,
  Network, Security, GitOps, Alerts, Cost, Compliance,
  ComplianceFrameworks, ChangeControlAudit, SegregationOfDuties,
  ComplianceReports, DataResidency, BAADashboard, HIPAADashboard,
  GxPDashboard, NISTDashboard, STIGDashboard, AirGapDashboard,
  FedRAMPDashboard, OIDCDashboard, RBACAuditDashboard, SessionDashboard,
  SIEMDashboard, IncidentResponseDashboard, ThreatIntelDashboard,
  SBOMDashboard, SigningStatusDashboard, SLSADashboard,
  LicenseComplianceDashboard, RiskMatrixDashboard, RiskRegisterDashboard,
  RiskAppetiteDashboard, EnterpriseLayout, EnterprisePortal, ComingSoon,
  DataCompliance, GPUReservations, KarmadaOps, Nodes, Deployments,
  Services, Operators, HelmReleases, Logs, Pods, CardHistory,
  UserManagementPage, NamespaceManager, Arcade, Deploy, AIML, AIAgents,
  LLMdBenchmarks, ClusterAdmin, CICD, Insights, MultiTenancy, Drasi,
  ACMM, Marketplace, Quantum, MiniDashboard, EmbedCard, Welcome,
  FromLens, FromHeadlamp, FromHolmesGPT, FeatureInspektorGadget,
  FeatureKagent, WhiteLabel, UnifiedCardTest, UnifiedStatsTest,
  UnifiedDashboardTest, AllCardsPerfTest, CompliancePerfTest, NotFound,
} from '../routes/lazyRoutes'

// ---------------------------------------------------------------------------
// Route-level helper components
// ---------------------------------------------------------------------------

// Wrap lazy route elements in their own Suspense boundary so the route
// change is immediate. Without this, React 18's concurrent transitions
// keep the OLD route visible while the new lazy component loads.
export function SuspenseRoute({ children }: { children: React.ReactNode }) {
  return (
    <PageErrorBoundary>
      <Suspense fallback={<LoadingFallback />}>{children}</Suspense>
    </PageErrorBoundary>
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
    if (destination !== ROUTES.HOME && destination !== ROUTES.LOGIN) {
      safeSet(RETURN_TO_KEY, destination)
    }
    return <Navigate to={ROUTES.LOGIN} replace />
  }

  return <>{children}</>
}

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
    <PageErrorBoundary>
    <PageViewTracker />
    <Suspense fallback={<LoadingFallback />}>
      {children}
    </Suspense>
    </PageErrorBoundary>
    </ChunkErrorBoundary>
    </AppErrorBoundary>
    </ThemeProvider>
    </BrandingProvider>
  )
}

// ---------------------------------------------------------------------------
// Main route trees
// ---------------------------------------------------------------------------

/** Top-level route split: lightweight routes vs full dashboard */
export function AppRoutes({ liveLocation }: { liveLocation: Location }) {
  return (
    <Routes location={liveLocation}>
      {/* ── Lightweight routes ─────────────────────────────────────────
          Mission landing pages load WITHOUT the heavy dashboard provider
          stack (no DashboardProvider, AlertsProvider, MissionProvider,
          CardEventProvider, etc.). This cuts initial JS from ~1.8MB to
          ~200KB and eliminates cold-start API calls. */}
      <Route path={ROUTES.MISSION} element={
        <LightweightShell><MissionLandingPage /></LightweightShell>
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

      {/* ── Embeddable card (iframe mode) ────────────────────────────
          Renders a single CI/CD card full-screen without sidebar or nav.
          Lightweight shell keeps the bundle small for embed consumers. */}
      <Route path={ROUTES.EMBED_CARD} element={<LightweightShell><EmbedCard /></LightweightShell>} />

      {/* ── Full dashboard routes ─────────────────────────────────────
          Everything else gets the full provider stack. */}
      <Route path="*" element={<FullDashboardApp liveLocation={liveLocation} />} />
    </Routes>
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
      <PageErrorBoundary>
        <Suspense fallback={null}><DrillDownModal /></Suspense>
      </PageErrorBoundary>
      <PageErrorBoundary>
        <NPSSurvey />
      </PageErrorBoundary>
      <OrbitAutoRunner />
      <ChunkErrorBoundary>
      <PageErrorBoundary>
      <Routes location={liveLocation}>
        <Route path={ROUTES.LOGIN} element={<PageErrorBoundary><Login /></PageErrorBoundary>} />
        <Route path={ROUTES.AUTH_CALLBACK} element={<PageErrorBoundary><AuthCallback /></PageErrorBoundary>} />
        {/* PWA Mini Dashboard - lightweight widget mode (no auth required for local monitoring) */}
        <Route path={ROUTES.WIDGET} element={<SuspenseRoute><MiniDashboard /></SuspenseRoute>} />

        {/* ── Enterprise Compliance Portal ─────────────────────────────
            Dedicated sub-portal with its own sidebar, organized by
            compliance vertical (epic). */}
        <Route path="/enterprise" element={<ProtectedRoute><SuspenseRoute><EnterpriseLayout /></SuspenseRoute></ProtectedRoute>}>
          <Route index element={<SuspenseRoute><EnterprisePortal /></SuspenseRoute>} />
          {/* Epic 1: FinTech & Regulatory */}
          <Route path="frameworks" element={<SuspenseRoute><ComplianceFrameworks /></SuspenseRoute>} />
          <Route path="change-control" element={<SuspenseRoute><ChangeControlAudit /></SuspenseRoute>} />
          <Route path="sod" element={<SuspenseRoute><SegregationOfDuties /></SuspenseRoute>} />
          <Route path="data-residency" element={<SuspenseRoute><DataResidency /></SuspenseRoute>} />
          <Route path="reports" element={<SuspenseRoute><ComplianceReports /></SuspenseRoute>} />
          {/* Epic 2: Healthcare & Life Sciences */}
          <Route path="hipaa" element={<SuspenseRoute><HIPAADashboard /></SuspenseRoute>} />
          <Route path="gxp" element={<SuspenseRoute><GxPDashboard /></SuspenseRoute>} />
          <Route path="baa" element={<SuspenseRoute><BAADashboard /></SuspenseRoute>} />
          {/* Epic 3: Government & Defense */}
          <Route path="nist" element={<SuspenseRoute><NISTDashboard /></SuspenseRoute>} />
          <Route path="stig" element={<SuspenseRoute><STIGDashboard /></SuspenseRoute>} />
          <Route path="air-gap" element={<SuspenseRoute><AirGapDashboard /></SuspenseRoute>} />
          <Route path="fedramp" element={<SuspenseRoute><FedRAMPDashboard /></SuspenseRoute>} />
          {/* Epic 4: Identity & Access */}
          <Route path="oidc" element={<SuspenseRoute><OIDCDashboard /></SuspenseRoute>} />
          <Route path="rbac-audit" element={<SuspenseRoute><RBACAuditDashboard /></SuspenseRoute>} />
          <Route path="sessions" element={<SuspenseRoute><SessionDashboard /></SuspenseRoute>} />
          {/* Epic 5: SecOps */}
          <Route path="siem" element={<SuspenseRoute><SIEMDashboard /></SuspenseRoute>} />
          <Route path="incident-response" element={<SuspenseRoute><IncidentResponseDashboard /></SuspenseRoute>} />
          <Route path="threat-intel" element={<SuspenseRoute><ThreatIntelDashboard /></SuspenseRoute>} />
          {/* Epic 6: Supply Chain Security */}
          <Route path="sbom" element={<SuspenseRoute><SBOMDashboard /></SuspenseRoute>} />
          <Route path="sigstore" element={<SuspenseRoute><SigningStatusDashboard /></SuspenseRoute>} />
          <Route path="slsa" element={<SuspenseRoute><SLSADashboard /></SuspenseRoute>} />
          <Route path="licenses" element={<SuspenseRoute><LicenseComplianceDashboard /></SuspenseRoute>} />
          {/* Epic 7: Enterprise Risk Management */}
          <Route path="risk-matrix" element={<SuspenseRoute><RiskMatrixDashboard /></SuspenseRoute>} />
          <Route path="risk-register" element={<SuspenseRoute><RiskRegisterDashboard /></SuspenseRoute>} />
          <Route path="risk-appetite" element={<SuspenseRoute><RiskAppetiteDashboard /></SuspenseRoute>} />
          <Route path="*" element={<SuspenseRoute><ComingSoon /></SuspenseRoute>} />
        </Route>

        {/* Layout route — all dashboard routes share a single Layout instance.
            KeepAliveOutlet preserves component state across navigations so that
            warm-nav is near-instant (no unmount/remount). */}
        <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route index element={<Dashboard />} />
          <Route path={ROUTES.DASHBOARD_ALIAS} element={<Navigate to={ROUTES.HOME} replace />} />
          <Route path={ROUTES.MISSIONS} element={<Dashboard />} />
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
          <Route path={ROUTES.COMPLIANCE_FRAMEWORKS} element={<SuspenseRoute><ComplianceFrameworks /></SuspenseRoute>} />
          <Route path={ROUTES.CHANGE_CONTROL} element={<SuspenseRoute><ChangeControlAudit /></SuspenseRoute>} />
          <Route path={ROUTES.SEGREGATION_OF_DUTIES} element={<SuspenseRoute><SegregationOfDuties /></SuspenseRoute>} />
          <Route path={ROUTES.COMPLIANCE_REPORTS} element={<SuspenseRoute><ComplianceReports /></SuspenseRoute>} />
          <Route path={ROUTES.DATA_RESIDENCY} element={<SuspenseRoute><DataResidency /></SuspenseRoute>} />
          <Route path={ROUTES.BAA} element={<SuspenseRoute><BAADashboard /></SuspenseRoute>} />
          <Route path={ROUTES.HIPAA} element={<SuspenseRoute><HIPAADashboard /></SuspenseRoute>} />
          <Route path={ROUTES.GXP} element={<SuspenseRoute><GxPDashboard /></SuspenseRoute>} />
          <Route path={ROUTES.NIST} element={<SuspenseRoute><NISTDashboard /></SuspenseRoute>} />
          <Route path={ROUTES.STIG} element={<SuspenseRoute><STIGDashboard /></SuspenseRoute>} />
          <Route path={ROUTES.AIR_GAP} element={<SuspenseRoute><AirGapDashboard /></SuspenseRoute>} />
          <Route path={ROUTES.FEDRAMP} element={<SuspenseRoute><FedRAMPDashboard /></SuspenseRoute>} />
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
          <Route path={ROUTES.ACMM} element={<SuspenseRoute><ACMM /></SuspenseRoute>} />
          <Route path={ROUTES.MARKETPLACE} element={<SuspenseRoute><Marketplace /></SuspenseRoute>} />
          <Route path={ROUTES.QUANTUM} element={<SuspenseRoute><Quantum /></SuspenseRoute>} />
          {/* Dev test routes for unified framework validation */}
          <Route path={ROUTES.TEST_UNIFIED_CARD} element={<UnifiedCardTest />} />
          <Route path={ROUTES.TEST_UNIFIED_STATS} element={<UnifiedStatsTest />} />
          <Route path={ROUTES.TEST_UNIFIED_DASHBOARD} element={<UnifiedDashboardTest />} />
          {/* Mission landing pages live outside ProtectedRoute; /missions is handled by the dashboard Layout route above. */}
          {/* /issue, /issues, /feedback open the feedback modal on the dashboard */}
          <Route path={ROUTES.ISSUE} element={<IssueRedirect />} />
          <Route path={ROUTES.ISSUES} element={<IssueRedirect />} />
          <Route path={ROUTES.FEEDBACK} element={<IssueRedirect />} />
          {/* /feature, /features open the feedback modal on the feature tab */}
          <Route path={ROUTES.FEATURE} element={<FeatureRedirect />} />
          <Route path={ROUTES.FEATURES} element={<FeatureRedirect />} />
          <Route path="*" element={<SuspenseRoute><NotFound /></SuspenseRoute>} />
        </Route>

        <Route path="*" element={<SuspenseRoute><NotFound /></SuspenseRoute>} />
      </Routes>
      </PageErrorBoundary>
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
