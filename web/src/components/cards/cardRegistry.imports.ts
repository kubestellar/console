/**
 * Card Component Registry — maps card types to lazy-loaded React components.
 *
 * Also add new cards to the browse catalog in:
 *   src/components/dashboard/AddCardModal.tsx → CARD_CATALOG
 * See src/config/cards/index.ts for the full registration checklist.
 */
import { safeLazy } from '../../lib/safeLazy'

// Eagerly import the default main-dashboard cards so they render instantly on
// page load (no React.lazy chunk delay).  These are the 9 cards in the "main"
// dashboard config — waiting for Vite to compile their chunks causes 10-15s of
// skeletons even when cached data is available.
import { ClusterHealth } from './ClusterHealth'
import { EventStream } from './EventStream'
import { PodIssues } from './PodIssues'
import { ResourceUsage } from './ResourceUsage'
import { ClusterMetrics } from './ClusterMetrics'
import { HardwareHealthCard } from './HardwareHealthCard'
import { DeploymentStatus } from './DeploymentStatus'
// Remaining cards are lazy-loaded for code splitting
// ConsoleOfflineDetectionCard lazy-loaded to reduce critical path bundle size
const ConsoleOfflineDetectionCard = safeLazy(() => import('./console-missions/ConsoleOfflineDetectionCard'), 'ConsoleOfflineDetectionCard')
const PodLogs = safeLazy(() => import('./PodLogs'), 'PodLogs')
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
// EventsTimeline deferred to keep the echarts vendor chunk off the critical path
const EventsTimeline = safeLazy(() => import('./EventsTimeline'), 'EventsTimeline')
const PodHealthTrend = safeLazy(() => import('./PodHealthTrend'), 'PodHealthTrend')
const ResourceTrend = safeLazy(() => import('./ResourceTrend'), 'ResourceTrend')
const GPUUtilization = safeLazy(() => import('./GPUUtilization'), 'GPUUtilization')
const GPUUsageTrend = safeLazy(() => import('./GPUUsageTrend'), 'GPUUsageTrend')
const ClusterResourceTree = safeLazy(() => import('./cluster-resource-tree/ClusterResourceTree'), 'ClusterResourceTree')
// Cross-cluster change timeline (Phase 2 of #9967)
const ChangeTimeline = safeLazy(() => import('./change_timeline/ChangeTimeline'), 'ChangeTimeline')
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
const FluxStatus = safeLazy(() => import('./flux_status'), 'FluxStatus')
// Backstage developer portal card (CNCF incubating)
const BackstageStatus = safeLazy(() => import('./backstage_status'), 'BackstageStatus')
// Contour ingress proxy card
const ContourStatus = safeLazy(() => import('./contour_status'), 'ContourStatus')
// Dapr distributed application runtime card
const DaprStatus = safeLazy(() => import('./dapr_status'), 'DaprStatus')
// Envoy proxy card (Service Mesh / network)
const EnvoyStatus = safeLazy(() => import('./envoy_status'), 'EnvoyStatus')
// gRPC services card (network / service communication)
const GrpcStatus = safeLazy(() => import('./grpc_status'), 'GrpcStatus')
// Linkerd service mesh card
const LinkerdStatus = safeLazy(() => import('./linkerd_status'), 'LinkerdStatus')
// Longhorn distributed block storage card (CNCF Incubating)
const LonghornStatus = safeLazy(() => import('./longhorn_status'), 'LonghornStatus')
// OpenFGA fine-grained authorization card (CNCF Sandbox)
const OpenfgaStatus = safeLazy(() => import('./openfga_status'), 'OpenfgaStatus')
// OpenTelemetry collector card (Observability)
const OtelStatus = safeLazy(() => import('./otel_status'), 'OtelStatus')
// Rook cloud-native storage orchestrator card
const RookStatus = safeLazy(() => import('./rook_status'), 'RookStatus')
// SPIFFE workload identity card (CNCF graduated)
const SpiffeStatus = safeLazy(() => import('./spiffe_status'), 'SpiffeStatus')
// CNI (Container Network Interface) plugin status card
const CniStatus = safeLazy(() => import('./cni_status'), 'CniStatus')
// SPIRE (SPIFFE Runtime Environment) workload identity card
const SpireStatus = safeLazy(() => import('./spire_status'), 'SpireStatus')
// TiKV distributed key-value store card
const TikvStatus = safeLazy(() => import('./tikv_status'), 'TikvStatus')
// TUF (The Update Framework) repository metadata card
const TufStatus = safeLazy(() => import('./tuf_status'), 'TufStatus')
// Vitess distributed MySQL card
const VitessStatus = safeLazy(() => import('./vitess_status'), 'VitessStatus')
// Chaos Mesh fault-injection and chaos engineering card
const ChaosMeshStatus = safeLazy(() => import('./chaos_mesh_status'), 'ChaosMeshStatus')
// wasmCloud WebAssembly lattice card (CNCF incubating)
const WasmcloudStatus = safeLazy(() => import('./wasmcloud_status'), 'WasmcloudStatus')
// Volcano batch/HPC scheduler card (CNCF Incubating)
const VolcanoStatus = safeLazy(() => import('./volcano_status'), 'VolcanoStatus')
const OverlayComparison = safeLazy(() => _deployBundle, 'OverlayComparison')
const ArgoCDApplications = safeLazy(() => _deployBundle, 'ArgoCDApplications')
const ArgoCDApplicationSets = safeLazy(() => _deployBundle, 'ArgoCDApplicationSets')
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
const IntotoSupplyChain = safeLazy(() => import('./intoto_supply_chain'), 'IntotoSupplyChain')
// ComplianceCards — 5 named exports, ~1200 LOC. Lazy-loaded; originally
// eager but the comment was stale (file grew from 255 → 1200 lines).
const _complianceBundle = import('./ComplianceCards').catch(() => undefined as never)
const FalcoAlerts = safeLazy(() => _complianceBundle, 'FalcoAlerts')
const TrivyScan = safeLazy(() => _complianceBundle, 'TrivyScan')
const KubescapeScan = safeLazy(() => _complianceBundle, 'KubescapeScan')
const PolicyViolations = safeLazy(() => _complianceBundle, 'PolicyViolations')
const ComplianceScore = safeLazy(() => _complianceBundle, 'ComplianceScore')
const TrestleScan = safeLazy(() => import('./TrestleScan'), 'TrestleScan')
const VaultSecrets = safeLazy(() => import('./DataComplianceCards'), 'VaultSecrets')
const ExternalSecrets = safeLazy(() => import('./DataComplianceCards'), 'ExternalSecrets')
const CertManager = safeLazy(() => import('./DataComplianceCards'), 'CertManager')
// Enterprise compliance cards — share one chunk
const _enterpriseComplianceBundle = import('./EnterpriseComplianceCards').catch(() => undefined as never)
const HIPAACard = safeLazy(() => _enterpriseComplianceBundle, 'HIPAACard')
const GxPCard = safeLazy(() => _enterpriseComplianceBundle, 'GxPCard')
const BAACard = safeLazy(() => _enterpriseComplianceBundle, 'BAACard')
const ComplianceFrameworksCard = safeLazy(() => _enterpriseComplianceBundle, 'ComplianceFrameworksCard')
const DataResidencyCard = safeLazy(() => _enterpriseComplianceBundle, 'DataResidencyCard')
const ChangeControlCard = safeLazy(() => _enterpriseComplianceBundle, 'ChangeControlCard')
const SegregationOfDutiesCard = safeLazy(() => _enterpriseComplianceBundle, 'SegregationOfDutiesCard')
const ComplianceReportsCard = safeLazy(() => _enterpriseComplianceBundle, 'ComplianceReportsCard')
const NISTCard = safeLazy(() => _enterpriseComplianceBundle, 'NISTCard')
const STIGCard = safeLazy(() => _enterpriseComplianceBundle, 'STIGCard')
const AirGapCard = safeLazy(() => _enterpriseComplianceBundle, 'AirGapCard')
const FedRAMPCard = safeLazy(() => _enterpriseComplianceBundle, 'FedRAMPCard')
const OIDCFederationCard = safeLazy(() => _enterpriseComplianceBundle, 'OIDCFederationCard')
const RBACAuditCard = safeLazy(() => _enterpriseComplianceBundle, 'RBACAuditCard')
const SessionManagementCard = safeLazy(() => _enterpriseComplianceBundle, 'SessionManagementCard')
const SIEMIntegrationCard = safeLazy(() => _enterpriseComplianceBundle, 'SIEMIntegrationCard')
const IncidentResponseCard = safeLazy(() => _enterpriseComplianceBundle, 'IncidentResponseCard')
const ThreatIntelCard = safeLazy(() => _enterpriseComplianceBundle, 'ThreatIntelCard')
const SBOMManagerCard = safeLazy(() => _enterpriseComplianceBundle, 'SBOMManagerCard')
const SigstoreVerifyCard = safeLazy(() => _enterpriseComplianceBundle, 'SigstoreVerifyCard')
const SLSAProvenanceCard = safeLazy(() => _enterpriseComplianceBundle, 'SLSAProvenanceCard')
const RiskMatrixCard = safeLazy(() => _enterpriseComplianceBundle, 'RiskMatrixCard')
const RiskRegisterCard = safeLazy(() => _enterpriseComplianceBundle, 'RiskRegisterCard')
const RiskAppetiteCard = safeLazy(() => _enterpriseComplianceBundle, 'RiskAppetiteCard')
// Enterprise dashboard content cards — each lazily loaded individually
const ComplianceFrameworksDashboardCard = safeLazy(() => import('../compliance/ComplianceFrameworks'), 'ComplianceFrameworksContent')
const ChangeControlDashboardCard = safeLazy(() => import('../compliance/ChangeControlAudit'), 'ChangeControlAuditContent')
const SegregationOfDutiesDashboardCard = safeLazy(() => import('../compliance/SegregationOfDuties'), 'SegregationOfDutiesContent')
const DataResidencyDashboardCard = safeLazy(() => import('../compliance/DataResidency'), 'DataResidencyContent')
const ComplianceReportsDashboardCard = safeLazy(() => import('../compliance/ComplianceReports'), 'ComplianceReportsContent')
const HIPAADashboardCard = safeLazy(() => import('../compliance/HIPAADashboard'), 'HIPAADashboardContent')
const GxPDashboardCard = safeLazy(() => import('../compliance/GxPDashboard'), 'GxPDashboardContent')
const BAADashboardCard = safeLazy(() => import('../compliance/BAADashboard'), 'BAADashboardContent')
const NISTDashboardCard = safeLazy(() => import('../compliance/NISTDashboard'), 'NISTDashboardContent')
const STIGDashboardCard = safeLazy(() => import('../compliance/STIGDashboard'), 'STIGDashboardContent')
const AirGapDashboardCard = safeLazy(() => import('../compliance/AirGapDashboard'), 'AirGapDashboardContent')
const FedRAMPDashboardCard = safeLazy(() => import('../compliance/FedRAMPDashboard'), 'FedRAMPDashboardContent')
const OIDCDashboardCard = safeLazy(() => import('../compliance/OIDCDashboard'), 'OIDCDashboardContent')
const RBACAuditDashboardCard = safeLazy(() => import('../compliance/RBACAuditDashboard'), 'RBACAuditDashboardContent')
const SessionDashboardCard = safeLazy(() => import('../compliance/SessionDashboard'), 'SessionDashboardContent')
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
const IssueActivityChart = safeLazy(() => import('./IssueActivityChart'), 'IssueActivityChart')
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
const IframeEmbed = safeLazy(() => import('./IframeEmbed'), 'IframeEmbed')
const NetworkUtils = safeLazy(() => import('./NetworkUtils'), 'NetworkUtils')
const MobileBrowser = safeLazy(() => import('./MobileBrowser'), 'MobileBrowser')
const KubeChess = safeLazy(() => _arcadeBundle, 'KubeChess')
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
const ACMMLevel = safeLazy(() => import('./ACMMLevel'), 'ACMMLevel')
const ACMMFeedbackLoops = safeLazy(() => import('./ACMMFeedbackLoops'), 'ACMMFeedbackLoops')
const ACMMRecommendations = safeLazy(() => import('./ACMMRecommendations'), 'ACMMRecommendations')
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
// Runtime Attestation Score card (#9987)
const RuntimeAttestationCard = safeLazy(() => import('./RuntimeAttestationCard'), 'RuntimeAttestationCard')

// GitHub Pipelines cards — all four share one chunk via the pipelines barrel
const _pipelinesBundle = import('./pipelines').catch(() => undefined as never)
const NightlyReleasePulse = safeLazy(() => _pipelinesBundle, 'NightlyReleasePulse')
const WorkflowMatrix = safeLazy(() => _pipelinesBundle, 'WorkflowMatrix')
const PipelineFlow = safeLazy(() => _pipelinesBundle, 'PipelineFlow')
const RecentFailures = safeLazy(() => _pipelinesBundle, 'RecentFailures')
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

// Drasi reactive pipeline cards — barrel import
const _drasiBundle = import('./drasi').catch(() => undefined as never)
const DrasiReactiveGraph = safeLazy(() => _drasiBundle, 'DrasiReactiveGraph')

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
// Cloud Custodian rules-engine card (CNCF incubating — marketplace#32)
const CloudCustodianStatus = safeLazy(() => import('./cloud_custodian_status'), 'CloudCustodianStatus')
// Containerd container runtime card (CNCF graduated — marketplace#4)
const ContainerdStatus = safeLazy(() => import('./containerd_status'), 'ContainerdStatus')
// Cortex horizontally scalable Prometheus card (CNCF incubating — marketplace#35)
const CortexStatus = safeLazy(() => import('./cortex_status'), 'CortexStatus')
// Dragonfly P2P image/file distribution card (CNCF graduated — marketplace#22)
const DragonflyStatus = safeLazy(() => import('./dragonfly_status'), 'DragonflyStatus')
// Lima VM card
const LimaStatus = safeLazy(() => import('./lima_status'), 'LimaStatus')
// NATS messaging server monitoring card
const NatsStatus = safeLazy(() => import('./nats_status'), 'NatsStatus')
// CloudEvents monitoring card
const CloudEventsStatus = safeLazy(() => import('./cloudevents_status'), 'CloudEventsStatus')
// Artifact Hub package discovery card
const ArtifactHubStatus = safeLazy(() => import('./artifact_hub_status'), 'ArtifactHubStatus')
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
// OpenFeature feature-flag management card
const OpenFeatureStatus = safeLazy(() => import('./openfeature_status'), 'OpenFeatureStatus')
// OpenKruise advanced workloads + sidecar injection card
const OpenKruiseStatus = safeLazy(() => import('./openkruise_status'), 'OpenKruiseStatus')
// Keycloak Identity & Access Management card
const KeycloakStatus = safeLazy(() => import('./keycloak_status'), 'KeycloakStatus')
// OpenYurt edge computing card
const OpenYurtStatus = safeLazy(() => import('./openyurt_status'), 'OpenYurtStatus')
// Knative serverless monitoring card
const KnativeStatus = safeLazy(() => import('./knative_status'), 'KnativeStatus')
// KServe model serving monitoring card
const KServeStatus = safeLazy(() => import('./kserve_status'), 'KServeStatus')
// Fluid dataset caching card
const FluidStatus = safeLazy(() => import('./fluid_status'), 'FluidStatus')
// Jaeger Tracing monitoring card
const JaegerStatus = safeLazy(() => import('./jaeger_status'), 'JaegerStatus')
// CubeFS distributed file system card
const CubefsStatus = safeLazy(() => import('./cubefs_status'), 'CubefsStatus')
// Harbor registry card
const HarborStatus = safeLazy(() => import('./harbor_status'), 'HarborStatus')
// Deployment Risk Score card (correlates Argo CD + Kyverno + pod restart signals) — #9827
const DeploymentRiskScore = safeLazy(() => import('./DeploymentRiskScore'), 'DeploymentRiskScore')
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


// vCluster status card
const VClusterStatus = safeLazy(() => import('./VClusterStatus'), 'VClusterStatus')

// Multi-cluster insights cards — share one chunk via barrel import
const _insightsBundle = import('./insights').catch(() => undefined as never)
const CrossClusterEventCorrelation = safeLazy(() => _insightsBundle, 'CrossClusterEventCorrelation')
const ClusterDeltaDetector = safeLazy(() => _insightsBundle, 'ClusterDeltaDetector')
const CascadeImpactMap = safeLazy(() => _insightsBundle, 'CascadeImpactMap')
const ConfigDriftHeatmap = safeLazy(() => _insightsBundle, 'ConfigDriftHeatmap')
const ResourceImbalanceDetector = safeLazy(() => _insightsBundle, 'ResourceImbalanceDetector')
const RestartCorrelationMatrix = safeLazy(() => _insightsBundle, 'RestartCorrelationMatrix')
const DeploymentRolloutTracker = safeLazy(() => _insightsBundle, 'DeploymentRolloutTracker')
const RightSizeAdvisor = safeLazy(() => _insightsBundle, 'RightSizeAdvisor')

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


// Export all lazy-loaded card components
export {
  // Eagerly-loaded main dashboard cards
  ClusterHealth,
  EventStream,
  PodIssues,
  ResourceUsage,
  ClusterMetrics,
  HardwareHealthCard,
  DeploymentStatus,
  // All other lazy-loaded cards
  ConsoleOfflineDetectionCard,
  PodLogs,
  TopPods,
  AppStatus,
  DeploymentProgress,
  DeploymentIssues,
  GitOpsDrift,
  UpgradeStatus,
  ResourceCapacity,
  GPUInventory,
  GPUStatus,
  GPUOverview,
  GPUWorkloads,
  GPUNamespaceAllocations,
  GPUInventoryHistory,
  SecurityIssues,
  EventSummary,
  WarningEvents,
  RecentEvents,
  EventsTimeline,
  PodHealthTrend,
  ResourceTrend,
  GPUUtilization,
  GPUUsageTrend,
  ClusterResourceTree,
  ChangeTimeline,
  StorageOverview,
  PVCStatus,
  NetworkOverview,
  ServiceStatus,
  ComputeOverview,
  ClusterFocus,
  ClusterComparison,
  ClusterCosts,
  ClusterNetwork,
  ClusterLocations,
  NamespaceOverview,
  NamespaceQuotas,
  NamespaceRBAC,
  NamespaceEvents,
  NamespaceMonitor,
  OperatorStatus,
  OperatorSubscriptions,
  CRDHealth,
  HelmReleaseStatus,
  HelmValuesDiff,
  HelmHistory,
  ChartVersions,
  KustomizationStatus,
  FluxStatus,
  BackstageStatus,
  ContourStatus,
  DaprStatus,
  EnvoyStatus,
  GrpcStatus,
  LinkerdStatus,
  LonghornStatus,
  OpenfgaStatus,
  OtelStatus,
  RookStatus,
  SpiffeStatus,
  CniStatus,
  SpireStatus,
  TikvStatus,
  TufStatus,
  VitessStatus,
  ChaosMeshStatus,
  WasmcloudStatus,
  VolcanoStatus,
  OverlayComparison,
  ArgoCDApplications,
  ArgoCDApplicationSets,
  ArgoCDSyncStatus,
  ArgoCDHealth,
  UserManagement,
  ConsoleIssuesCard,
  ConsoleKubeconfigAuditCard,
  ConsoleHealthCheckCard,
  ProactiveGPUNodeHealthMonitor,
  AlertRulesCard,
  OpenCostOverview,
  KubecostOverview,
  OPAPolicies,
  FleetComplianceHeatmap,
  ComplianceDrift,
  CrossClusterPolicyComparison,
  RecommendedPolicies,
  KyvernoPolicies,
  IntotoSupplyChain,
  FalcoAlerts,
  TrivyScan,
  KubescapeScan,
  PolicyViolations,
  ComplianceScore,
  TrestleScan,
  VaultSecrets,
  ExternalSecrets,
  CertManager,
  HIPAACard,
  GxPCard,
  BAACard,
  ComplianceFrameworksCard,
  DataResidencyCard,
  ChangeControlCard,
  SegregationOfDutiesCard,
  ComplianceReportsCard,
  NISTCard,
  STIGCard,
  AirGapCard,
  FedRAMPCard,
  OIDCFederationCard,
  RBACAuditCard,
  SessionManagementCard,
  SIEMIntegrationCard,
  IncidentResponseCard,
  ThreatIntelCard,
  SBOMManagerCard,
  SigstoreVerifyCard,
  SLSAProvenanceCard,
  RiskMatrixCard,
  RiskRegisterCard,
  RiskAppetiteCard,
  ComplianceFrameworksDashboardCard,
  ChangeControlDashboardCard,
  SegregationOfDutiesDashboardCard,
  DataResidencyDashboardCard,
  ComplianceReportsDashboardCard,
  HIPAADashboardCard,
  GxPDashboardCard,
  BAADashboardCard,
  NISTDashboardCard,
  STIGDashboardCard,
  AirGapDashboardCard,
  FedRAMPDashboardCard,
  OIDCDashboardCard,
  RBACAuditDashboardCard,
  SessionDashboardCard,
  ProwJobs,
  ProwStatus,
  ProwHistory,
  LLMInference,
  LLMModels,
  MLJobs,
  MLNotebooks,
  GitHubActivity,
  IssueActivityChart,
  RSSFeed,
  Kubectl,
  SudokuGame,
  MatchGame,
  Solitaire,
  Checkers,
  Game2048,
  Kubedle,
  PodSweeper,
  ContainerTetris,
  FlappyPod,
  KubeMan,
  KubeKong,
  PodPitfall,
  NodeInvaders,
  MissileCommand,
  PodCrosser,
  PodBrothers,
  KubeKart,
  KubePong,
  KubeSnake,
  KubeGalaga,
  KubeBert,
  KubeDoom,
  IframeEmbed,
  NetworkUtils,
  MobileBrowser,
  KubeChess,
  ServiceExports,
  ServiceImports,
  GatewayStatus,
  ServiceTopology,
  WorkloadDeployment,
  ClusterGroups,
  Missions,
  ResourceMarshall,
  WorkloadMonitor,
  DynamicCard,
  ACMMLevel,
  ACMMFeedbackLoops,
  ACMMRecommendations,
  LLMdStackMonitor,
  ProwCIMonitor,
  LLMdFlow,
  KVCacheMonitor,
  EPPRouting,
  PDDisaggregation,
  LLMdAIInsights,
  LLMdConfigurator,
  NightlyE2EStatus,
  BenchmarkHero,
  ParetoFrontier,
  HardwareLeaderboard,
  LatencyBreakdown,
  ThroughputComparison,
  PerformanceTimeline,
  ResourceUtilization,
  GitHubCIMonitor,
  ClusterHealthMonitor,
  RuntimeAttestationCard,
  NightlyReleasePulse,
  WorkflowMatrix,
  PipelineFlow,
  RecentFailures,
  ProviderHealth,
  KagentiStatusCard,
  KagentiAgentDiscovery,
  KagentiAgentFleet,
  KagentiToolRegistry,
  KagentiTopology,
  KagentiBuildPipeline,
  KagentiSecurity,
  KagentiSecurityPosture,
  KagentStatusCard,
  KagentAgentDiscovery,
  KagentAgentFleet,
  KagentModelProviders,
  KagentToolRegistry,
  KagentTopology,
  KagentSecurity,
  FluentdStatus,
  LimaStatus,
  ContainerdStatus,
  CrioStatus,
  FlatcarStatus,
  CoreDNSStatus,
  ISO27001Audit,
  CloudCustodianStatus,
  CortexStatus,
  NatsStatus,
  DragonflyStatus,
  CrossplaneManagedResources,
  BuildpacksStatus,
  KedaStatus,
  ArtifactHubStatus,
  CloudEventsStatus,
  StrimziStatus,
  KubeVelaStatus,
  KarmadaStatus,
  OpenYurtStatus,
  KnativeStatus,
  KServeStatus,
  FluidStatus,
  CubefsStatus,
  HarborStatus,
  DeploymentRiskScore,
  KubeRayFleet,
  SLOCompliance,
  FailoverTimeline,
  TrinoGateway,
  OpenFeatureStatus,
  OpenKruiseStatus,
  KeycloakStatus,
  NetworkTraceCard,
  DNSTraceCard,
  ProcessTraceCard,
  SecurityAuditCard,
  JaegerStatus,
  DrasiReactiveGraph,
  OvnStatus,
  KubeflexStatus,
  K3sStatus,
  KubevirtStatus,
  VClusterStatus,
  MultiTenancyOverview,
  TenantIsolationSetup,
  TenantTopology,
  CrossClusterEventCorrelation,
  ClusterDeltaDetector,
  CascadeImpactMap,
  ConfigDriftHeatmap,
  ResourceImbalanceDetector,
  RestartCorrelationMatrix,
  DeploymentRolloutTracker,
  RightSizeAdvisor,
  PredictiveHealth,
  NodeDebug,
  ControlPlaneHealth,
  NodeConditions,
  AdmissionWebhooks,
  EtcdStatus,
  NetworkPolicyCoverage,
  RBACExplorer,
  MaintenanceWindows,
  ClusterChangelog,
  QuotaHeatmap,
}
