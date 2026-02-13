import { lazy, ComponentType } from 'react'
import { isDynamicCardRegistered } from '../../lib/dynamic-cards/dynamicCardRegistry'

// Lazy load all card components for better code splitting
const ClusterHealth = lazy(() => import('./ClusterHealth').then(m => ({ default: m.ClusterHealth })))
const EventStream = lazy(() => import('./EventStream').then(m => ({ default: m.EventStream })))
const PodIssues = lazy(() => import('./PodIssues').then(m => ({ default: m.PodIssues })))
const TopPods = lazy(() => import('./TopPods').then(m => ({ default: m.TopPods })))
const AppStatus = lazy(() => import('./AppStatus').then(m => ({ default: m.AppStatus })))
const ResourceUsage = lazy(() => import('./ResourceUsage').then(m => ({ default: m.ResourceUsage })))
const ClusterMetrics = lazy(() => import('./ClusterMetrics').then(m => ({ default: m.ClusterMetrics })))
// Deploy dashboard cards — eagerly start loading the barrel at module parse time
// so all 16 cards share one chunk download instead of 16 separate HTTP requests.
const _deployBundle = import('./deploy-bundle')
const DeploymentStatus = lazy(() => _deployBundle.then(m => ({ default: m.DeploymentStatus })))
const DeploymentProgress = lazy(() => _deployBundle.then(m => ({ default: m.DeploymentProgress })))
const DeploymentIssues = lazy(() => _deployBundle.then(m => ({ default: m.DeploymentIssues })))
const GitOpsDrift = lazy(() => _deployBundle.then(m => ({ default: m.GitOpsDrift })))
const UpgradeStatus = lazy(() => import('./UpgradeStatus').then(m => ({ default: m.UpgradeStatus })))
const ResourceCapacity = lazy(() => import('./ResourceCapacity').then(m => ({ default: m.ResourceCapacity })))
const GPUInventory = lazy(() => import('./GPUInventory').then(m => ({ default: m.GPUInventory })))
const GPUStatus = lazy(() => import('./GPUStatus').then(m => ({ default: m.GPUStatus })))
const GPUOverview = lazy(() => import('./GPUOverview').then(m => ({ default: m.GPUOverview })))
const GPUWorkloads = lazy(() => import('./GPUWorkloads').then(m => ({ default: m.GPUWorkloads })))
const GPUNamespaceAllocations = lazy(() => import('./GPUNamespaceAllocations').then(m => ({ default: m.GPUNamespaceAllocations })))
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
const HelmReleaseStatus = lazy(() => _deployBundle.then(m => ({ default: m.HelmReleaseStatus })))
const HelmValuesDiff = lazy(() => import('./HelmValuesDiff').then(m => ({ default: m.HelmValuesDiff })))
const HelmHistory = lazy(() => _deployBundle.then(m => ({ default: m.HelmHistory })))
const ChartVersions = lazy(() => _deployBundle.then(m => ({ default: m.ChartVersions })))
const KustomizationStatus = lazy(() => _deployBundle.then(m => ({ default: m.KustomizationStatus })))
const OverlayComparison = lazy(() => _deployBundle.then(m => ({ default: m.OverlayComparison })))
const ArgoCDApplications = lazy(() => _deployBundle.then(m => ({ default: m.ArgoCDApplications })))
const ArgoCDSyncStatus = lazy(() => _deployBundle.then(m => ({ default: m.ArgoCDSyncStatus })))
const ArgoCDHealth = lazy(() => _deployBundle.then(m => ({ default: m.ArgoCDHealth })))
const UserManagement = lazy(() => import('./UserManagement').then(m => ({ default: m.UserManagement })))
const ConsoleIssuesCard = lazy(() => import('./console-missions/ConsoleIssuesCard').then(m => ({ default: m.ConsoleIssuesCard })))
const ConsoleKubeconfigAuditCard = lazy(() => import('./console-missions/ConsoleKubeconfigAuditCard').then(m => ({ default: m.ConsoleKubeconfigAuditCard })))
const ConsoleHealthCheckCard = lazy(() => import('./console-missions/ConsoleHealthCheckCard').then(m => ({ default: m.ConsoleHealthCheckCard })))
const ConsoleOfflineDetectionCard = lazy(() => import('./console-missions/ConsoleOfflineDetectionCard').then(m => ({ default: m.ConsoleOfflineDetectionCard })))
const HardwareHealthCard = lazy(() => import('./HardwareHealthCard').then(m => ({ default: m.HardwareHealthCard })))
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
// Workload detection cards — share one chunk via barrel import
const _workloadDetectionBundle = import('./workload-detection')
const ProwJobs = lazy(() => _workloadDetectionBundle.then(m => ({ default: m.ProwJobs })))
const ProwStatus = lazy(() => _workloadDetectionBundle.then(m => ({ default: m.ProwStatus })))
const ProwHistory = lazy(() => _workloadDetectionBundle.then(m => ({ default: m.ProwHistory })))
const LLMInference = lazy(() => _workloadDetectionBundle.then(m => ({ default: m.LLMInference })))
const LLMModels = lazy(() => _workloadDetectionBundle.then(m => ({ default: m.LLMModels })))
const MLJobs = lazy(() => _workloadDetectionBundle.then(m => ({ default: m.MLJobs })))
const MLNotebooks = lazy(() => _workloadDetectionBundle.then(m => ({ default: m.MLNotebooks })))
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
const WorkloadDeployment = lazy(() => _deployBundle.then(m => ({ default: m.WorkloadDeployment })))
const ClusterGroups = lazy(() => _deployBundle.then(m => ({ default: m.ClusterGroups })))
const Missions = lazy(() => _deployBundle.then(m => ({ default: m.Missions })))
const ResourceMarshall = lazy(() => _deployBundle.then(m => ({ default: m.ResourceMarshall })))
// Workload monitor cards — share one chunk via barrel import
const _workloadMonitorBundle = import('./workload-monitor')
const WorkloadMonitor = lazy(() => _workloadMonitorBundle.then(m => ({ default: m.WorkloadMonitor })))
const DynamicCard = lazy(() => import('./DynamicCard').then(m => ({ default: m.DynamicCard })))
const LLMdStackMonitor = lazy(() => _workloadMonitorBundle.then(m => ({ default: m.LLMdStackMonitor })))
const ProwCIMonitor = lazy(() => _workloadMonitorBundle.then(m => ({ default: m.ProwCIMonitor })))

// LLM-d stunning visualization cards — eagerly start loading the barrel at
// module parse time so all 7 heavy chunks (194KB total source) are pre-warmed
// before the AI/ML dashboard renders, shared across all lazy() references.
const _llmdBundle = import('./llmd')
const LLMdFlow = lazy(() => _llmdBundle.then(m => ({ default: m.LLMdFlow })))
const KVCacheMonitor = lazy(() => _llmdBundle.then(m => ({ default: m.KVCacheMonitor })))
const EPPRouting = lazy(() => _llmdBundle.then(m => ({ default: m.EPPRouting })))
const PDDisaggregation = lazy(() => _llmdBundle.then(m => ({ default: m.PDDisaggregation })))
const LLMdBenchmarks = lazy(() => _llmdBundle.then(m => ({ default: m.LLMdBenchmarks })))
const LLMdAIInsights = lazy(() => _llmdBundle.then(m => ({ default: m.LLMdAIInsights })))
const LLMdConfigurator = lazy(() => _llmdBundle.then(m => ({ default: m.LLMdConfigurator })))
// LLM-d benchmark dashboard cards (share the same barrel bundle)
const BenchmarkHero = lazy(() => _llmdBundle.then(m => ({ default: m.BenchmarkHero })))
const ParetoFrontier = lazy(() => _llmdBundle.then(m => ({ default: m.ParetoFrontier })))
const HardwareLeaderboard = lazy(() => _llmdBundle.then(m => ({ default: m.HardwareLeaderboard })))
const LatencyBreakdown = lazy(() => _llmdBundle.then(m => ({ default: m.LatencyBreakdown })))
const ThroughputComparison = lazy(() => _llmdBundle.then(m => ({ default: m.ThroughputComparison })))
const PerformanceTimeline = lazy(() => _llmdBundle.then(m => ({ default: m.PerformanceTimeline })))
const ResourceUtilization = lazy(() => _llmdBundle.then(m => ({ default: m.ResourceUtilization })))
const GitHubCIMonitor = lazy(() => _workloadMonitorBundle.then(m => ({ default: m.GitHubCIMonitor })))
const ClusterHealthMonitor = lazy(() => _workloadMonitorBundle.then(m => ({ default: m.ClusterHealthMonitor })))
const ProviderHealth = lazy(() => import('./ProviderHealth').then(m => ({ default: m.ProviderHealth })))

// Kagenti AI Agent Platform cards — share one chunk via barrel import
const KagentiStatusCard = lazy(() => import('./KagentiStatusCard').then(m => ({ default: m.KagentiStatusCard })))
const _kagentiBundle = import('./kagenti')
const KagentiAgentFleet = lazy(() => _kagentiBundle.then(m => ({ default: m.KagentiAgentFleet })))
const KagentiBuildPipeline = lazy(() => _kagentiBundle.then(m => ({ default: m.KagentiBuildPipeline })))
const KagentiToolRegistry = lazy(() => _kagentiBundle.then(m => ({ default: m.KagentiToolRegistry })))
const KagentiAgentDiscovery = lazy(() => _kagentiBundle.then(m => ({ default: m.KagentiAgentDiscovery })))
const KagentiSecurity = lazy(() => _kagentiBundle.then(m => ({ default: m.KagentiSecurity })))
const KagentiSecurityPosture = lazy(() => _kagentiBundle.then(m => ({ default: m.KagentiSecurityPosture })))
const KagentiTopology = lazy(() => _kagentiBundle.then(m => ({ default: m.KagentiTopology })))

// Type for card component props
export type CardComponentProps = { config?: Record<string, unknown> }

// Card component type
export type CardComponent = ComponentType<CardComponentProps>

// No per-card Suspense wrapper — CardWrapper.tsx already wraps children in
// <Suspense fallback={<CardSkeleton/>}> which shows a visible skeleton while
// lazy chunks load. A second inner Suspense with a null fallback was hiding
// that skeleton, causing blank card bodies during initial page load.

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
  gpu_namespace_allocations: GPUNamespaceAllocations,
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
  hardware_health: HardwareHealthCard,
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

  // Kagenti AI Agent Platform cards
  kagenti_status: KagentiStatusCard,
  kagenti_agent_fleet: KagentiAgentFleet,
  kagenti_build_pipeline: KagentiBuildPipeline,
  kagenti_tool_registry: KagentiToolRegistry,
  kagenti_agent_discovery: KagentiAgentDiscovery,
  kagenti_security: KagentiSecurity,
  kagenti_security_posture: KagentiSecurityPosture,
  kagenti_topology: KagentiTopology,

  // LLM-d stunning visualization cards
  llmd_flow: LLMdFlow,
  kvcache_monitor: KVCacheMonitor,
  epp_routing: EPPRouting,
  pd_disaggregation: PDDisaggregation,
  llmd_benchmarks: LLMdBenchmarks,
  llmd_ai_insights: LLMdAIInsights,
  llmd_configurator: LLMdConfigurator,

  // LLM-d benchmark dashboard cards
  benchmark_hero: BenchmarkHero,
  pareto_frontier: ParetoFrontier,
  hardware_leaderboard: HardwareLeaderboard,
  latency_breakdown: LatencyBreakdown,
  throughput_comparison: ThroughputComparison,
  performance_timeline: PerformanceTimeline,
  resource_utilization: ResourceUtilization,

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

// Export cards directly — CardWrapper.tsx provides the Suspense boundary with a visible skeleton
export const CARD_COMPONENTS: Record<string, CardComponent> = RAW_CARD_COMPONENTS

/**
 * Cards that ALWAYS use demo/mock data (no live data source exists).
 *
 * IMPORTANT: When adding live data support to a card, you MUST:
 * 1. Remove the card type from this set
 * 2. Have the card call useReportCardDataState({ isDemoData: shouldUseDemoData, ... })
 *    to dynamically report its demo state based on actual data source
 *
 * Cards in this set get isDemoData={true} passed as a prop to CardWrapper,
 * which OVERRIDES any child-reported state. This is why cards with live data
 * must be removed from this set.
 *
 * For cards that use StackContext or other dynamic data sources, use
 * useCardDemoState({ requires: 'stack' | 'agent' | 'backend' }) to determine
 * if demo data should be used, then report via useReportCardDataState.
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
  // Note: LLM-d cards (llmd_flow, kvcache_monitor, epp_routing, pd_disaggregation, llmd_benchmarks, llmd_ai_insights)
  // removed - they now use StackContext for live data and report isDemoData via useReportCardDataState
  // LLM-d Configurator - demo showcase of tuning options, not a complete YAML generator
  'llmd_configurator',
  // LLM-d benchmark dashboard cards — most now use live data via useCachedBenchmarkReports()
  // Only performance_timeline stays demo-only (needs historical time-series data)
  'performance_timeline',
  // Provider health card uses real data from /settings/keys + useClusters()
  // Only shows demo data when getDemoMode() is true (handled inside the hook)
  // Kagenti cards - demo until kagenti-operator is installed on clusters
  'kagenti_status',
  'kagenti_agent_fleet',
  'kagenti_build_pipeline',
  'kagenti_tool_registry',
  'kagenti_agent_discovery',
  'kagenti_security',
  'kagenti_topology',
  'kagenti_security_posture',
])

/**
 * Cards that should never show demo indicators (badge/yellow border).
 * Arcade/game cards don't have "demo data" — they're always just games.
 */
export const DEMO_EXEMPT_CARDS = new Set([
  // All arcade games - never show skeleton, always show game content
  'sudoku_game',
  'checkers',
  'container_tetris',
  'kube_kong',
  'pod_crosser',
  'kube_kart',
  'kube_snake',
  'kube_chess',
  'kube_man',
  'node_invaders',
  'flappy_pod',
  'pod_pitfall',
  'pod_brothers',
  'match_game',
  'solitaire',
  'game_2048',
  'kubedle',
  'pod_sweeper',
  'kube_pong',
  'kube_galaga',
  'kube_craft',
  'kube_doom',
  'dynamic_card',
])

/**
 * Map of card type → chunk preload function.
 * Uses the same import paths as the lazy() declarations above so that
 * triggering an import here warms the browser's module cache and the
 * subsequent lazy() render resolves instantly (no skeleton flash).
 *
 * Cards that share a module (e.g. ComplianceCards) share one import.
 */
const CARD_CHUNK_PRELOADERS: Record<string, () => Promise<unknown>> = {
  // Core cards
  cluster_health: () => import('./ClusterHealth'),
  event_stream: () => import('./EventStream'),
  event_summary: () => import('./EventSummary'),
  warning_events: () => import('./WarningEvents'),
  recent_events: () => import('./RecentEvents'),
  pod_issues: () => import('./PodIssues'),
  top_pods: () => import('./TopPods'),
  app_status: () => import('./AppStatus'),
  resource_usage: () => import('./ResourceUsage'),
  cluster_metrics: () => import('./ClusterMetrics'),
  deployment_status: () => import('./deploy-bundle'),
  deployment_progress: () => import('./deploy-bundle'),
  deployment_issues: () => import('./deploy-bundle'),
  gitops_drift: () => import('./deploy-bundle'),
  upgrade_status: () => import('./UpgradeStatus'),
  resource_capacity: () => import('./ResourceCapacity'),
  gpu_inventory: () => import('./GPUInventory'),
  gpu_status: () => import('./GPUStatus'),
  gpu_overview: () => import('./GPUOverview'),
  gpu_workloads: () => import('./GPUWorkloads'),
  gpu_namespace_allocations: () => import('./GPUNamespaceAllocations'),
  security_issues: () => import('./SecurityIssues'),
  events_timeline: () => import('./EventsTimeline'),
  pod_health_trend: () => import('./PodHealthTrend'),
  resource_trend: () => import('./ResourceTrend'),
  gpu_utilization: () => import('./GPUUtilization'),
  gpu_usage_trend: () => import('./GPUUsageTrend'),
  cluster_resource_tree: () => import('./cluster-resource-tree/ClusterResourceTree'),
  storage_overview: () => import('./StorageOverview'),
  pvc_status: () => import('./PVCStatus'),
  network_overview: () => import('./NetworkOverview'),
  service_status: () => import('./ServiceStatus'),
  compute_overview: () => import('./ComputeOverview'),
  cluster_focus: () => import('./ClusterFocus'),
  cluster_comparison: () => import('./ClusterComparison'),
  cluster_costs: () => import('./ClusterCosts'),
  cluster_network: () => import('./ClusterNetwork'),
  cluster_locations: () => import('./ClusterLocations'),
  namespace_overview: () => import('./NamespaceOverview'),
  namespace_quotas: () => import('./NamespaceQuotas'),
  namespace_rbac: () => import('./NamespaceRBAC'),
  namespace_events: () => import('./NamespaceEvents'),
  namespace_monitor: () => import('./NamespaceMonitor'),
  operator_status: () => import('./OperatorStatus'),
  operator_subscriptions: () => import('./OperatorSubscriptions'),
  crd_health: () => import('./CRDHealth'),
  helm_release_status: () => import('./deploy-bundle'),
  helm_values_diff: () => import('./HelmValuesDiff'),
  helm_history: () => import('./deploy-bundle'),
  chart_versions: () => import('./deploy-bundle'),
  kustomization_status: () => import('./deploy-bundle'),
  overlay_comparison: () => import('./deploy-bundle'),
  argocd_applications: () => import('./deploy-bundle'),
  argocd_sync_status: () => import('./deploy-bundle'),
  argocd_health: () => import('./deploy-bundle'),
  active_alerts: () => import('./ActiveAlerts'),
  alert_rules: () => import('./AlertRules'),
  opencost_overview: () => import('./OpenCostOverview'),
  kubecost_overview: () => import('./KubecostOverview'),
  // Policy & compliance (shared modules)
  opa_policies: () => import('./OPAPolicies'),
  kyverno_policies: () => import('./KyvernoPolicies'),
  falco_alerts: () => import('./ComplianceCards'),
  trivy_scan: () => import('./ComplianceCards'),
  kubescape_scan: () => import('./ComplianceCards'),
  policy_violations: () => import('./ComplianceCards'),
  compliance_score: () => import('./ComplianceCards'),
  vault_secrets: () => import('./DataComplianceCards'),
  external_secrets: () => import('./DataComplianceCards'),
  cert_manager: () => import('./DataComplianceCards'),
  // Workload detection — all share one chunk via barrel
  prow_jobs: () => import('./workload-detection'),
  prow_status: () => import('./workload-detection'),
  prow_history: () => import('./workload-detection'),
  llm_inference: () => import('./workload-detection'),
  llm_models: () => import('./workload-detection'),
  ml_jobs: () => import('./workload-detection'),
  ml_notebooks: () => import('./workload-detection'),
  // GitHub & misc
  github_activity: () => import('./GitHubActivity'),
  hardware_health: () => import('./HardwareHealthCard'),
  console_ai_offline_detection: () => import('./console-missions/ConsoleOfflineDetectionCard'),
  provider_health: () => import('./ProviderHealth'),
  // MCS & Gateway
  service_exports: () => import('./ServiceExports'),
  service_imports: () => import('./ServiceImports'),
  gateway_status: () => import('./GatewayStatus'),
  service_topology: () => import('./ServiceTopology'),
  // Deploy dashboard — all share deploy-bundle chunk
  workload_deployment: () => import('./deploy-bundle'),
  cluster_groups: () => import('./deploy-bundle'),
  deployment_missions: () => import('./deploy-bundle'),
  resource_marshall: () => import('./deploy-bundle'),
  // Workload monitors — all share one chunk via barrel
  workload_monitor: () => import('./workload-monitor'),
  llmd_stack_monitor: () => import('./workload-monitor'),
  prow_ci_monitor: () => import('./workload-monitor'),
  github_ci_monitor: () => import('./workload-monitor'),
  cluster_health_monitor: () => import('./workload-monitor'),
  // LLM-d visualization — barrel import loads all 7 cards in one module graph
  // resolution instead of 7 separate requests, reducing Vite transform overhead
  llmd_flow: () => import('./llmd'),
  kvcache_monitor: () => import('./llmd'),
  epp_routing: () => import('./llmd'),
  pd_disaggregation: () => import('./llmd'),
  llmd_benchmarks: () => import('./llmd'),
  llmd_ai_insights: () => import('./llmd'),
  llmd_configurator: () => import('./llmd'),
  // LLM-d benchmark dashboard cards — all share the llmd barrel bundle
  benchmark_hero: () => import('./llmd'),
  pareto_frontier: () => import('./llmd'),
  hardware_leaderboard: () => import('./llmd'),
  latency_breakdown: () => import('./llmd'),
  throughput_comparison: () => import('./llmd'),
  performance_timeline: () => import('./llmd'),
  resource_utilization: () => import('./llmd'),
  // Kagenti AI Agents — all share one chunk via barrel
  kagenti_status: () => import('./KagentiStatusCard'),
  kagenti_agent_fleet: () => import('./kagenti'),
  kagenti_build_pipeline: () => import('./kagenti'),
  kagenti_tool_registry: () => import('./kagenti'),
  kagenti_agent_discovery: () => import('./kagenti'),
  kagenti_security: () => import('./kagenti'),
  kagenti_security_posture: () => import('./kagenti'),
  kagenti_topology: () => import('./kagenti'),
}

/**
 * Prefetch component chunks for specific card types.
 * Call this when a dashboard mounts to preload its card chunks in parallel,
 * eliminating the skeleton flash caused by React.lazy() chunk loading.
 * Repeated calls with the same card types are no-ops (browser caches modules).
 */
export function prefetchCardChunks(cardTypes: string[]): void {
  for (const type of cardTypes) {
    CARD_CHUNK_PRELOADERS[type]?.()?.catch(() => {})
  }
}

/**
 * Prefetch component chunks for demo-only cards at startup.
 * These are the shared modules behind DEMO_DATA_CARDS entries.
 * Per-dashboard prefetching (via prefetchCardChunks) handles the rest.
 */
export function prefetchDemoCardChunks(): void {
  // Use direct imports (not CARD_CHUNK_PRELOADERS) for the initial startup batch
  // to ensure fast, deduped chunk loading without flooding the dev server
  const startupChunks = [
    () => import('./ServiceExports'),
    () => import('./ServiceImports'),
    () => import('./GatewayStatus'),
    () => import('./ServiceTopology'),
    () => import('./ArgoCDApplications'),
    () => import('./ArgoCDHealth'),
    () => import('./ArgoCDSyncStatus'),
    () => import('./KustomizationStatus'),
    () => import('./OverlayComparison'),
    () => import('./OpenCostOverview'),
    () => import('./KubecostOverview'),
    () => import('./KyvernoPolicies'),
    () => import('./ComplianceCards'),
    () => import('./DataComplianceCards'),
    () => import('./workload-detection/MLJobs'),
    () => import('./workload-detection/MLNotebooks'),
    () => import('./llmd'),  // Barrel import loads all 7 LLM-d cards at once
    () => import('./KagentiStatusCard'),
    () => import('./kagenti/KagentiAgentFleet'),
    () => import('./kagenti/KagentiBuildPipeline'),
    () => import('./kagenti/KagentiToolRegistry'),
    () => import('./kagenti/KagentiAgentDiscovery'),
    () => import('./kagenti/KagentiSecurity'),
    () => import('./kagenti/KagentiTopology'),
  ]
  startupChunks.forEach(load => load().catch(() => {}))
}

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
  // Kagenti AI agent cards
  'kagenti_status',
  'kagenti_agent_fleet',
  'kagenti_build_pipeline',
  'kagenti_tool_registry',
  'kagenti_agent_discovery',
  'kagenti_security',
  'kagenti_topology',
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

  // Kagenti AI Agent Platform cards
  kagenti_status: 4,
  kagenti_agent_fleet: 8,
  kagenti_build_pipeline: 4,
  kagenti_tool_registry: 4,
  kagenti_agent_discovery: 4,
  kagenti_security: 4,
  kagenti_topology: 8,

  // LLM-d stunning visualization cards
  llmd_flow: 8,           // Hero animated flow diagram
  kvcache_monitor: 4,     // KV cache gauges
  epp_routing: 6,         // EPP Sankey diagram
  pd_disaggregation: 6,   // Prefill/Decode split view
  llmd_benchmarks: 6,     // Benchmark charts
  llmd_ai_insights: 6,    // AI insights panel
  llmd_configurator: 4,   // Configurator showcase

  // LLM-d benchmark dashboard cards (all full-width)
  benchmark_hero: 12,
  pareto_frontier: 12,
  hardware_leaderboard: 12,
  latency_breakdown: 12,
  throughput_comparison: 12,
  performance_timeline: 12,
  resource_utilization: 12,

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
  gpu_namespace_allocations: 6,
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
  hardware_health: 6,
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
export function getCardComponent(cardType: string): CardComponent | undefined {
  // Check static registry first
  const staticComponent = CARD_COMPONENTS[cardType]
  if (staticComponent) return staticComponent

  // Check dynamic registry — render via DynamicCard meta-component
  if (isDynamicCardRegistered(cardType)) {
    return CARD_COMPONENTS['dynamic_card']
  }

  return undefined
}

/**
 * Check if a card type is registered (static or dynamic).
 */
export function isCardTypeRegistered(cardType: string): boolean {
  return cardType in CARD_COMPONENTS || isDynamicCardRegistered(cardType)
}

/**
 * Register a dynamic card type at runtime.
 * This adds the type to the default widths map so it gets a proper grid size.
 */
export function registerDynamicCardType(cardType: string, width = 6): void {
  CARD_DEFAULT_WIDTHS[cardType] = width
}

/**
 * Get all registered card types.
 */
export function getRegisteredCardTypes(): string[] {
  return Object.keys(CARD_COMPONENTS)
}
