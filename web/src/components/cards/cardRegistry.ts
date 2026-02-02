import { lazy, Suspense, createElement, ComponentType } from 'react'
import { isDynamicCardRegistered } from '../../lib/dynamic-cards/dynamicCardRegistry'
import { getCardConfig, hasUnifiedConfig, getUnifiedCardTypes } from '../../config/cards'
import { UnifiedCard } from '../../lib/unified'

// Lazy load all card components for better code splitting
const ClusterHealth = lazy(() => import('./ClusterHealth').then(m => ({ default: m.ClusterHealth })))
const EventStream = lazy(() => import('./EventStream').then(m => ({ default: m.EventStream })))
const PodIssues = lazy(() => import('./PodIssues').then(m => ({ default: m.PodIssues })))
const TopPods = lazy(() => import('./TopPods').then(m => ({ default: m.TopPods })))
const AppStatus = lazy(() => import('./AppStatus').then(m => ({ default: m.AppStatus })))
const ResourceUsage = lazy(() => import('./ResourceUsage').then(m => ({ default: m.ResourceUsage })))
const ClusterMetrics = lazy(() => import('./ClusterMetrics').then(m => ({ default: m.ClusterMetrics })))
const DeploymentStatus = lazy(() => import('./DeploymentStatus').then(m => ({ default: m.DeploymentStatus })))
const DeploymentProgress = lazy(() => import('./DeploymentProgress').then(m => ({ default: m.DeploymentProgress })))
const DeploymentIssues = lazy(() => import('./DeploymentIssues').then(m => ({ default: m.DeploymentIssues })))
const GitOpsDrift = lazy(() => import('./GitOpsDrift').then(m => ({ default: m.GitOpsDrift })))
const UpgradeStatus = lazy(() => import('./UpgradeStatus').then(m => ({ default: m.UpgradeStatus })))
const ResourceCapacity = lazy(() => import('./ResourceCapacity').then(m => ({ default: m.ResourceCapacity })))
const GPUInventory = lazy(() => import('./GPUInventory').then(m => ({ default: m.GPUInventory })))
const GPUStatus = lazy(() => import('./GPUStatus').then(m => ({ default: m.GPUStatus })))
const GPUOverview = lazy(() => import('./GPUOverview').then(m => ({ default: m.GPUOverview })))
const GPUWorkloads = lazy(() => import('./GPUWorkloads').then(m => ({ default: m.GPUWorkloads })))
const SecurityIssues = lazy(() => import('./SecurityIssues').then(m => ({ default: m.SecurityIssues })))
const EventSummary = lazy(() => import('./EventSummary').then(m => ({ default: m.EventSummary })))
const WarningEvents = lazy(() => import('./WarningEvents').then(m => ({ default: m.WarningEvents })))
const RecentEvents = lazy(() => import('./RecentEvents').then(m => ({ default: m.RecentEvents })))
const EventsTimeline = lazy(() => import('./EventsTimeline').then(m => ({ default: m.EventsTimeline })))
const PodHealthTrend = lazy(() => import('./PodHealthTrend').then(m => ({ default: m.PodHealthTrend })))
const ResourceTrend = lazy(() => import('./ResourceTrend').then(m => ({ default: m.ResourceTrend })))
const GPUUtilization = lazy(() => import('./GPUUtilization').then(m => ({ default: m.GPUUtilization })))
const GPUUsageTrend = lazy(() => import('./GPUUsageTrend').then(m => ({ default: m.GPUUsageTrend })))
const ClusterResourceTree = lazy(() => import('./cluster-resource-tree/ClusterResourceTree').then(m => ({ default: m.ClusterResourceTree })))
const StorageOverview = lazy(() => import('./StorageOverview').then(m => ({ default: m.StorageOverview })))
const PVCStatus = lazy(() => import('./PVCStatus').then(m => ({ default: m.PVCStatus })))
const NetworkOverview = lazy(() => import('./NetworkOverview').then(m => ({ default: m.NetworkOverview })))
const ServiceStatus = lazy(() => import('./ServiceStatus').then(m => ({ default: m.ServiceStatus })))
const ComputeOverview = lazy(() => import('./ComputeOverview').then(m => ({ default: m.ComputeOverview })))
const ClusterFocus = lazy(() => import('./ClusterFocus').then(m => ({ default: m.ClusterFocus })))
const ClusterComparison = lazy(() => import('./ClusterComparison').then(m => ({ default: m.ClusterComparison })))
const ClusterCosts = lazy(() => import('./ClusterCosts').then(m => ({ default: m.ClusterCosts })))
const ClusterNetwork = lazy(() => import('./ClusterNetwork').then(m => ({ default: m.ClusterNetwork })))
const ClusterLocations = lazy(() => import('./ClusterLocations').then(m => ({ default: m.ClusterLocations })))
const NamespaceOverview = lazy(() => import('./NamespaceOverview').then(m => ({ default: m.NamespaceOverview })))
const NamespaceQuotas = lazy(() => import('./NamespaceQuotas').then(m => ({ default: m.NamespaceQuotas })))
const NamespaceRBAC = lazy(() => import('./NamespaceRBAC').then(m => ({ default: m.NamespaceRBAC })))
const NamespaceEvents = lazy(() => import('./NamespaceEvents').then(m => ({ default: m.NamespaceEvents })))
const NamespaceMonitor = lazy(() => import('./NamespaceMonitor').then(m => ({ default: m.NamespaceMonitor })))
const OperatorStatus = lazy(() => import('./OperatorStatus').then(m => ({ default: m.OperatorStatus })))
const OperatorSubscriptions = lazy(() => import('./OperatorSubscriptions').then(m => ({ default: m.OperatorSubscriptions })))
const CRDHealth = lazy(() => import('./CRDHealth').then(m => ({ default: m.CRDHealth })))
const HelmReleaseStatus = lazy(() => import('./HelmReleaseStatus').then(m => ({ default: m.HelmReleaseStatus })))
const HelmValuesDiff = lazy(() => import('./HelmValuesDiff').then(m => ({ default: m.HelmValuesDiff })))
const HelmHistory = lazy(() => import('./HelmHistory').then(m => ({ default: m.HelmHistory })))
const ChartVersions = lazy(() => import('./ChartVersions').then(m => ({ default: m.ChartVersions })))
const KustomizationStatus = lazy(() => import('./KustomizationStatus').then(m => ({ default: m.KustomizationStatus })))
const OverlayComparison = lazy(() => import('./OverlayComparison').then(m => ({ default: m.OverlayComparison })))
const ArgoCDApplications = lazy(() => import('./ArgoCDApplications').then(m => ({ default: m.ArgoCDApplications })))
const ArgoCDSyncStatus = lazy(() => import('./ArgoCDSyncStatus').then(m => ({ default: m.ArgoCDSyncStatus })))
const ArgoCDHealth = lazy(() => import('./ArgoCDHealth').then(m => ({ default: m.ArgoCDHealth })))
const UserManagement = lazy(() => import('./UserManagement').then(m => ({ default: m.UserManagement })))
const ConsoleIssuesCard = lazy(() => import('./console-missions/ConsoleIssuesCard').then(m => ({ default: m.ConsoleIssuesCard })))
const ConsoleKubeconfigAuditCard = lazy(() => import('./console-missions/ConsoleKubeconfigAuditCard').then(m => ({ default: m.ConsoleKubeconfigAuditCard })))
const ConsoleHealthCheckCard = lazy(() => import('./console-missions/ConsoleHealthCheckCard').then(m => ({ default: m.ConsoleHealthCheckCard })))
const ConsoleOfflineDetectionCard = lazy(() => import('./console-missions/ConsoleOfflineDetectionCard').then(m => ({ default: m.ConsoleOfflineDetectionCard })))
const ActiveAlerts = lazy(() => import('./ActiveAlerts').then(m => ({ default: m.ActiveAlerts })))
const AlertRulesCard = lazy(() => import('./AlertRules').then(m => ({ default: m.AlertRulesCard })))
const OpenCostOverview = lazy(() => import('./OpenCostOverview').then(m => ({ default: m.OpenCostOverview })))
const KubecostOverview = lazy(() => import('./KubecostOverview').then(m => ({ default: m.KubecostOverview })))
const OPAPolicies = lazy(() => import('./OPAPolicies').then(m => ({ default: m.OPAPolicies })))
const KyvernoPolicies = lazy(() => import('./KyvernoPolicies').then(m => ({ default: m.KyvernoPolicies })))
const FalcoAlerts = lazy(() => import('./ComplianceCards').then(m => ({ default: m.FalcoAlerts })))
const TrivyScan = lazy(() => import('./ComplianceCards').then(m => ({ default: m.TrivyScan })))
const KubescapeScan = lazy(() => import('./ComplianceCards').then(m => ({ default: m.KubescapeScan })))
const PolicyViolations = lazy(() => import('./ComplianceCards').then(m => ({ default: m.PolicyViolations })))
const ComplianceScore = lazy(() => import('./ComplianceCards').then(m => ({ default: m.ComplianceScore })))
const VaultSecrets = lazy(() => import('./DataComplianceCards').then(m => ({ default: m.VaultSecrets })))
const ExternalSecrets = lazy(() => import('./DataComplianceCards').then(m => ({ default: m.ExternalSecrets })))
const CertManager = lazy(() => import('./DataComplianceCards').then(m => ({ default: m.CertManager })))
const ProwJobs = lazy(() => import('./workload-detection/ProwJobs').then(m => ({ default: m.ProwJobs })))
const ProwStatus = lazy(() => import('./workload-detection/ProwStatus').then(m => ({ default: m.ProwStatus })))
const ProwHistory = lazy(() => import('./workload-detection/ProwHistory').then(m => ({ default: m.ProwHistory })))
const LLMInference = lazy(() => import('./workload-detection/LLMInference').then(m => ({ default: m.LLMInference })))
const LLMModels = lazy(() => import('./workload-detection/LLMModels').then(m => ({ default: m.LLMModels })))
const MLJobs = lazy(() => import('./workload-detection/MLJobs').then(m => ({ default: m.MLJobs })))
const MLNotebooks = lazy(() => import('./workload-detection/MLNotebooks').then(m => ({ default: m.MLNotebooks })))
const Weather = lazy(() => import('./weather/Weather').then(m => ({ default: m.Weather })))
const GitHubActivity = lazy(() => import('./GitHubActivity').then(m => ({ default: m.GitHubActivity })))
const RSSFeed = lazy(() => import('./rss').then(m => ({ default: m.RSSFeed })))
const Kubectl = lazy(() => import('./Kubectl').then(m => ({ default: m.Kubectl })))
const SudokuGame = lazy(() => import('./SudokuGame').then(m => ({ default: m.SudokuGame })))
const MatchGame = lazy(() => import('./MatchGame').then(m => ({ default: m.MatchGame })))
const Solitaire = lazy(() => import('./Solitaire').then(m => ({ default: m.Solitaire })))
const Checkers = lazy(() => import('./Checkers').then(m => ({ default: m.Checkers })))
const Game2048 = lazy(() => import('./Game2048').then(m => ({ default: m.Game2048 })))
const StockMarketTicker = lazy(() => import('./StockMarketTicker').then(m => ({ default: m.StockMarketTicker })))
const Kubedle = lazy(() => import('./Kubedle').then(m => ({ default: m.Kubedle })))
const PodSweeper = lazy(() => import('./PodSweeper').then(m => ({ default: m.PodSweeper })))
const ContainerTetris = lazy(() => import('./ContainerTetris').then(m => ({ default: m.ContainerTetris })))
const FlappyPod = lazy(() => import('./FlappyPod').then(m => ({ default: m.FlappyPod })))
const KubeMan = lazy(() => import('./KubeMan').then(m => ({ default: m.KubeMan })))
const KubeKong = lazy(() => import('./KubeKong').then(m => ({ default: m.KubeKong })))
const PodPitfall = lazy(() => import('./PodPitfall').then(m => ({ default: m.PodPitfall })))
const NodeInvaders = lazy(() => import('./NodeInvaders').then(m => ({ default: m.NodeInvaders })))
const PodCrosser = lazy(() => import('./PodCrosser').then(m => ({ default: m.PodCrosser })))
const PodBrothers = lazy(() => import('./PodBrothers').then(m => ({ default: m.PodBrothers })))
const KubeKart = lazy(() => import('./KubeKart').then(m => ({ default: m.KubeKart })))
const KubePong = lazy(() => import('./KubePong').then(m => ({ default: m.KubePong })))
const KubeSnake = lazy(() => import('./KubeSnake').then(m => ({ default: m.KubeSnake })))
const KubeGalaga = lazy(() => import('./KubeGalaga').then(m => ({ default: m.KubeGalaga })))
const KubeDoom = lazy(() => import('./KubeDoom').then(m => ({ default: m.KubeDoom })))
const KubeCraft = lazy(() => import('./KubeCraft').then(m => ({ default: m.KubeCraft })))
const IframeEmbed = lazy(() => import('./IframeEmbed').then(m => ({ default: m.IframeEmbed })))
const NetworkUtils = lazy(() => import('./NetworkUtils').then(m => ({ default: m.NetworkUtils })))
const MobileBrowser = lazy(() => import('./MobileBrowser').then(m => ({ default: m.MobileBrowser })))
const KubeChess = lazy(() => import('./KubeChess').then(m => ({ default: m.KubeChess })))
// Temporarily disabled to reduce bundle size (saves ~469KB)
// const KubeCraft3D = lazy(() => import('./KubeCraft3D').then(m => ({ default: m.KubeCraft3D })))
const ServiceExports = lazy(() => import('./ServiceExports').then(m => ({ default: m.ServiceExports })))
const ServiceImports = lazy(() => import('./ServiceImports').then(m => ({ default: m.ServiceImports })))
const GatewayStatus = lazy(() => import('./GatewayStatus').then(m => ({ default: m.GatewayStatus })))
const ServiceTopology = lazy(() => import('./ServiceTopology').then(m => ({ default: m.ServiceTopology })))
const WorkloadDeployment = lazy(() => import('./WorkloadDeployment').then(m => ({ default: m.WorkloadDeployment })))
const ClusterGroups = lazy(() => import('./ClusterGroups').then(m => ({ default: m.ClusterGroups })))
const Missions = lazy(() => import('./Missions').then(m => ({ default: m.Missions })))
const ResourceMarshall = lazy(() => import('./ResourceMarshall').then(m => ({ default: m.ResourceMarshall })))
const WorkloadMonitor = lazy(() => import('./workload-monitor/WorkloadMonitor').then(m => ({ default: m.WorkloadMonitor })))
const DynamicCard = lazy(() => import('./DynamicCard').then(m => ({ default: m.DynamicCard })))
const LLMdStackMonitor = lazy(() => import('./workload-monitor/LLMdStackMonitor').then(m => ({ default: m.LLMdStackMonitor })))
const ProwCIMonitor = lazy(() => import('./workload-monitor/ProwCIMonitor').then(m => ({ default: m.ProwCIMonitor })))
const GitHubCIMonitor = lazy(() => import('./workload-monitor/GitHubCIMonitor').then(m => ({ default: m.GitHubCIMonitor })))
const ClusterHealthMonitor = lazy(() => import('./workload-monitor/ClusterHealthMonitor').then(m => ({ default: m.ClusterHealthMonitor })))
const ProviderHealth = lazy(() => import('./ProviderHealth').then(m => ({ default: m.ProviderHealth })))

// Type for card component props
export type CardComponentProps = { config?: Record<string, unknown> }

// Card component type
export type CardComponent = ComponentType<CardComponentProps>

/**
 * Wrap a lazy card component with its own Suspense boundary.
 * This prevents one slow-loading card from blanking out the entire page —
 * only the individual card shows nothing while its chunk loads.
 */
function withSuspense(LazyComponent: ComponentType<CardComponentProps>): CardComponent {
  function SuspenseWrapped(props: CardComponentProps) {
    return createElement(Suspense, { fallback: null }, createElement(LazyComponent, props))
  }
  SuspenseWrapped.displayName = `Suspense(${(LazyComponent as any).displayName || 'Card'})`
  return SuspenseWrapped
}

/**
 * Central registry of all card components.
 * Each component is wrapped with its own Suspense boundary so that
 * lazy-loaded chunks don't cause the entire page to flash.
 */
const RAW_CARD_COMPONENTS: Record<string, CardComponent> = {
  // Core cards
  cluster_health: ClusterHealth,
  event_stream: EventStream,
  event_summary: EventSummary,
  warning_events: WarningEvents,
  recent_events: RecentEvents,
  pod_issues: PodIssues,
  top_pods: TopPods,
  app_status: AppStatus,
  resource_usage: ResourceUsage,
  cluster_metrics: ClusterMetrics,
  deployment_status: DeploymentStatus,
  deployment_progress: DeploymentProgress,
  deployment_issues: DeploymentIssues,
  gitops_drift: GitOpsDrift,
  upgrade_status: UpgradeStatus,
  resource_capacity: ResourceCapacity,
  gpu_inventory: GPUInventory,
  gpu_status: GPUStatus,
  gpu_overview: GPUOverview,
  gpu_workloads: GPUWorkloads,
  security_issues: SecurityIssues,
  // Live data trend cards
  events_timeline: EventsTimeline,
  pod_health_trend: PodHealthTrend,
  resource_trend: ResourceTrend,
  gpu_utilization: GPUUtilization,
  gpu_usage_trend: GPUUsageTrend,
  cluster_resource_tree: ClusterResourceTree,
  // Dashboard-specific cards
  storage_overview: StorageOverview,
  pvc_status: PVCStatus,
  network_overview: NetworkOverview,
  service_status: ServiceStatus,
  compute_overview: ComputeOverview,
  // Cluster-scoped cards
  cluster_focus: ClusterFocus,
  cluster_comparison: ClusterComparison,
  cluster_costs: ClusterCosts,
  cluster_network: ClusterNetwork,
  cluster_locations: ClusterLocations,
  // Namespace-scoped cards
  namespace_overview: NamespaceOverview,
  namespace_quotas: NamespaceQuotas,
  namespace_rbac: NamespaceRBAC,
  namespace_events: NamespaceEvents,
  namespace_monitor: NamespaceMonitor,
  // Operator-scoped cards
  operator_status: OperatorStatus,
  operator_subscriptions: OperatorSubscriptions,
  crd_health: CRDHealth,
  // Helm-scoped cards
  helm_release_status: HelmReleaseStatus,
  helm_values_diff: HelmValuesDiff,
  helm_history: HelmHistory,
  chart_versions: ChartVersions,
  // Kustomize-scoped cards
  kustomization_status: KustomizationStatus,
  overlay_comparison: OverlayComparison,
  // ArgoCD cards
  argocd_applications: ArgoCDApplications,
  argocd_sync_status: ArgoCDSyncStatus,
  argocd_health: ArgoCDHealth,
  // User management
  user_management: UserManagement,
  // AI mission cards
  console_ai_issues: ConsoleIssuesCard,
  console_ai_kubeconfig_audit: ConsoleKubeconfigAuditCard,
  console_ai_health_check: ConsoleHealthCheckCard,
  console_ai_offline_detection: ConsoleOfflineDetectionCard,
  // Alerting cards
  active_alerts: ActiveAlerts,
  alert_rules: AlertRulesCard,
  // Cost management integrations
  opencost_overview: OpenCostOverview,
  kubecost_overview: KubecostOverview,
  // Policy management cards
  opa_policies: OPAPolicies,
  kyverno_policies: KyvernoPolicies,
  // Compliance tool cards
  falco_alerts: FalcoAlerts,
  trivy_scan: TrivyScan,
  kubescape_scan: KubescapeScan,
  policy_violations: PolicyViolations,
  compliance_score: ComplianceScore,
  // Data compliance tool cards
  vault_secrets: VaultSecrets,
  external_secrets: ExternalSecrets,
  cert_manager: CertManager,
  // Workload detection cards
  prow_jobs: ProwJobs,
  prow_status: ProwStatus,
  prow_history: ProwHistory,
  llm_inference: LLMInference,
  llm_models: LLMModels,
  ml_jobs: MLJobs,
  ml_notebooks: MLNotebooks,
  // Weather card
  weather: Weather,
  // GitHub Activity Monitoring card
  github_activity: GitHubActivity,
  // RSS Feed card
  rss_feed: RSSFeed,
  // Kubectl card
  kubectl: Kubectl,
  // Sudoku game card
  sudoku_game: SudokuGame,
  // Kube Match card
  match_game: MatchGame,
  // Kube Solitaire card
  solitaire: Solitaire,
  // AI Checkers card
  checkers: Checkers,
  // Kube 2048 card
  game_2048: Game2048,
  // Stock Market Ticker card
  stock_market_ticker: StockMarketTicker,
  // Kubedle card
  kubedle: Kubedle,
  // Pod Sweeper card
  pod_sweeper: PodSweeper,
  // Container Tetris card
  container_tetris: ContainerTetris,
  // Flappy Pod card
  flappy_pod: FlappyPod,
  // Kube-Man (Pac-Man) card
  kube_man: KubeMan,
  // Classic arcade games
  kube_kong: KubeKong,
  pod_pitfall: PodPitfall,
  node_invaders: NodeInvaders,
  pod_crosser: PodCrosser,
  // Pod Brothers (Mario Bros) card
  pod_brothers: PodBrothers,
  kube_kart: KubeKart,
  kube_pong: KubePong,
  kube_snake: KubeSnake,
  kube_galaga: KubeGalaga,
  kube_doom: KubeDoom,
  kube_craft: KubeCraft,
  // Generic Iframe Embed card
  iframe_embed: IframeEmbed,
  network_utils: NetworkUtils,
  // Mobile Browser card
  mobile_browser: MobileBrowser,
  // Kube Chess card
  kube_chess: KubeChess,
  // KubeCraft 3D card - Temporarily disabled to reduce bundle size
  // kube_craft_3d: KubeCraft3D,
  // MCS (Multi-Cluster Service) cards
  service_exports: ServiceExports,
  service_imports: ServiceImports,
  // Gateway API cards
  gateway_status: GatewayStatus,
  // Service Topology card
  service_topology: ServiceTopology,
  // Workload Deployment card
  workload_deployment: WorkloadDeployment,
  // Cluster Groups card (drag-and-drop deploy target)
  cluster_groups: ClusterGroups,
  // Missions card (deploy progress tracking)
  deployment_missions: Missions,
  // Resource Marshall card (dependency tree explorer)
  resource_marshall: ResourceMarshall,
  // Workload Monitor card (health monitoring with tree/list views)
  workload_monitor: WorkloadMonitor,
  // Specialized monitoring cards
  llmd_stack_monitor: LLMdStackMonitor,
  prow_ci_monitor: ProwCIMonitor,
  github_ci_monitor: GitHubCIMonitor,
  cluster_health_monitor: ClusterHealthMonitor,
  // Provider Health card (AI + Cloud provider status)
  provider_health: ProviderHealth,

  // Dynamic Card (Card Factory meta-component)
  dynamic_card: DynamicCard,

  // Aliases - map catalog types to existing components with similar functionality
  gpu_list: GPUInventory,
  gpu_issues: GPUStatus,
  memory_usage: ResourceUsage,
  memory_trend: ClusterMetrics,
  cpu_usage: ResourceUsage,
  cpu_trend: ClusterMetrics,
  top_cpu_pods: TopPods,
  pod_status: AppStatus,
  pod_list: TopPods,
  error_count: PodIssues,
  security_overview: SecurityIssues,
  rbac_summary: NamespaceRBAC,
}

// Wrap every card with its own Suspense boundary
export const CARD_COMPONENTS: Record<string, CardComponent> = Object.fromEntries(
  Object.entries(RAW_CARD_COMPONENTS).map(([key, Component]) => [key, withSuspense(Component)])
)

/**
 * Cards that use demo/mock data instead of real data.
 * Used to show a demo banner when these cards are present.
 */
export const DEMO_DATA_CARDS = new Set([
  // MCS cards - demo until MCS is installed
  'service_exports',
  'service_imports',
  // Gateway API cards - demo until Gateway API is installed
  'gateway_status',
  // Service Topology - demo visualization
  'service_topology',
  // Workload Deployment - uses real data when backend is running, falls back to demo internally
  // NOT in DEMO_DATA_CARDS because the static badge can't detect runtime data source
  // ArgoCD cards - all use mock data
  'argocd_applications',
  'argocd_health',
  'argocd_sync_status',
  // GitOps cards - use mock data
  'kustomization_status',
  'overlay_comparison',
  // Helm cards - all now use real data via helm CLI backend
  // Namespace cards - namespace_quotas, namespace_rbac, resource_capacity, and helm_release_status now have real data support
  // Cost management integrations - demo until connected
  'opencost_overview',
  'kubecost_overview',
  // Policy management - kyverno is demo-only
  'kyverno_policies',
  // Security posture cards - demo until tools are detected
  'falco_alerts',
  'trivy_scan',
  'kubescape_scan',
  'policy_violations',
  'compliance_score',
  // Data compliance cards - demo until tools are detected
  // Note: cert_manager now uses real data via useCertManager hook
  'vault_secrets',
  'external_secrets',
  // Workload detection cards - demo until tools are detected
  // Note: prow_jobs, prow_status, prow_history now use real data via useProw hook
  // Note: llm_inference, llm_models now use real data via useLLMd hook
  'ml_jobs',
  'ml_notebooks',
  // Provider health card uses real data from /settings/keys + useClusters()
  // Only shows demo data when getDemoMode() is true (handled inside the hook)
])

/**
 * Cards that should never show demo indicators (badge/yellow border).
 * Arcade/game cards don't have "demo data" — they're always just games.
 */
export const DEMO_EXEMPT_CARDS = new Set([
  'sudoku_game',
  'checkers',
  'container_tetris',
  'kube_kong',
  'pod_crosser',
  'kube_kart',
  'kube_snake',
  'kube_chess',
])

/**
 * Cards that display live/real-time data streams.
 * These show a "Live" badge in the title when showing real data (not demo).
 * Primarily time-series, trend, and event streaming cards.
 */
export const LIVE_DATA_CARDS = new Set([
  // Time-series trend cards
  'pod_health_trend',
  'resource_trend',
  'gpu_usage_trend',
  // Real-time status cards
  'cluster_metrics',
  'events_timeline',
  'event_summary',
  'warning_events',
  'recent_events',
  'gpu_utilization',
  // Overview cards with live data
  'service_status',
  'storage_overview',
  'network_overview',
  'compute_overview',
  'pvc_status',
  // Prow CI/CD cards with real data
  'prow_jobs',
  'prow_status',
  'prow_history',
  // llm-d inference cards with real data
  'llm_inference',
  'llm_models',
  // cert-manager card with real data
  'cert_manager',
  // Deployment Missions card - polls deploy status in real time
  'deployment_missions',
  // Workload Monitor - live health monitoring
  'workload_monitor',
  // Specialized monitoring cards
  'llmd_stack_monitor',
  'prow_ci_monitor',
  'github_ci_monitor',
  'cluster_health_monitor',
])

/**
 * Default widths for card types (in grid columns, out of 12).
 * Cards not listed here default to 4 columns.
 */
export const CARD_DEFAULT_WIDTHS: Record<string, number> = {
  // Compact cards (3-4 columns) - simple metrics and status
  cluster_health: 4,
  resource_usage: 4,
  app_status: 4,
  compute_overview: 4,
  storage_overview: 4,
  network_overview: 4,
  gpu_overview: 4,
  active_alerts: 4,
  security_issues: 4,
  upgrade_status: 4,

  // MCS cards
  service_exports: 6,
  service_imports: 6,

  // Gateway API cards
  gateway_status: 6,

  // Service Topology - wide for visualization
  service_topology: 8,

  // Workload Deployment - wide for workload list
  workload_deployment: 6,

  // Cluster Groups card
  cluster_groups: 4,
  // Deployment Missions card
  deployment_missions: 5,
  // Resource Marshall card
  resource_marshall: 6,
  // Workload Monitor card
  workload_monitor: 8,
  // Specialized monitoring cards
  llmd_stack_monitor: 6,
  prow_ci_monitor: 6,
  github_ci_monitor: 8,
  cluster_health_monitor: 6,
  // Provider Health card
  provider_health: 6,

  // Event dashboard cards
  event_summary: 6,
  warning_events: 6,
  recent_events: 6,

  // Medium cards (5-6 columns) - lists and tables
  event_stream: 6,
  pod_issues: 6,
  deployment_status: 6,
  deployment_issues: 6,
  deployment_progress: 5,
  top_pods: 6,
  service_status: 6,
  operator_status: 6,
  operator_subscriptions: 6,
  crd_health: 5,
  helm_release_status: 6,
  alert_rules: 6,
  namespace_overview: 6,
  namespace_events: 6,
  namespace_quotas: 5,
  namespace_rbac: 6,
  namespace_monitor: 8,
  gitops_drift: 6,
  argocd_applications: 6,
  argocd_sync_status: 6,
  kustomization_status: 6,
  pvc_status: 6,
  gpu_status: 6,
  gpu_inventory: 6,
  gpu_workloads: 6,
  opa_policies: 6,
  kyverno_policies: 6,
  falco_alerts: 4,
  trivy_scan: 4,
  kubescape_scan: 4,
  policy_violations: 6,
  compliance_score: 4,
  vault_secrets: 4,
  external_secrets: 4,
  cert_manager: 4,
  // Workload detection cards
  prow_jobs: 6,
  prow_status: 4,
  prow_history: 6,
  llm_inference: 6,
  llm_models: 6,
  ml_jobs: 6,
  ml_notebooks: 6,
  console_ai_issues: 6,
  console_ai_kubeconfig_audit: 6,
  console_ai_health_check: 6,
  console_ai_offline_detection: 6,
  user_management: 6,
  // Weather card
  weather: 6,
  // GitHub Activity Monitoring card
  github_activity: 8,
  // RSS Feed card
  rss_feed: 6,
  // Kubectl card - interactive terminal
  kubectl: 8,
  // Sudoku game card
  sudoku_game: 6,
  // Kube Match card
  match_game: 6,
  // Stock Market Ticker
  stock_market_ticker: 6,
  // Kubedle
  kubedle: 6,
  // Pod Sweeper
  pod_sweeper: 6,
  // Container Tetris
  container_tetris: 6,
  // Flappy Pod
  flappy_pod: 6,
  // Kube-Man
  kube_man: 6,
  // Classic arcade games
  kube_kong: 6,
  pod_pitfall: 6,
  node_invaders: 6,
  pod_crosser: 6,
  pod_brothers: 6,
  kube_kart: 5,
  kube_pong: 5,
  kube_snake: 5,
  kube_galaga: 5,
  kube_doom: 6,
  kube_craft: 5,
  iframe_embed: 6,
  network_utils: 5,
  mobile_browser: 5,
  kube_chess: 5,
  // kube_craft_3d: 6,  // Temporarily disabled

  // Wide cards (7-8 columns) - charts and trends
  pod_health_trend: 8,
  events_timeline: 8,
  cluster_metrics: 8,
  resource_trend: 8,
  resource_capacity: 8,
  gpu_utilization: 8,
  gpu_usage_trend: 8,
  helm_history: 8,
  helm_values_diff: 8,
  chart_versions: 6,
  cluster_focus: 8,
  cluster_costs: 8,
  cluster_network: 8,
  cluster_locations: 8,
  argocd_health: 6,
  opencost_overview: 8,
  kubecost_overview: 8,
  overlay_comparison: 8,

  // Full width cards (12 columns) - complex visualizations
  cluster_comparison: 12,
  cluster_resource_tree: 12,
}

// Default width for cards not in the map
const DEFAULT_CARD_WIDTH = 4

/**
 * Get the default width for a card type.
 * Returns the configured default or 4 columns if not specified.
 */
export function getDefaultCardWidth(cardType: string): number {
  return CARD_DEFAULT_WIDTHS[cardType] ?? DEFAULT_CARD_WIDTH
}

/**
 * Get a card component by type.
 * Falls back to the DynamicCard meta-component for dynamically registered types.
 * Returns undefined if the card type is not registered anywhere.
 */
/**
 * Feature flag to enable unified card rendering.
 * Set to true to use the new unified card system for cards that have configs.
 * Cards with unified configs will render using UnifiedCard instead of legacy components.
 */
const USE_UNIFIED_CARDS = false // Set to true to enable unified cards

/**
 * Create a component that renders a unified card from config
 */
function createUnifiedCardComponent(cardType: string): CardComponent {
  const config = getCardConfig(cardType)
  if (!config) {
    return () => createElement('div', { className: 'text-red-400' }, `Config not found: ${cardType}`)
  }
  return () => createElement(UnifiedCard, { config })
}

export function getCardComponent(cardType: string): CardComponent | undefined {
  // Check for unified config first (when enabled)
  if (USE_UNIFIED_CARDS && hasUnifiedConfig(cardType)) {
    return createUnifiedCardComponent(cardType)
  }

  // Check static registry
  const staticComponent = CARD_COMPONENTS[cardType]
  if (staticComponent) return staticComponent

  // Check dynamic registry — render via DynamicCard meta-component
  if (isDynamicCardRegistered(cardType)) {
    return CARD_COMPONENTS['dynamic_card']
  }

  return undefined
}

/**
 * Check if a card type is registered (static, dynamic, or unified).
 */
export function isCardTypeRegistered(cardType: string): boolean {
  return cardType in CARD_COMPONENTS || isDynamicCardRegistered(cardType) || hasUnifiedConfig(cardType)
}

/**
 * Register a dynamic card type at runtime.
 * This adds the type to the default widths map so it gets a proper grid size.
 */
export function registerDynamicCardType(cardType: string, width = 6): void {
  CARD_DEFAULT_WIDTHS[cardType] = width
}

/**
 * Get all registered card types (including unified cards).
 */
export function getRegisteredCardTypes(): string[] {
  const staticTypes = Object.keys(CARD_COMPONENTS)
  const unifiedTypes = getUnifiedCardTypes()
  // Combine and deduplicate
  return [...new Set([...staticTypes, ...unifiedTypes])]
}
