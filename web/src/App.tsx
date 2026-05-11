import { Suspense, useState, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { Routes, Route, Navigate, useNavigate, useLocation, useNavigationType, UNSAFE_LocationContext } from 'react-router-dom'
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
import { PageErrorBoundary } from './components/PageErrorBoundary'
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
// Login and AuthCallback are eagerly imported — they are on the critical auth
// path and must render reliably.  Lazy-loading them caused chunk_load errors
// during OAuth redirects when the browser navigated away before the chunk
// finished downloading (#9803).
import { Login } from './components/auth/Login'
import { AuthCallback } from './components/auth/AuthCallback'
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
const Security = safeLazy(() => import('./components/security/Security'), 'Security')
const GitOps = safeLazy(() => import('./components/gitops/GitOps'), 'GitOps')
const Alerts = safeLazy(() => import('./components/alerts/Alerts'), 'Alerts')
const Cost = safeLazy(() => import('./components/cost/Cost'), 'Cost')
const Compliance = safeLazy(() => import('./components/compliance/Compliance'), 'Compliance')
const ComplianceFrameworks = safeLazy(() => import('./components/compliance/ComplianceFrameworks'), 'default')
const ChangeControlAudit = safeLazy(() => import('./components/compliance/ChangeControlAudit'), 'default')
const SegregationOfDuties = safeLazy(() => import('./components/compliance/SegregationOfDuties'), 'default')
const ComplianceReports = safeLazy(() => import('./components/compliance/ComplianceReports'), 'default')
const DataResidency = safeLazy(() => import('./components/compliance/DataResidency'), 'default')
const BAADashboard = safeLazy(() => import('./components/compliance/BAADashboard'), 'default')
const HIPAADashboard = safeLazy(() => import('./components/compliance/HIPAADashboard'), 'default')
const GxPDashboard = safeLazy(() => import('./components/compliance/GxPDashboard'), 'default')
const NISTDashboard = safeLazy(() => import('./components/compliance/NISTDashboard'), 'default')
const STIGDashboard = safeLazy(() => import('./components/compliance/STIGDashboard'), 'default')
const AirGapDashboard = safeLazy(() => import('./components/compliance/AirGapDashboard'), 'default')
const FedRAMPDashboard = safeLazy(() => import('./components/compliance/FedRAMPDashboard'), 'default')
const OIDCDashboard = safeLazy(() => import('./components/compliance/OIDCDashboard'), 'default')
const RBACAuditDashboard = safeLazy(() => import('./components/compliance/RBACAuditDashboard'), 'default')
const SessionDashboard = safeLazy(() => import('./components/compliance/SessionDashboard'), 'default')
const SIEMDashboard = safeLazy(() => import('./components/compliance/SIEMDashboard'), 'default')
const IncidentResponseDashboard = safeLazy(() => import('./components/compliance/IncidentResponseDashboard'), 'default')
const ThreatIntelDashboard = safeLazy(() => import('./components/compliance/ThreatIntelDashboard'), 'default')
const SBOMDashboard = safeLazy(() => import('./components/compliance/SBOMDashboard'), 'default')
const SigningStatusDashboard = safeLazy(() => import('./components/compliance/SigningStatusDashboard'), 'default')
const SLSADashboard = safeLazy(() => import('./components/compliance/SLSADashboard'), 'default')
const LicenseComplianceDashboard = safeLazy(() => import('./components/compliance/LicenseComplianceDashboard'), 'default')
const RiskMatrixDashboard = safeLazy(() => import('./components/compliance/RiskMatrixDashboard'), 'default')
const RiskRegisterDashboard = safeLazy(() => import('./components/compliance/RiskRegisterDashboard'), 'default')
const RiskAppetiteDashboard = safeLazy(() => import('./components/compliance/RiskAppetiteDashboard'), 'default')
const EnterpriseLayout = safeLazy(() => import('./components/enterprise/EnterpriseLayout'), 'default')
const EnterprisePortal = safeLazy(() => import('./components/enterprise/EnterprisePortal'), 'default')
const ComingSoon = safeLazy(() => import('./components/enterprise/ComingSoon'), 'default')
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
const ClusterAdmin = safeLazy(() => import('./components/cluster-admin/ClusterAdmin'), 'ClusterAdmin')
const CICD = safeLazy(() => import('./components/cicd/CICD'), 'CICD')
const Insights = safeLazy(() => import('./components/insights/Insights'), 'Insights')
const MultiTenancy = safeLazy(() => import('./components/multi-tenancy/MultiTenancy'), 'MultiTenancy')
const Drasi = safeLazy(() => import('./components/drasi/Drasi'), 'Drasi')
const ACMM = safeLazy(() => import('./components/acmm/ACMM'), 'ACMM')
const Marketplace = safeLazy(() => import('./components/marketplace/Marketplace'), 'Marketplace')
const Quantum = safeLazy(() => import('./components/quantum/Quantum'), 'Quantum')
const MiniDashboard = safeLazy(() => import('./components/widget/MiniDashboard'), 'MiniDashboard')
const EmbedCard = safeLazy(() => import('./pages/EmbedCard'), 'EmbedCard')
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
const NotFound = safeLazy(() => import('./components/NotFound'), 'default')

// Dashboard ID → chunk import map (shared with hover prefetch in Sidebar)
import { DASHBOARD_CHUNKS } from './lib/dashboardChunks'

// Always prefetched regardless of enabled dashboards
const ALWAYS_PREFETCH = new Set(['dashboard', 'settings', 'clusters', 'cluster-admin', 'security', 'deploy'])

// Timing constants (milliseconds)
const LOADING_FLASH_DELAY_MS = 200
const PREFETCH_DEMO_CARDS_DELAY_MS = 15_000

// Prefetch lazy route chunks after initial page load.
// Batched to avoid overwhelming the Vite dev server with simultaneous
// module transformation requests (which delays navigation on cold start).
if (typeof window !== 'undefined') {
  const PREFETCH_BATCH_SIZE = 8
  const PREFETCH_BATCH_DELAY = 50
  /** Max wait (ms) for the enabled-dashboards list before prefetching all chunks */
  const PREFETCH_DASHBOARD_TIMEOUT_MS = 2_000

  /** Routes where chunk prefetching is skipped to avoid errors during OAuth flow (#9767) */
  const SKIP_PREFETCH_PATHS = new Set(['/login', '/auth/callback'])

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
  return (
    <PageErrorBoundary>
      <Suspense fallback={<LoadingFallback />}>{children}</Suspense>
    </PageErrorBoundary>
  )
}

// Loading fallback component with delay to prevent flash on fast navigation
function LoadingFallback() {
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

// MissionDeepLink removed — replaced by MissionLandingPage standalone component

// Route-to-title map for GA4 page view granularity and browser tab labeling.
// Keys use ROUTES constants so renames stay in sync automatically.
const ROUTE_TITLES: Record<string, string> = {
  [ROUTES.HOME]:                    'Dashboard',
  [ROUTES.CLUSTERS]:                'My Clusters',
  [ROUTES.CLUSTER_ADMIN]:           'Cluster Admin',
  [ROUTES.NODES]:                   'Nodes',
  [ROUTES.NAMESPACES]:              'Namespaces',
  [ROUTES.DEPLOYMENTS]:             'Deployments',
  [ROUTES.PODS]:                    'Pods',
  [ROUTES.SERVICES]:                'Services',
  [ROUTES.WORKLOADS]:               'Workloads',
  [ROUTES.OPERATORS]:               'Operators',
  [ROUTES.HELM]:                    'Helm',
  [ROUTES.LOGS]:                    'Logs',
  [ROUTES.EVENTS]:                  'Events',
  [ROUTES.COMPUTE]:                 'Compute',
  [ROUTES.COMPUTE_COMPARE]:         'Cluster Comparison',
  [ROUTES.STORAGE]:                 'Storage',
  [ROUTES.NETWORK]:                 'Network',
  [ROUTES.ALERTS]:                  'Alerts',
  [ROUTES.SECURITY]:                'Security',
  [ROUTES.SECURITY_POSTURE]:        'Security Posture',
  [ROUTES.COMPLIANCE]:              'Compliance',
  [ROUTES.COMPLIANCE_FRAMEWORKS]:   'Compliance Frameworks',
  [ROUTES.CHANGE_CONTROL]:          'Change Control',
  [ROUTES.SEGREGATION_OF_DUTIES]:   'Segregation of Duties',
  [ROUTES.COMPLIANCE_REPORTS]:      'Compliance Reports',
  [ROUTES.DATA_RESIDENCY]:          'Data Residency',
  [ROUTES.BAA]:                     'BAA Tracker',
  [ROUTES.HIPAA]:                   'HIPAA Compliance',
  [ROUTES.GXP]:                     'GxP Validation',
  [ROUTES.NIST]:                    'NIST 800-53',
  [ROUTES.STIG]:                    'DISA STIG',
  [ROUTES.AIR_GAP]:                 'Air-Gap Readiness',
  [ROUTES.FEDRAMP]:                 'FedRAMP Readiness',
  [ROUTES.ENTERPRISE]:              'Enterprise Compliance',
  [ROUTES.ENTERPRISE_OIDC]:               'OIDC Federation',
  [ROUTES.ENTERPRISE_RBAC_AUDIT]:         'RBAC Audit',
  [ROUTES.ENTERPRISE_SESSIONS]:           'Session Management',
  [ROUTES.ENTERPRISE_SIEM]:               'SIEM Integration',
  [ROUTES.ENTERPRISE_INCIDENT_RESPONSE]:  'Incident Response',
  [ROUTES.ENTERPRISE_THREAT_INTEL]:       'Threat Intelligence',
  [ROUTES.ENTERPRISE_SBOM]:               'SBOM Manager',
  [ROUTES.ENTERPRISE_SIGSTORE]:           'Sigstore Verification',
  [ROUTES.ENTERPRISE_SLSA]:               'SLSA Provenance',
  [ROUTES.ENTERPRISE_RISK_MATRIX]:        'Risk Matrix',
  [ROUTES.ENTERPRISE_RISK_REGISTER]:      'Risk Register',
  [ROUTES.ENTERPRISE_RISK_APPETITE]:      'Risk Appetite',
  [ROUTES.DATA_COMPLIANCE]:         'Data Compliance',
  [ROUTES.GITOPS]:                  'GitOps',
  [ROUTES.COST]:                    'Cost',
  [ROUTES.GPU_RESERVATIONS]:        'GPU Reservations',
  [ROUTES.DEPLOY]:                  'Deploy',
  [ROUTES.AI_ML]:                   'AI/ML',
  [ROUTES.AI_AGENTS]:               'AI Agents',
  [ROUTES.CI_CD]:                   'CI/CD',
  [ROUTES.KARMADA_OPS]:             'Karmada Ops',
  [ROUTES.LLM_D_BENCHMARKS]:        'llm-d Benchmarks',
  [ROUTES.MULTI_TENANCY]:           'Multi-Tenancy',
  [ROUTES.DRASI]:                   'Drasi',
  [ROUTES.ACMM]:                    'AI Codebase Maturity',
  [ROUTES.ARCADE]:                  'Arcade',
  [ROUTES.MARKETPLACE]:             'Marketplace',
  [ROUTES.MISSIONS]:                'Missions',
  [ROUTES.HISTORY]:                 'Card History',
  [ROUTES.SETTINGS]:                'Settings',
  [ROUTES.USERS]:                   'User Management',
  [ROUTES.LOGIN]:                   'Login',
  [ROUTES.FROM_LENS]:               'Switching from Lens',
  [ROUTES.FROM_HEADLAMP]:           'Coming from Headlamp',
  [ROUTES.FROM_HOLMESGPT]:          'Coming from HolmesGPT',
  [ROUTES.FEATURE_INSPEKTORGADGET]: 'Inspektor Gadget Integration',
  [ROUTES.FEATURE_KAGENT]:          'Kagent Integration',
  [ROUTES.WHITE_LABEL]:             'White-Label Your Console',
  [ROUTES.EMBED_BASE]:              'Embed Card',
  [ROUTES.INSIGHTS]:                'Insights',
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
      // Demo-only card chunks are lower priority — defer in live mode.
      if (isDemoMode()) {
        m.prefetchDemoCardChunks()
      } else {
        setTimeout(m.prefetchDemoCardChunks, PREFETCH_DEMO_CARDS_DELAY_MS)
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
    <PageErrorBoundary>
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

// Live URL subscriber — bypasses React Router's useLocation, whose state
// update is wrapped in startTransition and can be interrupted on busy pages.
// Listen to real History API mutations so pathname/search/hash stay in sync
// with the visible route instead of briefly lagging behind the URL.
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

function useLiveUrl(): string {
  return useSyncExternalStore(
    (notify) => {
      window.addEventListener(LIVE_LOCATION_EVENT, notify)
      return () => {
        window.removeEventListener(LIVE_LOCATION_EVENT, notify)
      }
    },
    getLiveUrl,
    () => '/',
  )
}

function LiveLocationProvider({
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

function App() {
  const liveUrl = useLiveUrl()
  // Merge the real router location (which carries state and — critically —
  // a real `key` that changes on every navigation) with the live browser URL.
  // This keeps pathname/search/hash in lockstep with the address bar while
  // preserving React Router's navigation metadata once it catches up.
  const routerLocation = useLocation()
  const navigationType = useNavigationType()
  const liveLocation = useMemo(() => {
    const url = new URL(liveUrl, window.location.origin)
    return {
      ...routerLocation,
      pathname: url.pathname,
      search: url.search,
      hash: url.hash,
    }
  }, [routerLocation, liveUrl])
  return (
    <BrandingProvider>
    <ThemeProvider>
    <LiveLocationProvider location={liveLocation} navigationType={navigationType}>
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
    </LiveLocationProvider>
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
      <PageErrorBoundary>
        <Suspense fallback={null}><DrillDownModal /></Suspense>
      </PageErrorBoundary>
      <PageErrorBoundary>
        <NPSSurvey />
      </PageErrorBoundary>
      <OrbitAutoRunner />
      <ChunkErrorBoundary>
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
        <Route element={<ProtectedRoute><PageErrorBoundary><Layout /></PageErrorBoundary></ProtectedRoute>}>
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
