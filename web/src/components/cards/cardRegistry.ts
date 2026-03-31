/**
 * Card Component Registry — maps card types to lazy-loaded React components.
 *
 * Also add new cards to the browse catalog in:
 *   src/components/dashboard/AddCardModal.tsx → CARD_CATALOG
 * See src/config/cards/index.ts for the full registration checklist.
 */
import { lazy, createElement, ComponentType } from 'react'
import { safeLazy } from '../../lib/safeLazy'
import { isDynamicCardRegistered } from '../../lib/dynamic-cards/dynamicCardRegistry'
import { getCardConfig } from '../../config/cards'
import { registerAllDescriptorCards } from './cardDescriptors.registry'
import { CARD_TITLES, CARD_DESCRIPTIONS, DEMO_EXEMPT_CARDS } from './cardMetadata'

// Eagerly import the default main-dashboard cards so they render instantly on
// page load (no React.lazy chunk delay).  These are the 9 cards in the "main"
// dashboard config — waiting for Vite to compile their chunks causes 10-15s of
// skeletons even when cached data is available.
import { ClusterHealth } from './ClusterHealth'
import { EventStream } from './EventStream'
import { PodIssues } from './PodIssues'
import { ResourceUsage } from './ResourceUsage'
import { ClusterMetrics } from './ClusterMetrics'
import { EventsTimeline } from './EventsTimeline'
import { HardwareHealthCard } from './HardwareHealthCard'
import { ConsoleOfflineDetectionCard } from './console-missions/ConsoleOfflineDetectionCard'
import { DeploymentStatus } from './DeploymentStatus'
// Remaining cards are lazy-loaded for code splitting
const TopPods = safeLazy(() => import('./TopPods'), 'TopPods')
const AppStatus = safeLazy(() => import('./AppStatus'), 'AppStatus')
// Deploy dashboard cards — eagerly start loading the barrel at module parse time
// so all 16 cards share one chunk download instead of 16 separate HTTP requests.
const _deployBundle = import('./deploy-bundle').catch(() => undefined as never)
// DeploymentStatus eagerly imported above
const DeploymentProgress = safeLazy(() => _deployBundle, 'DeploymentProgress')
const DeploymentIssues = safeLazy(() => _deployBundle, 'DeploymentIssues')
const GitOpsDrift = safeLazy(() => _deployBundle, 'GitOpsDrift')
const UpgradeStatus = safeLazy(() => import('./UpgradeStatus'), 'UpgradeStatus')
const ResourceCapacity = safeLazy(() => import('./ResourceCapacity'), 'ResourceCapacity')
const GPUInventory = safeLazy(() => import('./GPUInventory'), 'GPUInventory')
const GPUStatus = safeLazy(() => import('./GPUStatus'), 'GPUStatus')
const GPUOverview = safeLazy(() => import('./GPUOverview'), 'GPUOverview')
const GPUWorkloads = safeLazy(() => import('./GPUWorkloads'), 'GPUWorkloads')
const GPUNamespaceAllocations = safeLazy(() => import('./GPUNamespaceAllocations'), 'GPUNamespaceAllocations')
const GPUInventoryHistory = safeLazy(() => import('./GPUInventoryHistory'), 'GPUInventoryHistory')
const SecurityIssues = safeLazy(() => import('./SecurityIssues'), 'SecurityIssues')
const EventSummary = safeLazy(() => import('./EventSummary'), 'EventSummary')
const WarningEvents = safeLazy(() => import('./WarningEvents'), 'WarningEvents')
const RecentEvents = safeLazy(() => import('./RecentEvents'), 'RecentEvents')
// EventsTimeline eagerly imported above
const PodHealthTrend = safeLazy(() => import('./PodHealthTrend'), 'PodHealthTrend')
const ResourceTrend = safeLazy(() => import('./ResourceTrend'), 'ResourceTrend')
const GPUUtilization = safeLazy(() => import('./GPUUtilization'), 'GPUUtilization')
const GPUUsageTrend = safeLazy(() => import('./GPUUsageTrend'), 'GPUUsageTrend')
const ClusterResourceTree = safeLazy(() => import('./cluster-resource-tree/ClusterResourceTree'), 'ClusterResourceTree')
const StorageOverview = safeLazy(() => import('./StorageOverview'), 'StorageOverview')
const PVCStatus = safeLazy(() => import('./PVCStatus'), 'PVCStatus')
const NetworkOverview = safeLazy(() => import('./NetworkOverview'), 'NetworkOverview')
const ServiceStatus = safeLazy(() => import('./ServiceStatus'), 'ServiceStatus')
const ComputeOverview = safeLazy(() => import('./ComputeOverview'), 'ComputeOverview')
const ClusterFocus = safeLazy(() => import('./ClusterFocus'), 'ClusterFocus')
const ClusterComparison = safeLazy(() => import('./ClusterComparison'), 'ClusterComparison')
const ClusterCosts = safeLazy(() => import('./ClusterCosts'), 'ClusterCosts')
const ClusterNetwork = safeLazy(() => import('./ClusterNetwork'), 'ClusterNetwork')
const ClusterLocations = safeLazy(() => import('./ClusterLocations'), 'ClusterLocations')
const NamespaceOverview = safeLazy(() => import('./NamespaceOverview'), 'NamespaceOverview')
const NamespaceQuotas = safeLazy(() => import('./NamespaceQuotas'), 'NamespaceQuotas')
const NamespaceRBAC = safeLazy(() => import('./NamespaceRBAC'), 'NamespaceRBAC')
const NamespaceEvents = safeLazy(() => import('./NamespaceEvents'), 'NamespaceEvents')
const NamespaceMonitor = safeLazy(() => import('./NamespaceMonitor'), 'NamespaceMonitor')
const OperatorStatus = safeLazy(() => import('./OperatorStatus'), 'OperatorStatus')
const OperatorSubscriptions = safeLazy(() => import('./OperatorSubscriptions'), 'OperatorSubscriptions')
const CRDHealth = safeLazy(() => import('./CRDHealth'), 'CRDHealth')
const HelmReleaseStatus = safeLazy(() => _deployBundle, 'HelmReleaseStatus')
const HelmValuesDiff = safeLazy(() => import('./HelmValuesDiff'), 'HelmValuesDiff')
const HelmHistory = safeLazy(() => _deployBundle, 'HelmHistory')
const ChartVersions = safeLazy(() => _deployBundle, 'ChartVersions')
const KustomizationStatus = safeLazy(() => _deployBundle, 'KustomizationStatus')
const OverlayComparison = safeLazy(() => _deployBundle, 'OverlayComparison')
const ArgoCDApplications = safeLazy(() => _deployBundle, 'ArgoCDApplications')
const ArgoCDSyncStatus = safeLazy(() => _deployBundle, 'ArgoCDSyncStatus')
const ArgoCDHealth = safeLazy(() => _deployBundle, 'ArgoCDHealth')
const UserManagement = safeLazy(() => import('./UserManagement'), 'UserManagement')
const ConsoleIssuesCard = safeLazy(() => import('./console-missions/ConsoleIssuesCard'), 'ConsoleIssuesCard')
const ConsoleKubeconfigAuditCard = safeLazy(() => import('./console-missions/ConsoleKubeconfigAuditCard'), 'ConsoleKubeconfigAuditCard')
const ConsoleHealthCheckCard = safeLazy(() => import('./console-missions/ConsoleHealthCheckCard'), 'ConsoleHealthCheckCard')
// ConsoleOfflineDetectionCard eagerly imported above
// HardwareHealthCard eagerly imported above
const ProactiveGPUNodeHealthMonitor = safeLazy(() => import('./ProactiveGPUNodeHealthMonitor'), 'ProactiveGPUNodeHealthMonitor')
// ActiveAlerts — migrated to cardDescriptors.registry.ts (unified descriptor system)
const AlertRulesCard = safeLazy(() => import('./AlertRules'), 'AlertRulesCard')
const OpenCostOverview = safeLazy(() => import('./OpenCostOverview'), 'OpenCostOverview')
const KubecostOverview = safeLazy(() => import('./KubecostOverview'), 'KubecostOverview')
const OPAPolicies = safeLazy(() => import('./OPAPolicies'), 'OPAPolicies')
const FleetComplianceHeatmap = safeLazy(() => import('./FleetComplianceHeatmap'), 'FleetComplianceHeatmap')
const ComplianceDrift = safeLazy(() => import('./ComplianceDrift'), 'ComplianceDrift')
const CrossClusterPolicyComparison = safeLazy(() => import('./CrossClusterPolicyComparison'), 'CrossClusterPolicyComparison')
const RecommendedPolicies = safeLazy(() => import('./RecommendedPolicies'), 'RecommendedPolicies')
const KyvernoPolicies = safeLazy(() => import('./KyvernoPolicies'), 'KyvernoPolicies')
// Eagerly import demo-only compliance cards — they're tiny (~255 lines total),
// contain only hardcoded demo data, and lazy loading them causes blank cards
// while heavier modules (OPA) saturate the dev server's transform pipeline.
import { FalcoAlerts, TrivyScan, KubescapeScan, PolicyViolations, ComplianceScore } from './ComplianceCards'
const TrestleScan = safeLazy(() => import('./TrestleScan'), 'TrestleScan')
const VaultSecrets = safeLazy(() => import('./DataComplianceCards'), 'VaultSecrets')
const ExternalSecrets = safeLazy(() => import('./DataComplianceCards'), 'ExternalSecrets')
const CertManager = safeLazy(() => import('./DataComplianceCards'), 'CertManager')
// Workload detection cards — share one chunk via barrel import
const _workloadDetectionBundle = import('./workload-detection').catch(() => undefined as never)
const ProwJobs = safeLazy(() => _workloadDetectionBundle, 'ProwJobs')
const ProwStatus = safeLazy(() => _workloadDetectionBundle, 'ProwStatus')
const ProwHistory = safeLazy(() => _workloadDetectionBundle, 'ProwHistory')
const LLMInference = safeLazy(() => _workloadDetectionBundle, 'LLMInference')
const LLMModels = safeLazy(() => _workloadDetectionBundle, 'LLMModels')
const MLJobs = safeLazy(() => _workloadDetectionBundle, 'MLJobs')
const MLNotebooks = safeLazy(() => _workloadDetectionBundle, 'MLNotebooks')
// Weather — migrated to cardDescriptors.registry.ts (unified descriptor system)
const GitHubActivity = safeLazy(() => import('./GitHubActivity'), 'GitHubActivity')
const RSSFeed = safeLazy(() => import('./rss'), 'RSSFeed')
const Kubectl = safeLazy(() => import('./Kubectl'), 'Kubectl')
// Arcade/game cards — share one chunk via barrel import.
// Eagerly start loading the bundle at module parse time so all 24 game cards
// share one HTTP request instead of 24 separate ones. This also ensures that
// a stale-cache chunk_load error after a deploy fires at most once (one chunk
// URL) rather than once per card, keeping the error count well below the
// GA4 alert threshold of 5.
const _arcadeBundle = import('./arcade-bundle').catch(() => undefined as never)
const SudokuGame = safeLazy(() => _arcadeBundle, 'SudokuGame')
const MatchGame = safeLazy(() => _arcadeBundle, 'MatchGame')
const Solitaire = safeLazy(() => _arcadeBundle, 'Solitaire')
const Checkers = safeLazy(() => _arcadeBundle, 'Checkers')
const Game2048 = safeLazy(() => _arcadeBundle, 'Game2048')
// StockMarketTicker — migrated to cardDescriptors.registry.ts (unified descriptor system)
const Kubedle = safeLazy(() => _arcadeBundle, 'Kubedle')
const PodSweeper = safeLazy(() => _arcadeBundle, 'PodSweeper')
const ContainerTetris = safeLazy(() => _arcadeBundle, 'ContainerTetris')
const FlappyPod = safeLazy(() => _arcadeBundle, 'FlappyPod')
const KubeMan = safeLazy(() => _arcadeBundle, 'KubeMan')
const KubeKong = safeLazy(() => _arcadeBundle, 'KubeKong')
const PodPitfall = safeLazy(() => _arcadeBundle, 'PodPitfall')
const NodeInvaders = safeLazy(() => _arcadeBundle, 'NodeInvaders')
const MissileCommand = safeLazy(() => _arcadeBundle, 'MissileCommand')
const PodCrosser = safeLazy(() => _arcadeBundle, 'PodCrosser')
const PodBrothers = safeLazy(() => _arcadeBundle, 'PodBrothers')
const KubeKart = safeLazy(() => _arcadeBundle, 'KubeKart')
const KubePong = safeLazy(() => _arcadeBundle, 'KubePong')
const KubeSnake = safeLazy(() => _arcadeBundle, 'KubeSnake')
const KubeGalaga = safeLazy(() => _arcadeBundle, 'KubeGalaga')
const KubeBert = safeLazy(() => _arcadeBundle, 'KubeBert')
const KubeDoom = safeLazy(() => _arcadeBundle, 'KubeDoom')
const KubeCraft = safeLazy(() => _arcadeBundle, 'KubeCraft')
const IframeEmbed = safeLazy(() => import('./IframeEmbed'), 'IframeEmbed')
const NetworkUtils = safeLazy(() => import('./NetworkUtils'), 'NetworkUtils')
const MobileBrowser = safeLazy(() => import('./MobileBrowser'), 'MobileBrowser')
const KubeChess = safeLazy(() => _arcadeBundle, 'KubeChess')
// Temporarily disabled to reduce bundle size (saves ~469KB)
// const KubeCraft3D = safeLazy(() => import('./KubeCraft3D'), 'KubeCraft3D')
const ServiceExports = safeLazy(() => import('./ServiceExports'), 'ServiceExports')
const ServiceImports = safeLazy(() => import('./ServiceImports'), 'ServiceImports')
const GatewayStatus = safeLazy(() => import('./GatewayStatus'), 'GatewayStatus')
const ServiceTopology = safeLazy(() => import('./ServiceTopology'), 'ServiceTopology')
const WorkloadDeployment = safeLazy(() => _deployBundle, 'WorkloadDeployment')
const ClusterGroups = safeLazy(() => _deployBundle, 'ClusterGroups')
const Missions = safeLazy(() => _deployBundle, 'Missions')
const ResourceMarshall = safeLazy(() => _deployBundle, 'ResourceMarshall')
// Workload monitor cards — share one chunk via barrel import
const _workloadMonitorBundle = import('./workload-monitor').catch(() => undefined as never)
const WorkloadMonitor = safeLazy(() => _workloadMonitorBundle, 'WorkloadMonitor')
const DynamicCard = safeLazy(() => import('./DynamicCard'), 'DynamicCard')
const LLMdStackMonitor = safeLazy(() => _workloadMonitorBundle, 'LLMdStackMonitor')
const ProwCIMonitor = safeLazy(() => _workloadMonitorBundle, 'ProwCIMonitor')

// LLM-d stunning visualization cards — eagerly start loading the barrel at
// module parse time so all 7 heavy chunks (194KB total source) are pre-warmed
// before the AI/ML dashboard renders, shared across all lazy() references.
const _llmdBundle = import('./llmd').catch(() => undefined as never)
const LLMdFlow = safeLazy(() => _llmdBundle, 'LLMdFlow')
const KVCacheMonitor = safeLazy(() => _llmdBundle, 'KVCacheMonitor')
const EPPRouting = safeLazy(() => _llmdBundle, 'EPPRouting')
const PDDisaggregation = safeLazy(() => _llmdBundle, 'PDDisaggregation')
const LLMdAIInsights = safeLazy(() => _llmdBundle, 'LLMdAIInsights')
const LLMdConfigurator = safeLazy(() => _llmdBundle, 'LLMdConfigurator')
// LLM-d benchmark dashboard cards (share the same barrel bundle)
const NightlyE2EStatus = safeLazy(() => _llmdBundle, 'NightlyE2EStatus')
const BenchmarkHero = safeLazy(() => _llmdBundle, 'BenchmarkHero')
const ParetoFrontier = safeLazy(() => _llmdBundle, 'ParetoFrontier')
const HardwareLeaderboard = safeLazy(() => _llmdBundle, 'HardwareLeaderboard')
const LatencyBreakdown = safeLazy(() => _llmdBundle, 'LatencyBreakdown')
const ThroughputComparison = safeLazy(() => _llmdBundle, 'ThroughputComparison')
const PerformanceTimeline = safeLazy(() => _llmdBundle, 'PerformanceTimeline')
const ResourceUtilization = safeLazy(() => _llmdBundle, 'ResourceUtilization')
const GitHubCIMonitor = safeLazy(() => _workloadMonitorBundle, 'GitHubCIMonitor')
const ClusterHealthMonitor = safeLazy(() => _workloadMonitorBundle, 'ClusterHealthMonitor')
const ProviderHealth = safeLazy(() => import('./ProviderHealth'), 'ProviderHealth')

// Kagenti AI Agent Platform cards — share one chunk via barrel import
const KagentiStatusCard = safeLazy(() => import('./KagentiStatusCard'), 'KagentiStatusCard')
const _kagentiBundle = import('./kagenti').catch(() => undefined as never)
const KagentiAgentFleet = safeLazy(() => _kagentiBundle, 'KagentiAgentFleet')
const KagentiBuildPipeline = safeLazy(() => _kagentiBundle, 'KagentiBuildPipeline')
const KagentiToolRegistry = safeLazy(() => _kagentiBundle, 'KagentiToolRegistry')
const KagentiAgentDiscovery = safeLazy(() => _kagentiBundle, 'KagentiAgentDiscovery')
const KagentiSecurity = safeLazy(() => _kagentiBundle, 'KagentiSecurity')
const KagentiSecurityPosture = safeLazy(() => _kagentiBundle, 'KagentiSecurityPosture')
const KagentiTopology = safeLazy(() => _kagentiBundle, 'KagentiTopology')

// Kagent CRD Dashboard cards — share one chunk via barrel import
const KagentStatusCard = safeLazy(() => import('./KagentStatusCard'), 'KagentStatusCard')
const _kagentBundle = import('./kagent').catch(() => undefined as never)
const KagentAgentFleet = safeLazy(() => _kagentBundle, 'KagentAgentFleet')
const KagentToolRegistry = safeLazy(() => _kagentBundle, 'KagentToolRegistry')
const KagentModelProviders = safeLazy(() => _kagentBundle, 'KagentModelProviders')
const KagentAgentDiscovery = safeLazy(() => _kagentBundle, 'KagentAgentDiscovery')
const KagentSecurity = safeLazy(() => _kagentBundle, 'KagentSecurity')
const KagentTopology = safeLazy(() => _kagentBundle, 'KagentTopology')

const CrossplaneManagedResources = safeLazy(() => import('./crossplane-status/CrossplaneManagedResources'), 'CrossplaneManagedResources')
// Cloud Native Buildpacks card
// ISO 27001 Security Audit checklist card
const ISO27001Audit = safeLazy(() => import('./ISO27001Audit'), 'ISO27001Audit')
const BuildpacksStatus = safeLazy(() => import('./buildpacks-status'), 'BuildpacksStatus')
// Flatcar Container Linux card
const FlatcarStatus = safeLazy(() => import('./flatcar_status'), 'FlatcarStatus')
// CoreDNS card
const CoreDNSStatus = safeLazy(() => import('./coredns_status'), 'CoreDNSStatus')
// KEDA card
const KedaStatus = safeLazy(() => import('./keda_status'), 'KedaStatus')
// Fluentd log collector card
const FluentdStatus = safeLazy(() => import('./fluentd_status'), 'FluentdStatus')
// CRI-O container runtime card
const CrioStatus = safeLazy(() => import('./crio_status'), 'CrioStatus')
// Lima VM card
const LimaStatus = safeLazy(() => import('./lima_status'), 'LimaStatus')
// CloudEvents monitoring card
const CloudEventsStatus = safeLazy(() => import('./cloudevents_status'), 'CloudEventsStatus')
// Strimzi Kafka operator card
const StrimziStatus = safeLazy(() => import('./strimzi_status'), 'StrimziStatus')
// KubeVela application delivery card
const KubeVelaStatus = safeLazy(() => import('./kubevela_status'), 'KubeVelaStatus')
// Karmada multi-cluster orchestration card
const KarmadaStatus = safeLazy(() => import('./karmada_status'), 'KarmadaStatus')
// KubeRay fleet monitoring card
const KubeRayFleet = safeLazy(() => import('./kuberay_fleet'), 'KubeRayFleet')
// SLO compliance tracking card
const SLOCompliance = safeLazy(() => import('./slo_compliance'), 'SLOCompliance')
// Cross-region failover timeline card
const FailoverTimeline = safeLazy(() => import('./failover_timeline'), 'FailoverTimeline')
// Trino query gateway monitoring card
const TrinoGateway = safeLazy(() => import('./trino_gateway'), 'TrinoGateway')
// Thanos distributed metrics card
const ThanosStatus = safeLazy(() => import('./thanos_status'), 'ThanosStatus')
// OpenFeature feature-flag management card
const OpenFeatureStatus = safeLazy(() => import('./openfeature_status'), 'OpenFeatureStatus')

// Inspektor Gadget cards
const NetworkTraceCard = safeLazy(() => import('./gadget/NetworkTraceCard'), 'NetworkTraceCard')
const DNSTraceCard = safeLazy(() => import('./gadget/DNSTraceCard'), 'DNSTraceCard')
const ProcessTraceCard = safeLazy(() => import('./gadget/ProcessTraceCard'), 'ProcessTraceCard')
const SecurityAuditCard = safeLazy(() => import('./gadget/SecurityAuditCard'), 'SecurityAuditCard')

// Multi-tenancy cards — share one chunk via barrel import
const _multiTenancyBundle = import('./multi-tenancy').catch(() => undefined as never)
const OvnStatus = safeLazy(() => _multiTenancyBundle, 'OvnStatus')
const KubeflexStatus = safeLazy(() => _multiTenancyBundle, 'KubeflexStatus')
const K3sStatus = safeLazy(() => _multiTenancyBundle, 'K3sStatus')
const KubevirtStatus = safeLazy(() => _multiTenancyBundle, 'KubevirtStatus')
const MultiTenancyOverview = safeLazy(() => _multiTenancyBundle, 'MultiTenancyOverview')
const TenantIsolationSetup = safeLazy(() => _multiTenancyBundle, 'TenantIsolationSetup')
const TenantTopology = safeLazy(() => _multiTenancyBundle, 'TenantTopology')

// Multi-cluster insights cards — share one chunk via barrel import
const _insightsBundle = import('./insights').catch(() => undefined as never)
const CrossClusterEventCorrelation = safeLazy(() => _insightsBundle, 'CrossClusterEventCorrelation')
const ClusterDeltaDetector = safeLazy(() => _insightsBundle, 'ClusterDeltaDetector')
const CascadeImpactMap = safeLazy(() => _insightsBundle, 'CascadeImpactMap')
const ConfigDriftHeatmap = safeLazy(() => _insightsBundle, 'ConfigDriftHeatmap')
const ResourceImbalanceDetector = safeLazy(() => _insightsBundle, 'ResourceImbalanceDetector')
const RestartCorrelationMatrix = safeLazy(() => _insightsBundle, 'RestartCorrelationMatrix')
const DeploymentRolloutTracker = safeLazy(() => _insightsBundle, 'DeploymentRolloutTracker')

// Cluster admin cards — share one chunk via barrel import
const _clusterAdminBundle = import('./cluster-admin-bundle').catch(() => undefined as never)
const PredictiveHealth = safeLazy(() => _clusterAdminBundle, 'PredictiveHealth')
const NodeDebug = safeLazy(() => _clusterAdminBundle, 'NodeDebug')
const ControlPlaneHealth = safeLazy(() => _clusterAdminBundle, 'ControlPlaneHealth')
const NodeConditions = safeLazy(() => _clusterAdminBundle, 'NodeConditions')
const AdmissionWebhooks = safeLazy(() => _clusterAdminBundle, 'AdmissionWebhooks')
const EtcdStatus = safeLazy(() => _clusterAdminBundle, 'EtcdStatus')
const NetworkPolicyCoverage = safeLazy(() => _clusterAdminBundle, 'NetworkPolicyCoverage')
const RBACExplorer = safeLazy(() => _clusterAdminBundle, 'RBACExplorer')
const MaintenanceWindows = safeLazy(() => _clusterAdminBundle, 'MaintenanceWindows')
const ClusterChangelog = safeLazy(() => _clusterAdminBundle, 'ClusterChangelog')
const QuotaHeatmap = safeLazy(() => _clusterAdminBundle, 'QuotaHeatmap')

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
  gpu_inventory_history: GPUInventoryHistory,
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
  gpu_node_health: ProactiveGPUNodeHealthMonitor,
  // Alerting cards — active_alerts registered via unified descriptor system
  alert_rules: AlertRulesCard,
  // Cost management integrations
  opencost_overview: OpenCostOverview,
  kubecost_overview: KubecostOverview,
  // Policy management cards
  opa_policies: OPAPolicies,
  kyverno_policies: KyvernoPolicies,
  // Compliance tool cards
  falco_alerts: FalcoAlerts,
  trestle_scan: TrestleScan,
  trivy_scan: TrivyScan,
  kubescape_scan: KubescapeScan,
  policy_violations: PolicyViolations,
  compliance_score: ComplianceScore,
  // ISO 27001 audit checklist
  iso27001_audit: ISO27001Audit,
  // Cross-cluster compliance cards
  fleet_compliance_heatmap: FleetComplianceHeatmap,
  compliance_drift: ComplianceDrift,
  cross_cluster_policy_comparison: CrossClusterPolicyComparison,
  recommended_policies: RecommendedPolicies,
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
  // Weather card — registered via unified descriptor system
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
  // Stock Market Ticker card — registered via unified descriptor system
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
  missile_command: MissileCommand,
  pod_crosser: PodCrosser,
  // Pod Brothers (Mario Bros) card
  pod_brothers: PodBrothers,
  kube_kart: KubeKart,
  kube_pong: KubePong,
  kube_snake: KubeSnake,
  kube_galaga: KubeGalaga,
  kube_bert: KubeBert,
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

  // Kagent CRD Dashboard cards
  kagent_status: KagentStatusCard,
  kagent_agent_fleet: KagentAgentFleet,
  kagent_tool_registry: KagentToolRegistry,
  kagent_model_providers: KagentModelProviders,
  kagent_agent_discovery: KagentAgentDiscovery,
  kagent_security: KagentSecurity,
  kagent_topology: KagentTopology,

  // Crossplane cards
  crossplane_managed_resources: CrossplaneManagedResources,

  // Cluster admin cards
  predictive_health: PredictiveHealth,
  node_debug: NodeDebug,
  control_plane_health: ControlPlaneHealth,
  node_conditions: NodeConditions,
  admission_webhooks: AdmissionWebhooks,
  // dns_health kept for backwards compatibility but renders via CoreDNSStatus
  dns_health: CoreDNSStatus,
  etcd_status: EtcdStatus,
  network_policies: NetworkPolicyCoverage,
  rbac_explorer: RBACExplorer,
  maintenance_windows: MaintenanceWindows,
  cluster_changelog: ClusterChangelog,
  quota_heatmap: QuotaHeatmap,
  // Cloud Native Buildpacks
  buildpacks_status: BuildpacksStatus,
  // Flatcar Container Linux
  flatcar_status: FlatcarStatus,
  // CoreDNS
  coredns_status: CoreDNSStatus,
  // KEDA
  keda_status: KedaStatus,
  // Fluentd log collector
  fluentd_status: FluentdStatus,
  // CRI-O container runtime
  crio_status: CrioStatus,
  // Lima VM
  lima_status: LimaStatus,
  // CloudEvents messaging
  cloudevents_status: CloudEventsStatus,
  // Strimzi Kafka operator
  strimzi_status: StrimziStatus,
  // KubeVela application delivery
  kubevela_status: KubeVelaStatus,
  // Karmada multi-cluster orchestration
  karmada_status: KarmadaStatus,
  // KubeRay fleet monitoring
  kuberay_fleet: KubeRayFleet,
  // SLO compliance tracking
  slo_compliance: SLOCompliance,
  // Cross-region failover timeline
  failover_timeline: FailoverTimeline,
  // Trino query gateway monitoring
  trino_gateway: TrinoGateway,
  // Thanos distributed metrics
  thanos_status: ThanosStatus,
  // OpenFeature feature-flag management
  openfeature_status: OpenFeatureStatus,

  // Inspektor Gadget cards
  network_trace: NetworkTraceCard,
  dns_trace: DNSTraceCard,
  process_trace: ProcessTraceCard,
  security_audit: SecurityAuditCard,

  // LLM-d stunning visualization cards
  llmd_flow: LLMdFlow,
  kvcache_monitor: KVCacheMonitor,
  epp_routing: EPPRouting,
  pd_disaggregation: PDDisaggregation,
  llmd_ai_insights: LLMdAIInsights,
  llmd_configurator: LLMdConfigurator,

  // LLM-d benchmark dashboard cards
  nightly_e2e_status: NightlyE2EStatus,
  benchmark_hero: BenchmarkHero,
  pareto_frontier: ParetoFrontier,
  hardware_leaderboard: HardwareLeaderboard,
  latency_breakdown: LatencyBreakdown,
  throughput_comparison: ThroughputComparison,
  performance_timeline: PerformanceTimeline,
  resource_utilization: ResourceUtilization,

  // Multi-tenancy cards
  ovn_status: OvnStatus,
  kubeflex_status: KubeflexStatus,
  k3s_status: K3sStatus,
  kubevirt_status: KubevirtStatus,
  multi_tenancy_overview: MultiTenancyOverview,
  tenant_isolation_setup: TenantIsolationSetup,
  tenant_topology: TenantTopology,

  // Multi-cluster insights cards
  cross_cluster_event_correlation: CrossClusterEventCorrelation,
  cluster_delta_detector: ClusterDeltaDetector,
  cascade_impact_map: CascadeImpactMap,
  config_drift_heatmap: ConfigDriftHeatmap,
  resource_imbalance_detector: ResourceImbalanceDetector,
  restart_correlation_matrix: RestartCorrelationMatrix,
  deployment_rollout_tracker: DeploymentRolloutTracker,

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

// Lazy-load UnifiedCard — keeps it out of the main bundle for fast page load
const LazyUnifiedCard = lazy(() =>
  import('../../lib/unified/card/UnifiedCard').then(m => ({ default: m.UnifiedCard })),
)

/** Supported unified content types that the adapter can render */
const _UNIFIED_CONTENT_TYPES = ['list', 'table', 'chart', 'status-grid']

/** Build a lazy adapter component for a unified card type */
function _makeUnifiedEntry(cardType: string): CardComponent | undefined {
  const config = getCardConfig(cardType)
  if (!config?.dataSource || !config?.content) return undefined
  if (!_UNIFIED_CONTENT_TYPES.includes(config.content.type)) return undefined
  const Adapter: CardComponent = () => createElement(LazyUnifiedCard, { config, className: 'h-full' })
  Adapter.displayName = `Unified(${cardType})`
  return Adapter
}

// Statically register unified-only cards (no legacy component) so they render
// without a Proxy and participate in normal lazy-loading like every other card.
const _UNIFIED_ONLY_TYPES = [
  'node_status', 'statefulset_status', 'daemonset_status', 'job_status',
  'cronjob_status', 'replicaset_status', 'hpa_status', 'configmap_status',
  'secret_status', 'pv_status', 'ingress_status', 'network_policy_status',
  'namespace_status', 'resource_quota_status', 'limit_range_status',
  'service_account_status', 'role_status', 'role_binding_status',
  'operator_subscription_status',
] as const

for (const cardType of _UNIFIED_ONLY_TYPES) {
  const adapter = _makeUnifiedEntry(cardType)
  if (adapter) {
    RAW_CARD_COMPONENTS[cardType] = adapter
  }
}

export const CARD_COMPONENTS = RAW_CARD_COMPONENTS

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
  // Note: service_topology removed — now reports isDemoData via useTopology hook
  // Note: buildpacks_status removed — reports isDemoData via useBuildpackImages hook

  // Workload Deployment - uses real data when backend is running, falls back to demo internally
  // NOT in DEMO_DATA_CARDS because the static badge can't detect runtime data source
  // Note: argocd_applications removed — now reports isDemoData via useArgoCDApplications hook
  // Note: argocd_health removed — now reports isDemoData via useArgoCDHealth hook
  // Note: argocd_sync_status removed — reports isDemoData via useArgoCDSyncStatus hook
  // GitOps cards - use mock data
  // Note: kustomization_status removed — reports isDemoData via demoMode check
  // Helm cards - all now use real data via helm CLI backend
  // Namespace cards - namespace_quotas, namespace_rbac, resource_capacity, and helm_release_status now have real data support
  // Cost management integrations - demo until connected
  'opencost_overview',
  'kubecost_overview',
  // Note: kyverno_policies removed — now reports isDemoData via useKyverno hook
  // Note: trivy_scan removed — now reports isDemoData via useTrivy hook
  // Note: kubescape_scan removed — now reports isDemoData via useKubescape hook
  // Note: policy_violations removed — now reports isDemoData via useKyverno hook
  // Note: compliance_score removed — now reports isDemoData via useKubescape/useKyverno hooks
  // Note: iso27001_audit removed — now reports isDemoData via useCachedISO27001Audit hook
  // Security posture cards - demo until tools are detected
  'falco_alerts',
  // Data compliance cards - demo until tools are detected
  // Note: cert_manager now uses real data via useCertManager hook
  'vault_secrets',
  'external_secrets',
  // Workload detection cards - demo until tools are detected
  // Note: prow_jobs, prow_status, prow_history now use real data via useProw hook
  // Note: llm_inference, llm_models now use real data via useLLMd hook
  'ml_jobs',
  'ml_notebooks',
  // Note: LLM-d cards (llmd_flow, kvcache_monitor, epp_routing, pd_disaggregation, llmd_ai_insights)
  // removed - they now use StackContext for live data and report isDemoData via useReportCardDataState
  // LLM-d Configurator - demo showcase of tuning options, not a complete YAML generator
  'llmd_configurator',
  // Note: nightly_e2e_status NOT here — dynamically reports isDemoData via useNightlyE2EData hook
  // Provider health card uses real data from /settings/keys + useClusters()
  // Only shows demo data when getDemoMode() is true (handled inside the hook)
  // Cluster admin cards - demo until backend endpoints exist
  'admission_webhooks',
  // Note: etcd_status removed — reports isDemoData via useCachedPods isDemoFallback
  'rbac_explorer',
  // Kagenti cards - demo until kagenti-operator is installed on clusters
  'kagenti_status',
  'kagenti_agent_fleet',
  'kagenti_build_pipeline',
  'kagenti_tool_registry',
  'kagenti_agent_discovery',
  'kagenti_security',
  'kagenti_topology',
  'kagenti_security_posture',
  // Kagent CRD cards - demo until kagent CRDs are installed on clusters
  'kagent_status',
  'kagent_agent_fleet',
  'kagent_tool_registry',
  'kagent_model_providers',
  'kagent_agent_discovery',
  'kagent_security',
  'kagent_topology',
  // Crossplane cards - demo until Crossplane is installed
  'crossplane_managed_resources',
  // KubeVela - demo until KubeVela is installed
  'kubevela_status',
])

/**
 * Cards that should never show demo indicators (badge/yellow border).
 * Arcade/game cards don't have "demo data" — they're always just games.
 */
// Re-export the imported DEMO_EXEMPT_CARDS for backward compatibility.
// (Imported at the top of this file from cardMetadata.ts so the descriptor
// registration can mutate the same Set instance.)
export { DEMO_EXEMPT_CARDS }

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
  gpu_inventory_history: () => import('./GPUInventoryHistory'),
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
  // active_alerts — preloader registered via unified descriptor system
  alert_rules: () => import('./AlertRules'),
  opencost_overview: () => import('./OpenCostOverview'),
  kubecost_overview: () => import('./KubecostOverview'),
  // Policy & compliance (shared modules)
  opa_policies: () => import('./OPAPolicies'),
  kyverno_policies: () => import('./KyvernoPolicies'),
  falco_alerts: () => import('./ComplianceCards'),
  iso27001_audit: () => import('./ISO27001Audit'),
  trestle_scan: () => import('./TrestleScan'),
  trivy_scan: () => import('./ComplianceCards'),
  kubescape_scan: () => import('./ComplianceCards'),
  policy_violations: () => import('./ComplianceCards'),
  compliance_score: () => import('./ComplianceCards'),
  // Cross-cluster compliance cards
  fleet_compliance_heatmap: () => import('./FleetComplianceHeatmap'),
  compliance_drift: () => import('./ComplianceDrift'),
  cross_cluster_policy_comparison: () => import('./CrossClusterPolicyComparison'),
  recommended_policies: () => import('./RecommendedPolicies'),
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
  gpu_node_health: () => import('./ProactiveGPUNodeHealthMonitor'),
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
  llmd_ai_insights: () => import('./llmd'),
  llmd_configurator: () => import('./llmd'),
  // LLM-d benchmark dashboard cards — all share the llmd barrel bundle
  nightly_e2e_status: () => import('./llmd'),
  benchmark_hero: () => import('./llmd'),
  pareto_frontier: () => import('./llmd'),
  hardware_leaderboard: () => import('./llmd'),
  latency_breakdown: () => import('./llmd'),
  throughput_comparison: () => import('./llmd'),
  performance_timeline: () => import('./llmd'),
  resource_utilization: () => import('./llmd'),
  // Multi-tenancy — all share one chunk via barrel
  ovn_status: () => _multiTenancyBundle,
  kubeflex_status: () => _multiTenancyBundle,
  k3s_status: () => _multiTenancyBundle,
  kubevirt_status: () => _multiTenancyBundle,
  multi_tenancy_overview: () => _multiTenancyBundle,
  tenant_isolation_setup: () => _multiTenancyBundle,
  tenant_topology: () => _multiTenancyBundle,
  // Cluster admin — all share one chunk via barrel
  predictive_health: () => import('./cluster-admin-bundle'),
  node_debug: () => import('./cluster-admin-bundle'),
  control_plane_health: () => import('./cluster-admin-bundle'),
  node_conditions: () => import('./cluster-admin-bundle'),
  admission_webhooks: () => import('./cluster-admin-bundle'),
  dns_health: () => import('./cluster-admin-bundle'),
  etcd_status: () => import('./cluster-admin-bundle'),
  network_policies: () => import('./cluster-admin-bundle'),
  rbac_explorer: () => import('./cluster-admin-bundle'),
  maintenance_windows: () => import('./cluster-admin-bundle'),
  cluster_changelog: () => import('./cluster-admin-bundle'),
  quota_heatmap: () => import('./cluster-admin-bundle'),
  // Kagenti AI Agents — all share one chunk via barrel
  kagenti_status: () => import('./KagentiStatusCard'),
  kagenti_agent_fleet: () => import('./kagenti'),
  kagenti_build_pipeline: () => import('./kagenti'),
  kagenti_tool_registry: () => import('./kagenti'),
  kagenti_agent_discovery: () => import('./kagenti'),
  kagenti_security: () => import('./kagenti'),
  kagenti_security_posture: () => import('./kagenti'),
  kagenti_topology: () => import('./kagenti'),
  // Kagent CRD cards — all share one chunk via barrel
  kagent_status: () => import('./KagentStatusCard'),
  kagent_agent_fleet: () => import('./kagent'),
  kagent_tool_registry: () => import('./kagent'),
  kagent_model_providers: () => import('./kagent'),
  kagent_agent_discovery: () => import('./kagent'),
  kagent_security: () => import('./kagent'),
  kagent_topology: () => import('./kagent'),
  // Crossplane cards
  crossplane_managed_resources: () => import('./crossplane-status'),
  // Cloud Native Buildpacks
  buildpacks_status: () => import('./buildpacks-status'),
  // KEDA
  keda_status: () => import('./keda_status'),
  // CloudEvents
  cloudevents_status: () => import('./cloudevents_status'),
  // CRI-O
  crio_status: () => import('./crio_status'),
  // Strimzi
  strimzi_status: () => import('./strimzi_status'),
  // KubeVela application delivery
  kubevela_status: () => import('./kubevela_status'),
  // Karmada multi-cluster orchestration
  karmada_status: () => import('./karmada_status'),
  kuberay_fleet: () => import('./kuberay_fleet'),
  slo_compliance: () => import('./slo_compliance'),
  failover_timeline: () => import('./failover_timeline'),
  trino_gateway: () => import('./trino_gateway'),
  // Thanos distributed metrics
  thanos_status: () => import('./thanos_status'),
  // OpenFeature feature-flag management
  openfeature_status: () => import('./openfeature_status'),
  // Flatcar Container Linux
  flatcar_status: () => import('./flatcar_status'),
  // CoreDNS
  coredns_status: () => import('./coredns_status'),
  // Fluentd log collector
  fluentd_status: () => import('./fluentd_status'),
  // Lima VM
  lima_status: () => import('./lima_status'),
  // Multi-cluster insights — all share one chunk via barrel
  cross_cluster_event_correlation: () => import('./insights'),
  cluster_delta_detector: () => import('./insights'),
  cascade_impact_map: () => import('./insights'),
  config_drift_heatmap: () => import('./insights'),
  resource_imbalance_detector: () => import('./insights'),
  restart_correlation_matrix: () => import('./insights'),
  deployment_rollout_tracker: () => import('./insights'),
  // User management & AI missions
  user_management: () => import('./UserManagement'),
  console_ai_issues: () => import('./console-missions/ConsoleIssuesCard'),
  console_ai_kubeconfig_audit: () => import('./console-missions/ConsoleKubeconfigAuditCard'),
  console_ai_health_check: () => import('./console-missions/ConsoleHealthCheckCard'),
  // RSS Feed & utilities
  rss_feed: () => import('./rss'),
  kubectl: () => import('./Kubectl'),
  iframe_embed: () => import('./IframeEmbed'),
  network_utils: () => import('./NetworkUtils'),
  mobile_browser: () => import('./MobileBrowser'),
  // Arcade games — all share one chunk via barrel
  sudoku_game: () => import('./arcade-bundle'),
  match_game: () => import('./arcade-bundle'),
  solitaire: () => import('./arcade-bundle'),
  checkers: () => import('./arcade-bundle'),
  game_2048: () => import('./arcade-bundle'),
  kubedle: () => import('./arcade-bundle'),
  pod_sweeper: () => import('./arcade-bundle'),
  container_tetris: () => import('./arcade-bundle'),
  flappy_pod: () => import('./arcade-bundle'),
  kube_man: () => import('./arcade-bundle'),
  kube_kong: () => import('./arcade-bundle'),
  pod_pitfall: () => import('./arcade-bundle'),
  node_invaders: () => import('./arcade-bundle'),
  missile_command: () => import('./arcade-bundle'),
  pod_crosser: () => import('./arcade-bundle'),
  pod_brothers: () => import('./arcade-bundle'),
  kube_kart: () => import('./arcade-bundle'),
  kube_pong: () => import('./arcade-bundle'),
  kube_snake: () => import('./arcade-bundle'),
  kube_galaga: () => import('./arcade-bundle'),
  kube_bert: () => import('./arcade-bundle'),
  kube_doom: () => import('./arcade-bundle'),
  kube_craft: () => import('./arcade-bundle'),
  kube_chess: () => import('./arcade-bundle'),
  // Inspektor Gadget cards
  network_trace: () => import('./gadget/NetworkTraceCard'),
  dns_trace: () => import('./gadget/DNSTraceCard'),
  process_trace: () => import('./gadget/ProcessTraceCard'),
  security_audit: () => import('./gadget/SecurityAuditCard'),
  // Dynamic card
  dynamic_card: () => import('./DynamicCard'),
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
    () => import('./KagentStatusCard'),
    () => import('./kagent/KagentAgentFleet'),
    () => import('./kagent/KagentToolRegistry'),
    () => import('./kagent/KagentModelProviders'),
    () => import('./kagent/KagentAgentDiscovery'),
    () => import('./kagent/KagentSecurity'),
    () => import('./kagent/KagentTopology'),
    () => import('./crossplane-status/CrossplaneManagedResources'),
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
  'gpu_inventory_history',
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
  // GPU node health monitoring
  'gpu_node_health',
  // Node status - live data from useNodes with demo fallback
  'node_status',
  // Nightly E2E status card
  'nightly_e2e_status',
  // Cluster admin cards with live data
  'control_plane_health',
  'node_conditions',
  'dns_health',
  'coredns_status',
  'keda_status',
  'crio_status',
  'strimzi_status',
  'kubevela_status',
  // KubeRay, SLO, Failover, Trino - demo until detected
  'kuberay_fleet',
  'slo_compliance',
  'failover_timeline',
  'trino_gateway',
  'network_policies',
  'cluster_changelog',
  'predictive_health',
  'quota_heatmap',
  // Multi-tenancy cards — live detection of cluster components
  'ovn_status',
  'kubeflex_status',
  'k3s_status',
  'kubevirt_status',
  'multi_tenancy_overview',
  'tenant_isolation_setup',
  'tenant_topology',
  // Kagenti AI agent cards
  'kagenti_status',
  'kagenti_agent_fleet',
  'kagenti_build_pipeline',
  'kagenti_tool_registry',
  'kagenti_agent_discovery',
  'kagenti_security',
  'kagenti_topology',
  // Kagent CRD cards
  'kagent_status',
  'kagent_agent_fleet',
  'kagent_tool_registry',
  'kagent_model_providers',
  'kagent_agent_discovery',
  'kagent_security',
  'kagent_topology',
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
  // active_alerts — width registered via unified descriptor system
  security_issues: 4,
  upgrade_status: 4,
  crossplane_managed_resources: 4,
  buildpacks_status: 6,

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
  kagenti_security_posture: 4,
  kagenti_topology: 8,

  // Kagent CRD Dashboard cards
  kagent_status: 4,
  kagent_agent_fleet: 8,
  kagent_tool_registry: 4,
  kagent_model_providers: 4,
  kagent_agent_discovery: 4,
  kagent_security: 4,
  kagent_topology: 8,

  // LLM-d stunning visualization cards
  llmd_flow: 8,           // Hero animated flow diagram
  kvcache_monitor: 4,     // KV cache gauges
  epp_routing: 6,         // EPP Sankey diagram
  pd_disaggregation: 6,   // Prefill/Decode split view
  llmd_ai_insights: 6,    // AI insights panel
  llmd_configurator: 4,   // Configurator showcase

  // LLM-d benchmark dashboard cards (all full-width)
  nightly_e2e_status: 12,
  benchmark_hero: 12,
  pareto_frontier: 12,
  hardware_leaderboard: 12,
  latency_breakdown: 12,
  throughput_comparison: 12,
  performance_timeline: 12,
  resource_utilization: 12,

  // Cluster admin cards
  predictive_health: 8,
  node_debug: 6,
  control_plane_health: 4,
  node_conditions: 6,
  admission_webhooks: 6,
  dns_health: 4,
  coredns_status: 6,
  keda_status: 6,
  crio_status: 6,
  strimzi_status: 6,
  etcd_status: 4,
  network_policies: 6,
  rbac_explorer: 6,
  maintenance_windows: 6,
  cluster_changelog: 6,
  quota_heatmap: 8,
  // KubeVela application delivery
  kubevela_status: 6,
  // Flatcar Container Linux
  flatcar_status: 6,
  // Fluentd log collector
  fluentd_status: 6,
  // Lima VM
  lima_status: 6,
  // CloudEvents
  cloudevents_status: 6,
  // Karmada
  karmada_status: 6,
  kuberay_fleet: 6,
  slo_compliance: 6,
  failover_timeline: 8,
  trino_gateway: 6,
  // Thanos distributed metrics
  thanos_status: 6,
  // OpenFeature feature-flag management
  openfeature_status: 6,

  // Multi-cluster insights cards
  cross_cluster_event_correlation: 6,
  cluster_delta_detector: 6,
  cascade_impact_map: 6,
  config_drift_heatmap: 6,
  resource_imbalance_detector: 6,
  restart_correlation_matrix: 6,
  deployment_rollout_tracker: 6,

  // Multi-tenancy cards
  ovn_status: 6,
  kubeflex_status: 6,
  k3s_status: 6,
  kubevirt_status: 6,
  multi_tenancy_overview: 6,
  tenant_isolation_setup: 6,
  tenant_topology: 6,

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
  iso27001_audit: 6,
  trestle_scan: 6,
  trivy_scan: 4,
  kubescape_scan: 4,
  policy_violations: 6,
  compliance_score: 4,
  // Cross-cluster compliance cards
  fleet_compliance_heatmap: 6,
  compliance_drift: 5,
  cross_cluster_policy_comparison: 5,
  recommended_policies: 6,
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
  gpu_node_health: 6,
  node_status: 6,
  user_management: 6,
  // weather — width registered via unified descriptor system
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
  // Solitaire
  solitaire: 6,
  // AI Checkers
  checkers: 6,
  // Kube 2048
  game_2048: 5,
  // stock_market_ticker — width registered via unified descriptor system
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
  missile_command: 6,
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
  kube_bert: 5,
  // kube_craft_3d: 6,  // Temporarily disabled

  // Wide cards (7-8 columns) - charts and trends
  pod_health_trend: 8,
  events_timeline: 8,
  cluster_metrics: 8,
  resource_trend: 8,
  resource_capacity: 8,
  gpu_utilization: 8,
  gpu_usage_trend: 8,
  gpu_inventory_history: 8,
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

// ---------------------------------------------------------------------------
// Unified Card Descriptor Registration
// ---------------------------------------------------------------------------
// Cards migrated to the descriptor system are registered here.
// This populates RAW_CARD_COMPONENTS, CARD_CHUNK_PRELOADERS,
// CARD_DEFAULT_WIDTHS, CARD_TITLES, CARD_DESCRIPTIONS, and
// DEMO_DATA_CARDS / LIVE_DATA_CARDS / DEMO_EXEMPT_CARDS in one call.
registerAllDescriptorCards({
  components: RAW_CARD_COMPONENTS,
  preloaders: CARD_CHUNK_PRELOADERS,
  defaultWidths: CARD_DEFAULT_WIDTHS,
  titles: CARD_TITLES,
  descriptions: CARD_DESCRIPTIONS,
  demoDataCards: DEMO_DATA_CARDS,
  liveDataCards: LIVE_DATA_CARDS,
  demoExemptCards: DEMO_EXEMPT_CARDS,
})

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
