import React from 'react'
import { ClusterHealth } from './ClusterHealth'
import { EventStream } from './EventStream'
import { PodIssues } from './PodIssues'
import { TopPods } from './TopPods'
import { AppStatus } from './AppStatus'
import { ResourceUsage } from './ResourceUsage'
import { ClusterMetrics } from './ClusterMetrics'
import { DeploymentStatus } from './DeploymentStatus'
import { DeploymentProgress } from './DeploymentProgress'
import { DeploymentIssues } from './DeploymentIssues'
import { GitOpsDrift } from './GitOpsDrift'
import { UpgradeStatus } from './UpgradeStatus'
import { ResourceCapacity } from './ResourceCapacity'
import { GPUInventory } from './GPUInventory'
import { GPUStatus } from './GPUStatus'
import { GPUOverview } from './GPUOverview'
import { GPUWorkloads } from './GPUWorkloads'
import { SecurityIssues } from './SecurityIssues'
// Live data trend cards
import { EventsTimeline } from './EventsTimeline'
import { PodHealthTrend } from './PodHealthTrend'
import { ResourceTrend } from './ResourceTrend'
import { GPUUtilization } from './GPUUtilization'
import { GPUUsageTrend } from './GPUUsageTrend'
import { ClusterResourceTree } from './ClusterResourceTree'
// Dashboard-specific cards
import { StorageOverview } from './StorageOverview'
import { PVCStatus } from './PVCStatus'
import { NetworkOverview } from './NetworkOverview'
import { ServiceStatus } from './ServiceStatus'
import { ComputeOverview } from './ComputeOverview'
// Cluster-scoped cards
import { ClusterFocus } from './ClusterFocus'
import { ClusterComparison } from './ClusterComparison'
import { ClusterCosts } from './ClusterCosts'
import { ClusterNetwork } from './ClusterNetwork'
import { ClusterLocations } from './ClusterLocations'
// Namespace-scoped cards
import { NamespaceOverview } from './NamespaceOverview'
import { NamespaceQuotas } from './NamespaceQuotas'
import { NamespaceRBAC } from './NamespaceRBAC'
import { NamespaceEvents } from './NamespaceEvents'
// Operator-scoped cards
import { OperatorStatus } from './OperatorStatus'
import { OperatorSubscriptions } from './OperatorSubscriptions'
import { CRDHealth } from './CRDHealth'
// Helm-scoped cards
import { HelmReleaseStatus } from './HelmReleaseStatus'
import { HelmValuesDiff } from './HelmValuesDiff'
import { HelmHistory } from './HelmHistory'
import { ChartVersions } from './ChartVersions'
// Kustomize-scoped cards
import { KustomizationStatus } from './KustomizationStatus'
import { OverlayComparison } from './OverlayComparison'
// ArgoCD cards
import { ArgoCDApplications } from './ArgoCDApplications'
import { ArgoCDSyncStatus } from './ArgoCDSyncStatus'
import { ArgoCDHealth } from './ArgoCDHealth'
// User management card
import { UserManagement } from './UserManagement'
// Klaude AI mission cards
import { KlaudeIssuesCard, KlaudeKubeconfigAuditCard, KlaudeHealthCheckCard } from './KlaudeMissions'
// Alerting cards
import { ActiveAlerts } from './ActiveAlerts'
import { AlertRulesCard } from './AlertRules'
// Cost management integrations
import { OpenCostOverview } from './OpenCostOverview'
import { KubecostOverview } from './KubecostOverview'
// Policy management cards
import { OPAPolicies } from './OPAPolicies'
import { KyvernoPolicies } from './KyvernoPolicies'
// Compliance tool cards
import { FalcoAlerts, TrivyScan, KubescapeScan, PolicyViolations, ComplianceScore } from './ComplianceCards'
// Data compliance tool cards
import { VaultSecrets, ExternalSecrets, CertManager } from './DataComplianceCards'
// Weather card
import { Weather } from './Weather'
// GitHub Activity Monitoring card
import { GitHubActivity } from './GitHubActivity'
// Kubectl card
import { Kubectl } from './Kubectl'
// Sudoku game card
import { SudokuGame } from './SudokuGame'
// Kube Match card
import { MatchGame } from './MatchGame'
// Kube Solitaire card
import { Solitaire } from './Solitaire'
// AI Checkers card
import { Checkers } from './Checkers'
// Kube 2048 card
import { Game2048 } from './Game2048'
// Stock Market Ticker card
import { StockMarketTicker } from './StockMarketTicker'
// Kubedle card
import { Kubedle } from './Kubedle'
// Pod Sweeper card
import { PodSweeper } from './PodSweeper'
// Container Tetris card
import { ContainerTetris } from './ContainerTetris'
// Flappy Pod card
import { FlappyPod } from './FlappyPod'
// Kube-Man (Pac-Man) card
import { KubeMan } from './KubeMan'
// Kube Kong (Donkey Kong) card
import { KubeKong } from './KubeKong'
// Pod Pitfall card
import { PodPitfall } from './PodPitfall'
// Node Invaders (Space Invaders) card
import { NodeInvaders } from './NodeInvaders'

// Type for card component props
export type CardComponentProps = { config?: Record<string, unknown> }

// Card component type
export type CardComponent = React.ComponentType<CardComponentProps>

/**
 * Central registry of all card components.
 * Add new cards here and they will automatically be available in all dashboards.
 */
export const CARD_COMPONENTS: Record<string, CardComponent> = {
  // Core cards
  cluster_health: ClusterHealth,
  event_stream: EventStream,
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
  // Klaude AI mission cards
  klaude_issues: KlaudeIssuesCard,
  klaude_kubeconfig_audit: KlaudeKubeconfigAuditCard,
  klaude_health_check: KlaudeHealthCheckCard,
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
  // Weather card
  weather: Weather,
  // GitHub Activity Monitoring card
  github_activity: GitHubActivity,
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
}

/**
 * Cards that use demo/mock data instead of real data.
 * Used to show a demo banner when these cards are present.
 */
export const DEMO_DATA_CARDS = new Set([
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
  'vault_secrets',
  'external_secrets',
  'cert_manager',
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
  klaude_issues: 6,
  klaude_kubeconfig_audit: 6,
  klaude_health_check: 6,
  user_management: 6,
  // Weather card
  weather: 6,
  // GitHub Activity Monitoring card
  github_activity: 8,
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
 * Returns undefined if the card type is not registered.
 */
export function getCardComponent(cardType: string): CardComponent | undefined {
  return CARD_COMPONENTS[cardType]
}

/**
 * Check if a card type is registered.
 */
export function isCardTypeRegistered(cardType: string): boolean {
  return cardType in CARD_COMPONENTS
}

/**
 * Get all registered card types.
 */
export function getRegisteredCardTypes(): string[] {
  return Object.keys(CARD_COMPONENTS)
}
