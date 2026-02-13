import { ReactNode, useState, useEffect, useCallback, useRef, useMemo, createContext, useContext, ComponentType } from 'react'
import { createPortal } from 'react-dom'
import {
  Maximize2, MoreVertical, Clock, Settings, Replace, Trash2, MessageCircle, RefreshCw, MoveHorizontal, ChevronRight, ChevronDown, Info, Download, Link2,
  // Card icons
  AlertTriangle, Box, Activity, Database, Server, Cpu, Network, Shield, Package, GitBranch, FileCode, Gauge, AlertCircle, Layers, HardDrive, Globe, Users, Terminal, TrendingUp, Gamepad2, Puzzle, Target, Zap, Crown, Ghost, Bird, Rocket, Wand2, Stethoscope, MonitorCheck, Workflow, Split, Router, BookOpen, Cloudy, Rss, Frame, Wrench, Phone,
} from 'lucide-react'
import { BaseModal } from '../../lib/modals'
import { cn } from '../../lib/cn'
import { useCardCollapse } from '../../lib/cards'
import { useSnoozedCards } from '../../hooks/useSnoozedCards'
import { useDemoMode } from '../../hooks/useDemoMode'
import { isDemoMode as checkIsDemoMode } from '../../lib/demoMode'
// useLocalAgent removed — cards render immediately regardless of agent state
// isInClusterMode removed — cards render immediately without offline skeleton
import { useIsModeSwitching } from '../../lib/unified/demo'
import { DEMO_EXEMPT_CARDS } from './cardRegistry'
import { CardDataReportContext, type CardDataState } from './CardDataContext'
import { ChatMessage } from './CardChat'
import { CardSkeleton, type CardSkeletonProps } from '../../lib/cards/CardComponents'
import { isCardExportable } from '../../lib/widgets/widgetRegistry'
import { WidgetExportModal } from '../widgets/WidgetExportModal'

// Minimum duration to show spin animation (ensures at least one full rotation)
const MIN_SPIN_DURATION = 500

// Format relative time (e.g., "2m ago", "1h ago")
function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

interface PendingSwap {
  newType: string
  newTitle?: string
  reason: string
  swapAt: Date
}

// Card width options (in grid columns out of 12)
const WIDTH_OPTIONS = [
  { value: 3, label: 'Small', description: '1/4 width' },
  { value: 4, label: 'Medium', description: '1/3 width' },
  { value: 6, label: 'Large', description: '1/2 width' },
  { value: 8, label: 'Wide', description: '2/3 width' },
  { value: 12, label: 'Full', description: 'Full width' },
]

// Cards that need extra-large expanded modal (for maps, complex visualizations, etc.)
// These use 95vh height and 7xl width instead of the default 80vh/4xl
const LARGE_EXPANDED_CARDS = new Set([
  'cluster_comparison',
  'cluster_resource_tree',
  // AI-ML cards that need more space when expanded
  'kvcache_monitor',
  'pd_disaggregation',
  'llmd_benchmarks',
  'llmd_ai_insights',
])

// Cards that should be nearly fullscreen when expanded (maps, large visualizations, games)
const FULLSCREEN_EXPANDED_CARDS = new Set([
  'cluster_locations',
  'mobile_browser', // Shows iPad view when expanded
  // AI-ML visualization cards benefit from full viewport
  'llmd_flow', 'epp_routing',
  // All arcade games need fullscreen to fill the entire screen
  'sudoku_game', 'container_tetris', 'node_invaders', 'kube_snake',
  'flappy_pod', 'kube_pong', 'kube_kong', 'game_2048', 'kube_man',
  'kube_galaga', 'kube_chess', 'checkers', 'pod_crosser', 'pod_brothers',
  'pod_pitfall', 'match_game', 'solitaire', 'kubedle', 'pod_sweeper',
  'kube_craft', 'kube_doom', 'kube_kart',
])

// Context to expose card expanded state to children
interface CardExpandedContextType {
  isExpanded: boolean
}
const CardExpandedContext = createContext<CardExpandedContextType>({ isExpanded: false })

/** Hook for child components to know if their parent card is expanded */
export function useCardExpanded() {
  return useContext(CardExpandedContext)
}

// Note: Lazy mounting and eager mount scheduling have been removed.
// Cards now render immediately to show cached data without delay.
// This trades some initial render performance for better UX with cached data.

/**
 * Hook for lazy mounting - only renders content when visible in viewport.
 *
 * IMPORTANT: Cards start visible (isVisible=true) to show cached data immediately.
 * IntersectionObserver is only used for off-screen cards that scroll into view later.
 * This prevents the "empty cards on page load" issue when cached data is available.
 */
function useLazyMount(_rootMargin = '100px') {
  // Start visible - show cached content immediately on page load.
  // This is intentional: we prioritize showing cached data over lazy loading performance.
  const [isVisible] = useState(true)
  const ref = useRef<HTMLDivElement>(null)

  // No lazy mounting - all cards render immediately.
  // The eager mount and IntersectionObserver logic has been removed because:
  // 1. It caused "empty cards" flash on page load even with cached data
  // 2. With only 4-8 cards visible at once, the performance impact is minimal
  // 3. Cached data should be shown instantly for good UX

  return { ref, isVisible }
}

/** Flash type for significant data changes */
export type CardFlashType = 'none' | 'info' | 'warning' | 'error'

interface CardWrapperProps {
  cardId?: string
  cardType: string
  title?: string
  /** Icon to display next to the card title */
  icon?: ComponentType<{ className?: string }>
  /** Icon color class (e.g., 'text-purple-400') - defaults to title color */
  iconColor?: string
  lastSummary?: string
  pendingSwap?: PendingSwap
  chatMessages?: ChatMessage[]
  dragHandle?: ReactNode
  /** Whether the card is currently refreshing data */
  isRefreshing?: boolean
  /** Last time the card data was updated */
  lastUpdated?: Date | null
  /** Whether this card uses demo/mock data instead of real data */
  isDemoData?: boolean
  /** Whether this card is showing live/real-time data (for time-series/trend cards) */
  isLive?: boolean
  /** Whether data refresh has failed 3+ times consecutively */
  isFailed?: boolean
  /** Number of consecutive refresh failures */
  consecutiveFailures?: number
  /** Current card width in grid columns (1-12) */
  cardWidth?: number
  /** Whether the card is collapsed (showing only header) */
  isCollapsed?: boolean
  /** Flash animation type when significant data changes occur */
  flashType?: CardFlashType
  /** Callback when collapsed state changes */
  onCollapsedChange?: (collapsed: boolean) => void
  onSwap?: (newType: string) => void
  onSwapCancel?: () => void
  onConfigure?: () => void
  onReplace?: () => void
  onRemove?: () => void
  onRefresh?: () => void
  /** Callback when card width is changed */
  onWidthChange?: (newWidth: number) => void
  onChatMessage?: (message: string) => Promise<ChatMessage>
  onChatMessagesChange?: (messages: ChatMessage[]) => void
  /** Skeleton type to show when loading with no cached data */
  skeletonType?: CardSkeletonProps['type']
  /** Number of skeleton rows to show */
  skeletonRows?: number
  children: ReactNode
}

export const CARD_TITLES: Record<string, string> = {
  // Core cluster cards
  cluster_health: 'Cluster Health',
  cluster_focus: 'Cluster Focus',
  cluster_network: 'Cluster Network',
  cluster_comparison: 'Cluster Comparison',
  cluster_costs: 'Cluster Costs',
  cluster_metrics: 'Cluster Metrics',
  cluster_locations: 'Cluster Locations',
  cluster_resource_tree: 'Cluster Resource Tree',

  // Workload and deployment cards
  app_status: 'Workload Status',
  workload_deployment: 'Workloads',
  deployment_missions: 'Deployment Missions',
  deployment_progress: 'Deployment Progress',
  deployment_status: 'Deployment Status',
  deployment_issues: 'Deployment Issues',
  statefulset_status: 'StatefulSet Status',
  daemonset_status: 'DaemonSet Status',
  replicaset_status: 'ReplicaSet Status',
  job_status: 'Job Status',
  cronjob_status: 'CronJob Status',
  hpa_status: 'HPA Status',
  cluster_groups: 'Cluster Groups',
  resource_marshall: 'Resource Marshall',
  workload_monitor: 'Workload Monitor',
  llmd_stack_monitor: 'llm-d Stack Monitor',
  prow_ci_monitor: 'PROW CI Monitor',
  github_ci_monitor: 'GitHub CI Monitor',
  cluster_health_monitor: 'Cluster Health Monitor',

  // Pod and resource cards
  pod_issues: 'Pod Issues',
  top_pods: 'Top Pods',
  resource_capacity: 'Resource Capacity',
  resource_usage: 'Resource Allocation',
  compute_overview: 'Compute Overview',
  node_status: 'Node Status',

  // Events
  event_stream: 'Event Stream',
  event_summary: 'Event Summary',
  warning_events: 'Warning Events',
  recent_events: 'Recent Events',
  events_timeline: 'Events Timeline',

  // Trend cards
  pod_health_trend: 'Pod Health Trend',
  resource_trend: 'Resource Trend',

  // Storage and network
  storage_overview: 'Storage Overview',
  pvc_status: 'PVC Status',
  pv_status: 'PV Status',
  resource_quota_status: 'Resource Quota Status',
  network_overview: 'Network Overview',
  service_status: 'Service Status',
  ingress_status: 'Ingress Status',
  network_policy_status: 'Network Policy Status',

  // Namespace cards
  namespace_overview: 'Namespace Overview',
  namespace_analysis: 'Namespace Analysis',
  namespace_rbac: 'Namespace RBAC',
  namespace_quotas: 'Namespace Quotas',
  namespace_events: 'Namespace Events',
  namespace_monitor: 'Namespace Monitor',

  // Operator cards
  operator_status: 'Operator Status',
  operator_subscriptions: 'Operator Subscriptions',
  operator_subscription_status: 'Operator Subscription Status',
  crd_health: 'CRD Health',
  configmap_status: 'ConfigMap Status',

  // Helm/GitOps cards
  gitops_drift: 'GitOps Drift',
  helm_release_status: 'Helm Release Status',
  helm_releases: 'Helm Releases',
  helm_history: 'Helm History',
  helm_values_diff: 'Helm Values Diff',
  kustomization_status: 'Kustomization Status',
  overlay_comparison: 'Overlay Comparison',
  chart_versions: 'Helm Chart Versions',

  // ArgoCD cards
  argocd_applications: 'ArgoCD Applications',
  argocd_sync_status: 'ArgoCD Sync Status',
  argocd_health: 'ArgoCD Health',

  // GPU and hardware cards
  gpu_overview: 'GPU Overview',
  gpu_status: 'GPU Status',
  gpu_inventory: 'GPU Inventory',
  gpu_workloads: 'GPU Workloads',
  gpu_utilization: 'GPU Utilization',
  gpu_usage_trend: 'GPU Usage Trend',
  gpu_namespace_allocations: 'GPU Namespace Allocations',
  hardware_health: 'Hardware Health',

  // Security, RBAC, and compliance
  security_issues: 'Security Issues',
  rbac_overview: 'RBAC Overview',
  policy_violations: 'Policy Violations',
  opa_policies: 'OPA Policies',
  kyverno_policies: 'Kyverno Policies',
  falco_alerts: 'Falco Alerts',
  trivy_scan: 'Trivy Scan',
  kubescape_scan: 'Kubescape Scan',
  compliance_score: 'Compliance Score',
  vault_secrets: 'Vault Secrets',
  external_secrets: 'External Secrets',
  cert_manager: 'Cert Manager',

  // Alerting cards
  active_alerts: 'Active Alerts',
  alert_rules: 'Alert Rules',

  // Cost management
  opencost_overview: 'OpenCost Overview',
  kubecost_overview: 'Kubecost Overview',

  // MCS (Multi-Cluster Service) cards
  service_exports: 'Service Exports',
  service_imports: 'Service Imports',
  gateway_status: 'Gateway Status',
  service_topology: 'Service Topology',

  // Other
  upgrade_status: 'Cluster Upgrade Status',
  user_management: 'User Management',
  github_activity: 'GitHub Activity',
  kubectl: 'Kubectl Terminal',
  weather: 'Weather',
  rss_feed: 'RSS Feed',
  iframe_embed: 'Iframe Embed',
  network_utils: 'Network Utils',
  mobile_browser: 'Mobile Browser',

  // AI cards
  console_ai_issues: 'AI Issues',
  console_ai_kubeconfig_audit: 'AI Kubeconfig Audit',
  console_ai_health_check: 'AI Health Check',
  console_ai_offline_detection: 'Predictive Health Monitor',

  // Stock Market Ticker
  stock_market_ticker: 'Stock Market Ticker',

  // PROW CI/CD cards
  prow_jobs: 'PROW Jobs',
  prow_status: 'PROW Status',
  prow_history: 'PROW History',

  // ML/AI workload cards
  llm_inference: 'llm-d Inference',
  llm_models: 'llm-d Models',
  llmd_flow: 'llm-d Request Flow',
  llmd_benchmarks: 'llm-d Benchmarks',
  llmd_ai_insights: 'llm-d AI Insights',
  llmd_configurator: 'llm-d Configurator',
  kvcache_monitor: 'KV Cache Monitor',
  epp_routing: 'EPP Routing',
  pd_disaggregation: 'P/D Disaggregation',
  ml_jobs: 'ML Jobs',
  ml_notebooks: 'ML Notebooks',

  // Games
  sudoku_game: 'Sudoku Game',
  match_game: 'Kube Match',
  solitaire: 'Kube Solitaire',
  checkers: 'AI Checkers',
  game_2048: 'Kube 2048',
  kubedle: 'Kubedle',
  pod_sweeper: 'Pod Sweeper',
  container_tetris: 'Container Tetris',
  flappy_pod: 'Flappy Pod',
  kube_man: 'Kube-Man',
  kube_kong: 'Kube Kong',
  pod_pitfall: 'Pod Pitfall',
  node_invaders: 'Node Invaders',
  pod_crosser: 'Pod Crosser',
  pod_brothers: 'Pod Brothers',
  kube_kart: 'Kube Kart',
  kube_pong: 'Kube Pong',
  kube_snake: 'Kube Snake',
  kube_galaga: 'Kube Galaga',
  kube_doom: 'Kube Doom',
  kube_craft: 'Kube Craft',
  kube_chess: 'Kube Chess',

  // Provider health
  provider_health: 'Provider Health',
}

// Short descriptions shown via info icon tooltip in the card header
export const CARD_DESCRIPTIONS: Record<string, string> = {
  cluster_health: 'Overall health status of all connected Kubernetes clusters.',
  cluster_focus: 'Deep-dive view of a single cluster with key metrics and resources.',
  cluster_network: 'Network connectivity and traffic flow between clusters.',
  cluster_comparison: 'Side-by-side comparison of clusters by resource usage and health.',
  cluster_costs: 'Estimated infrastructure costs broken down by cluster.',
  cluster_metrics: 'Real-time CPU, memory, and pod metrics across clusters.',
  cluster_locations: 'Geographic map of cluster locations worldwide.',
  cluster_resource_tree: 'Hierarchical tree view of all resources in a cluster.',
  app_status: 'Status of workloads across clusters with health indicators.',
  workload_deployment: 'Deploy workloads to clusters using drag-and-drop.',
  deployment_missions: 'Track multi-cluster deployment missions and their progress.',
  deployment_progress: 'Real-time deployment rollout progress and status.',
  deployment_status: 'Detailed status of deployments including replicas and conditions.',
  deployment_issues: 'Active deployment problems such as failed rollouts or image pull errors.',
  statefulset_status: 'Status of StatefulSets including replicas and volume claims.',
  daemonset_status: 'Status of DaemonSets including node coverage and update progress.',
  replicaset_status: 'Status of ReplicaSets including replica counts and conditions.',
  job_status: 'Status of Jobs including completion, duration, and failures.',
  cronjob_status: 'Status of CronJobs including schedules and recent runs.',
  hpa_status: 'Status of Horizontal Pod Autoscalers and scaling metrics.',
  cluster_groups: 'Organize clusters into logical groups for targeted deployments.',
  resource_marshall: 'Explore resource dependency trees and ownership chains.',
  workload_monitor: 'Monitor all resources for a workload with health status, alerts, and AI diagnose/repair.',
  llmd_stack_monitor: 'Monitor the llm-d inference stack: model serving, EPP, gateways, and autoscalers.',
  prow_ci_monitor: 'Monitor PROW CI jobs with success rates, failure analysis, and AI repair.',
  github_ci_monitor: 'Monitor GitHub Actions workflows across repos with pass rates and alerts.',
  cluster_health_monitor: 'Monitor cluster health across all connected clusters with pod and deployment issues.',
  pod_issues: 'Pods with errors, restarts, or scheduling problems.',
  top_pods: 'Top resource-consuming pods ranked by CPU or memory usage.',
  resource_capacity: 'Cluster resource capacity vs. current allocation.',
  resource_usage: 'CPU and memory allocation breakdown across clusters.',
  node_status: 'Status of Kubernetes nodes including conditions and capacity.',
  compute_overview: 'Summary of compute resources: nodes, CPUs, and memory.',
  event_stream: 'Live stream of Kubernetes events from all clusters.',
  event_summary: 'Aggregated event counts grouped by type and reason.',
  warning_events: 'Warning-level events that may need attention.',
  recent_events: 'Most recent events across all clusters.',
  events_timeline: 'Timeline chart of event frequency over time.',
  pod_health_trend: 'Historical trend of pod health status over time.',
  resource_trend: 'Resource usage trends showing CPU and memory over time.',
  storage_overview: 'Persistent volume and storage class overview.',
  pvc_status: 'Status of Persistent Volume Claims across clusters.',
  pv_status: 'Status of Persistent Volumes including capacity and binding.',
  resource_quota_status: 'Resource quota utilization and limits across namespaces.',
  network_overview: 'Network policies, services, and ingress summary.',
  service_status: 'Status of Kubernetes services and their endpoints.',
  ingress_status: 'Status of Ingress resources including hosts and backends.',
  network_policy_status: 'Status of Network Policies and affected pods.',
  namespace_overview: 'Summary of resources within a namespace.',
  namespace_analysis: 'Detailed analysis of namespace health and resource usage.',
  namespace_rbac: 'RBAC roles and bindings within a namespace.',
  namespace_quotas: 'Resource quota utilization within a namespace.',
  namespace_events: 'Events filtered to a specific namespace.',
  namespace_monitor: 'Real-time monitoring of namespace resource trends.',
  operator_status: 'Status of installed Kubernetes operators.',
  operator_subscriptions: 'Operator subscriptions and update channels.',
  operator_subscription_status: 'Detailed status of Operator Lifecycle Manager subscriptions.',
  crd_health: 'Health and status of Custom Resource Definitions.',
  configmap_status: 'Status of ConfigMaps including size and update times.',
  gitops_drift: 'Drift detection between Git source and live cluster state.',
  helm_release_status: 'Status of Helm releases across clusters.',
  helm_releases: 'List of all deployed Helm releases.',
  helm_history: 'Revision history and rollback options for Helm releases.',
  helm_values_diff: 'Diff of Helm values between revisions.',
  kustomization_status: 'Status of Kustomize overlays and their resources.',
  overlay_comparison: 'Compare Kustomize overlays across environments.',
  chart_versions: 'Available Helm chart versions and update status.',
  argocd_applications: 'ArgoCD application inventory and sync status.',
  argocd_sync_status: 'Sync status of ArgoCD-managed applications.',
  argocd_health: 'Health of ArgoCD applications and components.',
  gpu_overview: 'Summary of GPU resources across all clusters.',
  gpu_status: 'Current GPU utilization and health status.',
  gpu_inventory: 'Inventory of GPU nodes with model, memory, and driver info.',
  gpu_workloads: 'Workloads running on GPU-enabled nodes.',
  gpu_utilization: 'Real-time GPU utilization percentage and temperature.',
  gpu_usage_trend: 'Historical GPU usage trends over time.',
  hardware_health: 'Detects hardware device disappearances (GPUs, NICs, NVMe, InfiniBand) that often require a power cycle to recover. Common with SuperMicro/HGX systems. Also shows full device inventory per node.',
  security_issues: 'Security vulnerabilities and misconfigurations detected.',
  rbac_overview: 'Overview of RBAC roles, bindings, and permissions.',
  policy_violations: 'Active policy violations from OPA, Kyverno, or other engines.',
  opa_policies: 'OPA Gatekeeper policies and constraint status.',
  kyverno_policies: 'Kyverno policies and their enforcement status.',
  falco_alerts: 'Runtime security alerts from Falco.',
  trivy_scan: 'Container image vulnerability scan results from Trivy.',
  kubescape_scan: 'Security posture scan results from Kubescape.',
  compliance_score: 'Overall compliance score across security frameworks.',
  vault_secrets: 'HashiCorp Vault secrets management status.',
  external_secrets: 'External Secrets Operator sync status.',
  cert_manager: 'TLS certificate status and renewal from cert-manager.',
  active_alerts: 'Currently firing alerts from Prometheus or other sources.',
  alert_rules: 'Configured alert rules and their evaluation status.',
  opencost_overview: 'Cost allocation data from OpenCost.',
  kubecost_overview: 'Cost breakdown and optimization from Kubecost.',
  service_exports: 'Services exported for multi-cluster discovery.',
  service_imports: 'Services imported from other clusters.',
  gateway_status: 'Gateway API resource status and routing.',
  service_topology: 'Visual topology of service-to-service communication.',
  upgrade_status: 'Kubernetes version upgrade status and available upgrades.',
  user_management: 'Manage console users and their roles.',
  github_activity: 'Recent GitHub activity: commits, PRs, and issues.',
  kubectl: 'Interactive kubectl terminal for running commands.',
  weather: 'Current weather conditions for cluster locations.',
  rss_feed: 'RSS feed reader for Kubernetes news and blogs.',
  iframe_embed: 'Embed an external web page inside a card.',
  network_utils: 'Network diagnostic utilities: ping, DNS, traceroute.',
  mobile_browser: 'Embedded mobile-sized browser for testing.',
  console_ai_issues: 'AI-detected issues and recommended fixes.',
  console_ai_kubeconfig_audit: 'AI audit of kubeconfig files for security and cleanup.',
  console_ai_health_check: 'AI-powered cluster health analysis.',
  console_ai_offline_detection: 'Monitors cluster health and predicts failures before they happen. Detects offline nodes, GPU exhaustion, resource pressure, and groups issues by root cause for efficient remediation.',
  stock_market_ticker: 'Live stock market ticker with tech company prices.',
  prow_jobs: 'PROW CI/CD job status and results.',
  prow_status: 'Overall PROW system health and queue depth.',
  prow_history: 'Historical PROW job runs and success rates.',
  llm_inference: 'llm-d inference endpoint status and request metrics.',
  llm_models: 'LLM models deployed via llm-d with version info.',
  llmd_flow: 'Animated visualization of inference request flow through the llm-d stack: load balancer → EPP → prefill/decode pods.',
  llmd_benchmarks: 'Performance benchmarks for llm-d inference: throughput, latency percentiles, and comparison across models.',
  llmd_ai_insights: 'AI-generated insights about llm-d performance, bottlenecks, and optimization recommendations.',
  llmd_configurator: 'Configure llm-d deployment parameters: replicas, autoscaling, model variants, and resource limits.',
  kvcache_monitor: 'Real-time KV cache utilization across inference pods with hit rates and memory usage.',
  epp_routing: 'Endpoint Picker Pod routing decisions: how requests are distributed based on KV cache affinity.',
  pd_disaggregation: 'Prefill/Decode disaggregation architecture: separate pools for prompt processing and token generation.',
  ml_jobs: 'Machine learning training and batch job status.',
  ml_notebooks: 'Jupyter notebook server status and resource usage.',
  provider_health: 'Health and status of AI and cloud infrastructure providers.',

  // Games
  sudoku_game: 'Classic Sudoku puzzle game with multiple difficulty levels.',
  match_game: 'Memory matching game with Kubernetes resource icons.',
  solitaire: 'Classic Klondike solitaire card game.',
  checkers: 'Play checkers against an AI opponent.',
  game_2048: 'Slide and merge tiles to reach 2048.',
  kubedle: 'Wordle-style game with Kubernetes terminology.',
  pod_sweeper: 'Minesweeper clone with a Kubernetes pod theme.',
  container_tetris: 'Classic Tetris with container-shaped blocks.',
  flappy_pod: 'Navigate a pod through cluster obstacles.',
  kube_man: 'Pac-Man style game collecting resources in a cluster maze.',
  kube_kong: 'Donkey Kong inspired platformer with Kubernetes theme.',
  pod_pitfall: 'Pitfall-style adventure game as a pod.',
  node_invaders: 'Space Invaders clone defending your cluster.',
  pod_crosser: 'Frogger-style game crossing cluster traffic.',
  pod_brothers: 'Super Mario Bros inspired platformer.',
  kube_kart: 'Racing game through Kubernetes infrastructure.',
  kube_pong: 'Classic Pong game with cluster theming.',
  kube_snake: 'Snake game collecting Kubernetes resources.',
  kube_galaga: 'Galaga-style shooter defending against threats.',
  kube_doom: 'First-person debugging adventure.',
  kube_craft: 'Build and manage your cluster world.',
  kube_chess: 'Chess game with Kubernetes-themed pieces.',
}

// Card icons with their colors - displayed in the card header next to the title
const CARD_ICONS: Record<string, { icon: ComponentType<{ className?: string }>, color: string }> = {
  // Core cluster cards
  cluster_health: { icon: Activity, color: 'text-green-400' },
  cluster_focus: { icon: Server, color: 'text-purple-400' },
  cluster_network: { icon: Network, color: 'text-cyan-400' },
  cluster_comparison: { icon: Layers, color: 'text-blue-400' },
  cluster_costs: { icon: TrendingUp, color: 'text-emerald-400' },
  cluster_metrics: { icon: Activity, color: 'text-purple-400' },
  cluster_locations: { icon: Globe, color: 'text-blue-400' },
  cluster_resource_tree: { icon: GitBranch, color: 'text-purple-400' },
  cluster_groups: { icon: Layers, color: 'text-blue-400' },

  // Workload and deployment cards
  app_status: { icon: Box, color: 'text-purple-400' },
  deployment_missions: { icon: Rocket, color: 'text-blue-400' },
  deployment_progress: { icon: Clock, color: 'text-blue-400' },
  deployment_status: { icon: Box, color: 'text-purple-400' },
  deployment_issues: { icon: AlertTriangle, color: 'text-orange-400' },
  statefulset_status: { icon: Database, color: 'text-purple-400' },
  daemonset_status: { icon: Server, color: 'text-blue-400' },
  replicaset_status: { icon: Box, color: 'text-cyan-400' },
  job_status: { icon: Clock, color: 'text-green-400' },
  cronjob_status: { icon: Clock, color: 'text-orange-400' },
  hpa_status: { icon: TrendingUp, color: 'text-purple-400' },
  resource_marshall: { icon: GitBranch, color: 'text-blue-400' },

  // Pod and resource cards
  pod_issues: { icon: AlertTriangle, color: 'text-orange-400' },
  top_pods: { icon: Box, color: 'text-purple-400' },
  resource_capacity: { icon: Gauge, color: 'text-blue-400' },
  resource_usage: { icon: Gauge, color: 'text-purple-400' },
  pod_health_trend: { icon: Box, color: 'text-purple-400' },
  resource_trend: { icon: TrendingUp, color: 'text-blue-400' },
  node_status: { icon: Server, color: 'text-purple-400' },

  // Events
  event_stream: { icon: Activity, color: 'text-blue-400' },
  events_timeline: { icon: Clock, color: 'text-purple-400' },
  event_summary: { icon: Activity, color: 'text-purple-400' },
  warning_events: { icon: AlertTriangle, color: 'text-orange-400' },
  recent_events: { icon: Clock, color: 'text-blue-400' },

  // Namespace cards
  namespace_overview: { icon: Layers, color: 'text-purple-400' },
  namespace_analysis: { icon: Layers, color: 'text-purple-400' },
  namespace_rbac: { icon: Shield, color: 'text-yellow-400' },
  namespace_quotas: { icon: Gauge, color: 'text-yellow-400' },
  namespace_events: { icon: Activity, color: 'text-blue-400' },
  namespace_monitor: { icon: Activity, color: 'text-purple-400' },

  // Operator cards
  operator_status: { icon: Package, color: 'text-purple-400' },
  operator_subscriptions: { icon: Package, color: 'text-purple-400' },
  operator_subscription_status: { icon: Package, color: 'text-blue-400' },
  crd_health: { icon: Database, color: 'text-teal-400' },
  configmap_status: { icon: FileCode, color: 'text-blue-400' },

  // Helm/GitOps cards
  gitops_drift: { icon: GitBranch, color: 'text-purple-400' },
  helm_release_status: { icon: Package, color: 'text-blue-400' },
  helm_releases: { icon: Package, color: 'text-blue-400' },
  helm_history: { icon: Clock, color: 'text-purple-400' },
  helm_values_diff: { icon: FileCode, color: 'text-yellow-400' },
  kustomization_status: { icon: Layers, color: 'text-purple-400' },
  overlay_comparison: { icon: Layers, color: 'text-blue-400' },
  chart_versions: { icon: Package, color: 'text-emerald-400' },

  // ArgoCD cards
  argocd_applications: { icon: GitBranch, color: 'text-orange-400' },
  argocd_sync_status: { icon: GitBranch, color: 'text-orange-400' },
  argocd_health: { icon: Activity, color: 'text-orange-400' },

  // GPU cards
  gpu_overview: { icon: Cpu, color: 'text-green-400' },
  gpu_status: { icon: Cpu, color: 'text-green-400' },
  gpu_inventory: { icon: Cpu, color: 'text-green-400' },
  gpu_workloads: { icon: Cpu, color: 'text-green-400' },
  gpu_usage_trend: { icon: Cpu, color: 'text-green-400' },
  gpu_utilization: { icon: Cpu, color: 'text-green-400' },

  // Security and RBAC
  security_issues: { icon: Shield, color: 'text-red-400' },
  rbac_overview: { icon: Shield, color: 'text-yellow-400' },
  policy_violations: { icon: AlertTriangle, color: 'text-red-400' },
  opa_policies: { icon: Shield, color: 'text-purple-400' },
  kyverno_policies: { icon: Shield, color: 'text-blue-400' },
  alert_rules: { icon: AlertCircle, color: 'text-orange-400' },
  active_alerts: { icon: AlertTriangle, color: 'text-red-400' },

  // Storage
  pvc_status: { icon: HardDrive, color: 'text-blue-400' },
  pv_status: { icon: HardDrive, color: 'text-purple-400' },
  storage_overview: { icon: Database, color: 'text-purple-400' },
  resource_quota_status: { icon: Gauge, color: 'text-orange-400' },

  // Network
  network_overview: { icon: Network, color: 'text-cyan-400' },
  service_status: { icon: Server, color: 'text-purple-400' },
  service_topology: { icon: Network, color: 'text-blue-400' },
  service_exports: { icon: Server, color: 'text-green-400' },
  service_imports: { icon: Server, color: 'text-blue-400' },
  gateway_status: { icon: Network, color: 'text-purple-400' },
  ingress_status: { icon: Network, color: 'text-blue-400' },
  network_policy_status: { icon: Shield, color: 'text-cyan-400' },

  // Compute
  compute_overview: { icon: Cpu, color: 'text-purple-400' },

  // Other
  upgrade_status: { icon: TrendingUp, color: 'text-blue-400' },
  user_management: { icon: Users, color: 'text-purple-400' },
  github_activity: { icon: Activity, color: 'text-purple-400' },
  kubectl: { icon: Terminal, color: 'text-green-400' },
  weather: { icon: Cloudy, color: 'text-blue-400' },
  stock_market_ticker: { icon: TrendingUp, color: 'text-green-400' },
  rss_feed: { icon: Rss, color: 'text-orange-400' },
  iframe_embed: { icon: Frame, color: 'text-blue-400' },
  network_utils: { icon: Wrench, color: 'text-cyan-400' },
  mobile_browser: { icon: Phone, color: 'text-purple-400' },
  hardware_health: { icon: MonitorCheck, color: 'text-green-400' },

  // AI cards
  console_ai_issues: { icon: Wand2, color: 'text-purple-400' },
  console_ai_kubeconfig_audit: { icon: Wand2, color: 'text-purple-400' },
  console_ai_health_check: { icon: Wand2, color: 'text-purple-400' },
  console_ai_offline_detection: { icon: Stethoscope, color: 'text-emerald-400' },

  // Cost cards
  opencost_overview: { icon: TrendingUp, color: 'text-emerald-400' },
  kubecost_overview: { icon: TrendingUp, color: 'text-emerald-400' },

  // Compliance and security tools
  falco_alerts: { icon: AlertTriangle, color: 'text-red-400' },
  trivy_scan: { icon: Shield, color: 'text-blue-400' },
  kubescape_scan: { icon: Shield, color: 'text-purple-400' },
  compliance_score: { icon: Shield, color: 'text-green-400' },

  // Data compliance
  vault_secrets: { icon: Shield, color: 'text-yellow-400' },
  external_secrets: { icon: Shield, color: 'text-blue-400' },
  cert_manager: { icon: Shield, color: 'text-green-400' },

  // Prow CI cards
  prow_jobs: { icon: Activity, color: 'text-blue-400' },
  prow_status: { icon: Activity, color: 'text-green-400' },
  prow_history: { icon: Clock, color: 'text-purple-400' },

  // ML/AI workload cards
  llm_inference: { icon: Cpu, color: 'text-purple-400' },
  llm_models: { icon: Database, color: 'text-blue-400' },
  llmd_flow: { icon: Workflow, color: 'text-cyan-400' },
  llmd_benchmarks: { icon: Gauge, color: 'text-orange-400' },
  llmd_ai_insights: { icon: Wand2, color: 'text-purple-400' },
  llmd_configurator: { icon: Settings, color: 'text-blue-400' },
  kvcache_monitor: { icon: Database, color: 'text-cyan-400' },
  epp_routing: { icon: Router, color: 'text-green-400' },
  pd_disaggregation: { icon: Split, color: 'text-purple-400' },
  ml_jobs: { icon: Activity, color: 'text-orange-400' },
  ml_notebooks: { icon: BookOpen, color: 'text-purple-400' },

  // Workload deployment
  workload_deployment: { icon: Box, color: 'text-blue-400' },

  // Workload Monitor cards
  workload_monitor: { icon: Package, color: 'text-purple-400' },
  llmd_stack_monitor: { icon: Cpu, color: 'text-purple-400' },
  prow_ci_monitor: { icon: Activity, color: 'text-blue-400' },
  github_ci_monitor: { icon: GitBranch, color: 'text-purple-400' },
  cluster_health_monitor: { icon: Server, color: 'text-green-400' },

  // Provider health
  provider_health: { icon: Activity, color: 'text-emerald-400' },

  // Games
  sudoku_game: { icon: Puzzle, color: 'text-purple-400' },
  match_game: { icon: Puzzle, color: 'text-purple-400' },
  solitaire: { icon: Gamepad2, color: 'text-red-400' },
  checkers: { icon: Crown, color: 'text-amber-400' },
  game_2048: { icon: Gamepad2, color: 'text-orange-400' },
  kubedle: { icon: Target, color: 'text-green-400' },
  pod_sweeper: { icon: Zap, color: 'text-red-400' },
  container_tetris: { icon: Gamepad2, color: 'text-cyan-400' },
  flappy_pod: { icon: Bird, color: 'text-yellow-400' },
  kube_man: { icon: Ghost, color: 'text-yellow-400' },
  kube_kong: { icon: Gamepad2, color: 'text-red-400' },
  pod_pitfall: { icon: Rocket, color: 'text-green-400' },
  node_invaders: { icon: Rocket, color: 'text-purple-400' },
  pod_brothers: { icon: Gamepad2, color: 'text-red-400' },
  pod_crosser: { icon: Gamepad2, color: 'text-green-400' },
  kube_kart: { icon: Gamepad2, color: 'text-green-400' },
  kube_pong: { icon: Gamepad2, color: 'text-cyan-400' },
  kube_snake: { icon: Gamepad2, color: 'text-green-400' },
  kube_galaga: { icon: Rocket, color: 'text-blue-400' },
  kube_doom: { icon: Gamepad2, color: 'text-red-400' },
  kube_craft: { icon: Puzzle, color: 'text-brown-400' },
  kube_chess: { icon: Crown, color: 'text-amber-400' },
  kube_craft_3d: { icon: Puzzle, color: 'text-green-400' },
}

/**
 * Info tooltip that renders via portal to escape overflow-hidden containers.
 * Updates position on scroll to stay attached to the trigger element.
 */
function InfoTooltip({ text }: { text: string }) {
  const [isVisible, setIsVisible] = useState(false)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  // Update position based on trigger element's current bounding rect
  const updatePosition = useCallback(() => {
    if (!triggerRef.current || !isVisible) return

    const rect = triggerRef.current.getBoundingClientRect()
    const tooltipWidth = 280 // max-w-[280px]
    const tooltipHeight = tooltipRef.current?.offsetHeight || 80 // estimate

    // Position below the icon by default
    let top = rect.bottom + 8
    let left = rect.left - (tooltipWidth / 2) + (rect.width / 2)

    // Ensure tooltip stays within viewport
    if (left < 8) left = 8
    if (left + tooltipWidth > window.innerWidth - 8) {
      left = window.innerWidth - tooltipWidth - 8
    }

    // If tooltip would go below viewport, position above
    if (top + tooltipHeight > window.innerHeight - 8) {
      top = rect.top - tooltipHeight - 8
    }

    setPosition({ top, left })
  }, [isVisible])

  // Update position on scroll and resize
  useEffect(() => {
    if (!isVisible) return

    updatePosition()

    // Update on scroll (any scrollable ancestor)
    const handleScroll = () => updatePosition()
    const handleResize = () => updatePosition()

    window.addEventListener('scroll', handleScroll, true) // capture phase for nested scrolls
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('scroll', handleScroll, true)
      window.removeEventListener('resize', handleResize)
    }
  }, [isVisible, updatePosition])

  // Close tooltip when clicking outside
  useEffect(() => {
    if (!isVisible) return

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!triggerRef.current?.contains(target) && !tooltipRef.current?.contains(target)) {
        setIsVisible(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isVisible])

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => setIsVisible(!isVisible)}
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        className="p-0.5 rounded text-muted-foreground/50 hover:text-muted-foreground transition-colors"
        title="Card information"
      >
        <Info className="w-3.5 h-3.5" />
      </button>
      {isVisible && position && createPortal(
        <div
          ref={tooltipRef}
          className="fixed z-[100] max-w-[280px] px-3 py-2 text-xs rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-300 shadow-xl animate-fade-in"
          style={{ top: position.top, left: position.left }}
          onMouseEnter={() => setIsVisible(true)}
          onMouseLeave={() => setIsVisible(false)}
        >
          {text}
        </div>,
        document.body
      )}
    </>
  )
}

export function CardWrapper({
  cardId,
  cardType,
  title: customTitle,
  icon: Icon,
  iconColor,
  lastSummary,
  pendingSwap,
  chatMessages: externalMessages,
  dragHandle,
  isRefreshing,
  lastUpdated,
  isDemoData,
  isLive,
  isFailed,
  consecutiveFailures,
  cardWidth,
  isCollapsed: externalCollapsed,
  flashType = 'none',
  onCollapsedChange,
  onSwap,
  onSwapCancel,
  onConfigure,
  onReplace,
  onRemove,
  onRefresh,
  onWidthChange,
  onChatMessage,
  onChatMessagesChange,
  skeletonType,
  skeletonRows,
  children,
}: CardWrapperProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  // Lazy mounting - only render children when card is visible in viewport
  const { ref: lazyRef, isVisible } = useLazyMount('200px')
  // Track animation key to re-trigger flash animation
  const [flashKey, setFlashKey] = useState(0)
  const prevFlashType = useRef(flashType)

  // Track visual spinning state separately to ensure minimum spin duration
  const [isVisuallySpinning, setIsVisuallySpinning] = useState(false)
  const spinStartRef = useRef<number | null>(null)

  // Child-reported data state (from card components via CardDataContext)
  // Declared early so it can be used in the refresh animation effect below
  const [childDataState, setChildDataState] = useState<CardDataState | null>(null)

  // Skeleton timeout: show skeleton for up to 5 seconds while waiting for card to report
  // After timeout, assume card doesn't use reporting and show content
  // IMPORTANT: Don't reset on childDataState change - this allows cached data to show immediately
  const [skeletonTimedOut, setSkeletonTimedOut] = useState(checkIsDemoMode)
  useEffect(() => {
    // Only run timeout once on mount - don't reset when childDataState changes
    // Cards with cached data will report hasData: true quickly, hiding skeleton
    const timer = setTimeout(() => setSkeletonTimedOut(true), 5000)
    return () => clearTimeout(timer)
  }, []) // Empty deps - only run on mount

  // Skeleton delay: don't show skeleton immediately, wait a brief moment
  // This prevents flicker when cache loads quickly from IndexedDB
  const [skeletonDelayPassed, setSkeletonDelayPassed] = useState(checkIsDemoMode)
  useEffect(() => {
    const timer = setTimeout(() => setSkeletonDelayPassed(true), 100)
    return () => clearTimeout(timer)
  }, []) // Empty deps - only run on mount

  // Quick initial render timeout for cards that don't report state (static/demo cards)
  // If a card hasn't reported state within 150ms, assume it rendered content immediately
  // This prevents blank cards while still giving reporting cards time to report
  const [initialRenderTimedOut, setInitialRenderTimedOut] = useState(checkIsDemoMode)
  useEffect(() => {
    const timer = setTimeout(() => setInitialRenderTimedOut(true), 150)
    return () => clearTimeout(timer)
  }, []) // Empty deps - only run on mount

  // Handle minimum spin duration for refresh button
  // Include both prop and context-reported refresh state
  const contextIsRefreshing = childDataState?.isRefreshing || false
  useEffect(() => {
    if (isRefreshing || contextIsRefreshing) {
      setIsVisuallySpinning(true)
      spinStartRef.current = Date.now()
    } else if (spinStartRef.current !== null) {
      const elapsed = Date.now() - spinStartRef.current
      const remaining = Math.max(0, MIN_SPIN_DURATION - elapsed)

      if (remaining > 0) {
        const timeout = setTimeout(() => {
          setIsVisuallySpinning(false)
          spinStartRef.current = null
        }, remaining)
        return () => clearTimeout(timeout)
      } else {
        setIsVisuallySpinning(false)
        spinStartRef.current = null
      }
    }
  }, [isRefreshing, contextIsRefreshing])

  // Re-trigger animation when flashType changes to a non-none value
  useEffect(() => {
    if (flashType !== 'none' && flashType !== prevFlashType.current) {
      setFlashKey(k => k + 1)
    }
    prevFlashType.current = flashType
  }, [flashType])

  // Get flash animation class based on type
  const getFlashClass = () => {
    switch (flashType) {
      case 'info': return 'animate-card-flash'
      case 'warning': return 'animate-card-flash-warning'
      case 'error': return 'animate-card-flash-error'
      default: return ''
    }
  }

  // Use the shared collapse hook with localStorage persistence
  // cardId is required for persistence; fall back to cardType if not provided
  const collapseKey = cardId || `${cardType}-default`
  const { isCollapsed: hookCollapsed, setCollapsed: hookSetCollapsed } = useCardCollapse(collapseKey)

  // Track whether initial data load has completed AND content has been visible
  const [hasCompletedInitialLoad, setHasCompletedInitialLoad] = useState(checkIsDemoMode)
  const [collapseDelayPassed, setCollapseDelayPassed] = useState(checkIsDemoMode)

  // Allow external control to override hook state
  // IMPORTANT: Don't collapse until initial data load is complete AND a brief delay has passed
  // This prevents the jarring sequence of: skeleton → collapse → show data
  // Cards stay expanded showing content briefly, then respect collapsed state
  const savedCollapsedState = externalCollapsed ?? hookCollapsed
  const isCollapsed = (hasCompletedInitialLoad && collapseDelayPassed) ? savedCollapsedState : false
  const setCollapsed = useCallback((collapsed: boolean) => {
    if (onCollapsedChange) {
      onCollapsedChange(collapsed)
    }
    // Always update the hook state for persistence
    hookSetCollapsed(collapsed)
  }, [onCollapsedChange, hookSetCollapsed])

  const [showSummary, setShowSummary] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [showWidgetExport, setShowWidgetExport] = useState(false)
  const [showResizeMenu, setShowResizeMenu] = useState(false)
  const [resizeMenuOnLeft, setResizeMenuOnLeft] = useState(false)
  const [_timeRemaining, setTimeRemaining] = useState<number | null>(null)
  // Chat state reserved for future use
  // const [isChatOpen, setIsChatOpen] = useState(false)
  const [localMessages, setLocalMessages] = useState<ChatMessage[]>([])
  const [menuPosition, setMenuPosition] = useState<{ top: number; right: number } | null>(null)
  const { snoozeSwap } = useSnoozedCards()
  const { isDemoMode: globalDemoMode } = useDemoMode()
  const isModeSwitching = useIsModeSwitching()
  const isDemoExempt = DEMO_EXEMPT_CARDS.has(cardType)
  const isDemoMode = globalDemoMode && !isDemoExempt

  // Agent offline detection removed — cards render immediately regardless of agent state
  const menuContainerRef = useRef<HTMLDivElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)

  // Report callback for CardDataContext (childDataState is declared earlier for refresh animation)
  const reportCallback = useCallback((state: CardDataState) => {
    setChildDataState(state)
  }, [])
  const reportCtx = useMemo(() => ({ report: reportCallback }), [reportCallback])

  // Merge child-reported state with props — child reports take priority when present
  const effectiveIsFailed = isFailed || childDataState?.isFailed || false
  const effectiveConsecutiveFailures = consecutiveFailures || childDataState?.consecutiveFailures || 0
  // Show loading when:
  // - Card explicitly reports isLoading: true, OR
  // - Card hasn't reported yet AND quick timeout hasn't passed (brief skeleton for reporting cards)
  // Static/demo cards that never report will stop showing as loading after 150ms
  // NOTE: isRefreshing is NOT included — background refreshes should be invisible to avoid flicker
  const effectiveIsLoading = childDataState?.isLoading || (childDataState === null && !initialRenderTimedOut && !skeletonTimedOut)
  // hasData logic:
  // - If card explicitly reports hasData, use it
  // - If card hasn't reported AND quick timeout passed, assume has data (static/demo card)
  // - If card hasn't reported AND skeleton timed out, assume has data (show content)
  // - If card reports isLoading:true but not hasData, assume no data (show skeleton)
  // - Otherwise default to true (show content)
  const effectiveHasData = childDataState?.hasData ?? (
    childDataState === null
      ? (initialRenderTimedOut || skeletonTimedOut)  // After quick timeout, assume static card has content
      : (childDataState?.isLoading ? false : true)
  )

  // Merge isDemoData from child-reported state with prop
  const effectiveIsDemoData = isDemoData || childDataState?.isDemoData || false

  // Child can explicitly opt-out of demo indicator by reporting isDemoData: false
  // This is used by stack-dependent cards that use stack data even in global demo mode
  const childExplicitlyNotDemo = childDataState?.isDemoData === false

  // Show demo indicator if:
  // 1. Child reports demo data (isDemoData: true via prop or report), OR
  // 2. Global demo mode is on AND child hasn't explicitly opted out
  const showDemoIndicator = effectiveIsDemoData || (isDemoMode && !childExplicitlyNotDemo)

  // Determine if we should show skeleton: loading with no cached data
  // OR when demo mode is OFF and agent is offline (prevents showing stale demo data)
  // OR when mode is switching (smooth transition between demo and live)
  // Force skeleton immediately when offline + demo OFF, without waiting for childDataState
  // This fixes the race condition where demo data briefly shows before skeleton
  // Cards with effectiveIsDemoData=true (explicitly showing demo) or demo-exempt cards are excluded
  const forceSkeletonForOffline = false // Cards render immediately — handle their own empty/offline state
  const forceSkeletonForModeSwitching = isModeSwitching && !isDemoExempt

  // Default to 'list' skeleton type if not specified, enabling automatic skeleton display
  const effectiveSkeletonType = skeletonType || 'list'
  // Cards render immediately — skeleton only used during demo↔live mode switching
  const wantsToShowSkeleton = forceSkeletonForModeSwitching
  const shouldShowSkeleton = (wantsToShowSkeleton && skeletonDelayPassed) || forceSkeletonForModeSwitching

  // Mark initial load as complete when data is ready or various timeouts pass
  // This allows the saved collapsed state to take effect only after content is ready
  // Conditions (any triggers completion):
  // - effectiveHasData: card reported it has data
  // - initialRenderTimedOut: 150ms passed, assume static card has content
  // - skeletonTimedOut: 5s passed, fallback for slow loading cards
  // - effectiveIsDemoData/isDemoMode: demo cards always have content immediately
  useEffect(() => {
    if (!hasCompletedInitialLoad && (effectiveHasData || initialRenderTimedOut || skeletonTimedOut || effectiveIsDemoData || isDemoMode)) {
      setHasCompletedInitialLoad(true)
    }
  }, [hasCompletedInitialLoad, effectiveHasData, initialRenderTimedOut, skeletonTimedOut, effectiveIsDemoData, isDemoMode])

  // Add a small delay before allowing collapse to ensure content is visible
  // This prevents immediate collapse for demo cards and ensures smooth UX
  useEffect(() => {
    if (hasCompletedInitialLoad && !collapseDelayPassed) {
      const timer = setTimeout(() => {
        setCollapseDelayPassed(true)
      }, 300) // 300ms delay to show content before collapsing
      return () => clearTimeout(timer)
    }
  }, [hasCompletedInitialLoad, collapseDelayPassed])

  // Use external messages if provided, otherwise use local state
  const messages = externalMessages ?? localMessages

  const title = CARD_TITLES[cardType] || customTitle || cardType
  const description = CARD_DESCRIPTIONS[cardType]
  const newTitle = pendingSwap?.newTitle || CARD_TITLES[pendingSwap?.newType || ''] || pendingSwap?.newType

  // Get icon from prop or registry
  const cardIconConfig = CARD_ICONS[cardType]
  const ResolvedIcon = Icon || cardIconConfig?.icon
  const resolvedIconColor = iconColor || cardIconConfig?.color || 'text-foreground'

  // Countdown timer for pending swap
  useEffect(() => {
    if (!pendingSwap) {
      setTimeRemaining(null)
      return
    }

    const updateTime = () => {
      const now = Date.now()
      const swapTime = pendingSwap.swapAt.getTime()
      const remaining = Math.max(0, Math.floor((swapTime - now) / 1000))
      setTimeRemaining(remaining)

      if (remaining === 0 && onSwap) {
        onSwap(pendingSwap.newType)
      }
    }

    updateTime()
    const interval = setInterval(updateTime, 1000)
    return () => clearInterval(interval)
  }, [pendingSwap, onSwap])

  const handleSnooze = useCallback((durationMs: number = 3600000) => {
    if (!pendingSwap || !cardId) return

    snoozeSwap({
      originalCardId: cardId,
      originalCardType: cardType,
      originalCardTitle: title,
      newCardType: pendingSwap.newType,
      newCardTitle: newTitle || pendingSwap.newType,
      reason: pendingSwap.reason,
    }, durationMs)

    onSwapCancel?.()
  }, [pendingSwap, cardId, cardType, title, newTitle, snoozeSwap, onSwapCancel])

  const handleSwapNow = useCallback(() => {
    if (pendingSwap && onSwap) {
      onSwap(pendingSwap.newType)
    }
  }, [pendingSwap, onSwap])

  // Close resize submenu when main menu closes
  useEffect(() => {
    if (!showMenu) {
      setShowResizeMenu(false)
      setMenuPosition(null)
    }
  }, [showMenu])

  // Calculate menu position when menu opens
  useEffect(() => {
    if (showMenu && menuButtonRef.current) {
      const rect = menuButtonRef.current.getBoundingClientRect()
      setMenuPosition({
        top: rect.bottom + 4,
        right: window.innerWidth - rect.right,
      })
    }
  }, [showMenu])

  // Close menu when clicking outside
  useEffect(() => {
    if (!showMenu) return

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      // Check if click is outside the menu button and menu content
      if (!target.closest('[data-tour="card-menu"]') && !target.closest('.fixed.glass')) {
        setShowMenu(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showMenu])

  // Calculate if resize submenu should be on the left side
  useEffect(() => {
    if (showResizeMenu && menuContainerRef.current) {
      const rect = menuContainerRef.current.getBoundingClientRect()
      const submenuWidth = 144 // w-36 = 9rem = 144px
      const margin = 20
      const shouldBeOnLeft = rect.right + submenuWidth + margin > window.innerWidth
      setResizeMenuOnLeft(shouldBeOnLeft)
    }
  }, [showResizeMenu])

  // Silence unused variable warnings for future chat implementation
  void messages
  void onChatMessage
  void onChatMessagesChange
  void title
  void setLocalMessages

  return (
    <CardExpandedContext.Provider value={{ isExpanded }}>
    <CardDataReportContext.Provider value={reportCtx}>
      <>
        {/* Main card */}
        <div
          ref={lazyRef}
          key={flashKey}
          data-tour="card"
          data-card-type={cardType}
          data-card-id={cardId}
          data-loading={shouldShowSkeleton ? 'true' : 'false'}
          className={cn(
            'glass rounded-xl overflow-hidden card-hover',
            'flex flex-col transition-all duration-200',
            isCollapsed ? 'h-auto' : 'h-full',
            showDemoIndicator && '!border-2 !border-yellow-500/50',
            // Only pulse during initial skeleton display, not background refreshes (prevents flicker)
            shouldShowSkeleton && !forceSkeletonForOffline && 'animate-card-refresh-pulse',
            getFlashClass()
          )}
          onMouseEnter={() => setShowSummary(true)}
          onMouseLeave={() => setShowSummary(false)}
        >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
          <div className="flex items-center gap-2">
            {dragHandle}
            {ResolvedIcon && <ResolvedIcon className={cn('w-4 h-4', resolvedIconColor)} />}
            <h3 className="text-sm font-medium text-foreground">{title}</h3>
            <InfoTooltip text={description || `${title} card. Description coming soon.`} />
            {/* Demo data indicator - shows if card uses demo data (respects child opt-out) */}
            {showDemoIndicator && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400"
                title={effectiveIsDemoData ? "This card displays demo data" : "Demo mode enabled - showing sample data"}
              >
                Demo
              </span>
            )}
            {/* Live data indicator - for time-series/trend cards with real data */}
            {isLive && !showDemoIndicator && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400"
                title="Showing live data"
              >
                Live
              </span>
            )}
            {/* Failure indicator */}
            {effectiveIsFailed && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 flex items-center gap-1"
                title={`${effectiveConsecutiveFailures} consecutive refresh failures`}
              >
                Refresh failed
              </span>
            )}
            {/* Refresh indicator - only shows when no refresh button is present (button handles its own spin) */}
            {!onRefresh && (isVisuallySpinning || effectiveIsLoading || forceSkeletonForOffline) && !effectiveIsFailed && (
              <RefreshCw className="w-3 h-3 text-blue-400 animate-spin" />
            )}
            {/* Last updated indicator */}
            {!isVisuallySpinning && !effectiveIsLoading && !effectiveIsFailed && lastUpdated && (
              <span className="text-[10px] text-muted-foreground" title={lastUpdated.toLocaleString()}>
                {formatTimeAgo(lastUpdated)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {/* Collapse/expand button */}
            <button
              onClick={() => setCollapsed(!isCollapsed)}
              className="p-1.5 rounded-lg hover:bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors"
              title={isCollapsed ? 'Expand card' : 'Collapse card'}
            >
              {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {/* Manual refresh button */}
            {onRefresh && (
              <button
                onClick={onRefresh}
                disabled={isRefreshing || isVisuallySpinning || effectiveIsLoading || forceSkeletonForOffline}
                className={cn(
                  'p-1.5 rounded-lg transition-colors',
                  isVisuallySpinning || effectiveIsLoading || forceSkeletonForOffline
                    ? 'text-blue-400 cursor-not-allowed'
                    : effectiveIsFailed
                    ? 'text-red-400 hover:bg-red-500/10 hover:text-red-300'
                    : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
                )}
                title={forceSkeletonForOffline ? 'Waiting for agent to connect...' : effectiveIsFailed ? `Refresh failed ${effectiveConsecutiveFailures} times - click to retry` : 'Refresh data'}
              >
                <RefreshCw className={cn('w-4 h-4', (isVisuallySpinning || effectiveIsLoading || forceSkeletonForOffline) && 'animate-spin')} />
              </button>
            )}
            <button
              data-tour="card-chat"
              onClick={() => {}}
              className="p-1.5 rounded-lg hover:bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors"
              title="Ask AI about this card"
            >
              <MessageCircle className="w-4 h-4" />
            </button>
            <button
              onClick={() => setIsExpanded(true)}
              className="p-1.5 rounded-lg hover:bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors"
              title="Expand card to full screen"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
            <div className="relative" data-tour="card-menu">
              <button
                ref={menuButtonRef}
                onClick={() => setShowMenu(!showMenu)}
                className="p-1.5 rounded-lg hover:bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors"
                title="Card menu - configure, replace, or remove"
              >
                <MoreVertical className="w-4 h-4" />
              </button>
              {showMenu && menuPosition && createPortal(
                <div
                  className="fixed w-48 glass rounded-lg py-1 z-50 shadow-xl"
                  style={{ top: menuPosition.top, right: menuPosition.right }}
                >
                  <button
                    onClick={() => {
                      setShowMenu(false)
                      onConfigure?.()
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 flex items-center gap-2"
                    title="Configure card settings like cluster and namespace filters"
                  >
                    <Settings className="w-4 h-4" />
                    Configure
                  </button>
                  <button
                    onClick={() => {
                      setShowMenu(false)
                      const url = `${window.location.origin}${window.location.pathname}?card=${cardType}`
                      navigator.clipboard.writeText(url)
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 flex items-center gap-2"
                    title="Copy a direct URL to this card"
                  >
                    <Link2 className="w-4 h-4" />
                    Copy Link
                  </button>
                  {/* Resize submenu */}
                  {onWidthChange && (
                    <div className="relative" ref={menuContainerRef}>
                      <button
                        onClick={() => setShowResizeMenu(!showResizeMenu)}
                        className="w-full px-4 py-2 text-left text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 flex items-center justify-between"
                        title="Change card width"
                      >
                        <span className="flex items-center gap-2">
                          <MoveHorizontal className="w-4 h-4" />
                          Resize
                        </span>
                        <ChevronRight className={cn('w-4 h-4 transition-transform', showResizeMenu && 'rotate-90')} />
                      </button>
                      {showResizeMenu && (
                        <div className={cn(
                          'absolute top-0 w-36 glass rounded-lg py-1 z-20',
                          resizeMenuOnLeft ? 'right-full mr-1' : 'left-full ml-1'
                        )}>
                          {WIDTH_OPTIONS.map((option) => (
                            <button
                              key={option.value}
                              onClick={() => {
                                onWidthChange(option.value)
                                setShowResizeMenu(false)
                                setShowMenu(false)
                              }}
                              className={cn(
                                'w-full px-3 py-2 text-left text-sm flex items-center justify-between',
                                cardWidth === option.value
                                  ? 'text-purple-400 bg-purple-500/10'
                                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                              )}
                            >
                              <span>{option.label}</span>
                              <span className="text-xs opacity-60">{option.description}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {isCardExportable(cardType) && (
                    <button
                      onClick={() => {
                        setShowMenu(false)
                        setShowWidgetExport(true)
                      }}
                      className="w-full px-4 py-2 text-left text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 flex items-center gap-2"
                      title="Export this card as a desktop widget for Übersicht"
                    >
                      <Download className="w-4 h-4" />
                      Export Widget
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setShowMenu(false)
                      onReplace?.()
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 flex items-center gap-2"
                    title="Replace this card with a different card type"
                  >
                    <Replace className="w-4 h-4" />
                    Replace Card
                  </button>
                  <button
                    onClick={() => {
                      setShowMenu(false)
                      onRemove?.()
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-red-500/10 flex items-center gap-2"
                    title="Remove this card from the dashboard"
                  >
                    <Trash2 className="w-4 h-4" />
                    Remove
                  </button>
                </div>,
                document.body
              )}
            </div>
          </div>
        </div>

        {/* Content - hidden when collapsed, lazy loaded when visible or expanded */}
        {!isCollapsed && (
          <div className="flex-1 p-4 overflow-auto scroll-enhanced min-h-0 flex flex-col">
            {(isVisible || isExpanded) ? (
              <>
                {/* Show skeleton overlay when loading with no cached data */}
                {shouldShowSkeleton && (
                  <CardSkeleton type={effectiveSkeletonType} rows={skeletonRows || 3} showHeader />
                )}
                {/* ALWAYS render children so they can report their data state via useCardLoadingState.
                    Hide visually when skeleton is showing, but keep mounted so useLayoutEffect runs.
                    This prevents the deadlock where CardWrapper waits for hasData but children never mount. */}
                <div className={shouldShowSkeleton ? 'hidden' : 'contents'}>
                  {children}
                </div>
              </>
            ) : (
              // Show skeleton during lazy mount (before IntersectionObserver fires)
              // This provides visual continuity instead of a tiny pulse loader
              <CardSkeleton type={effectiveSkeletonType} rows={skeletonRows || 3} showHeader={false} />
            )}
          </div>
        )}

        {/* Pending swap notification - hidden when collapsed */}
        {!isCollapsed && pendingSwap && (
          <div className="px-4 py-3 bg-purple-500/10 border-t border-purple-500/20">
            <div className="flex items-center gap-2 text-sm">
              <span title="Card swap pending"><Clock className="w-4 h-4 text-purple-400 animate-pulse" /></span>
              <span className="text-purple-300">
                Swapping to "{newTitle}" in 30s
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">{pendingSwap.reason}</p>
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => handleSnooze(3600000)}
                className="text-xs px-2 py-1 rounded bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground"
                title="Delay this swap for 1 hour"
              >
                Snooze 1hr
              </button>
              <button
                onClick={handleSwapNow}
                className="text-xs px-2 py-1 rounded bg-purple-500/20 hover:bg-purple-500/30 text-purple-300"
                title="Swap to the new card immediately"
              >
                Swap Now
              </button>
              <button
                onClick={() => onSwapCancel?.()}
                className="text-xs px-2 py-1 rounded hover:bg-secondary/50 text-muted-foreground"
                title="Cancel the swap and keep this card"
              >
                Keep This
              </button>
            </div>
          </div>
        )}

        {/* Hover summary */}
        {showSummary && lastSummary && (
          <div className="absolute bottom-full left-0 right-0 mb-2 mx-4 p-3 glass rounded-lg text-sm animate-fade-in-up">
            <p className="text-xs text-muted-foreground mb-1">Since last focus:</p>
            <p className="text-foreground">{lastSummary}</p>
          </div>
        )}
      </div>

      {/* Expanded modal */}
      <BaseModal
        isOpen={isExpanded}
        onClose={() => setIsExpanded(false)}
        size={FULLSCREEN_EXPANDED_CARDS.has(cardType) ? 'full' : LARGE_EXPANDED_CARDS.has(cardType) ? 'xl' : 'lg'}
      >
        <BaseModal.Header
          title={title}
          icon={Maximize2}
          onClose={() => setIsExpanded(false)}
          showBack={false}
        />
        <BaseModal.Content className={cn(
          'overflow-auto scroll-enhanced flex flex-col',
          FULLSCREEN_EXPANDED_CARDS.has(cardType)
            ? 'h-[calc(98vh-80px)]'
            : LARGE_EXPANDED_CARDS.has(cardType)
              ? 'h-[calc(95vh-80px)]'
              : 'max-h-[calc(80vh-80px)]'
        )}>
          {/* Wrapper ensures children fill available space in expanded mode */}
          <div className="flex-1 min-h-0 flex flex-col">
            {children}
          </div>
        </BaseModal.Content>
      </BaseModal>

      {/* Widget Export Modal */}
      <WidgetExportModal
        isOpen={showWidgetExport}
        onClose={() => setShowWidgetExport(false)}
        cardType={cardType}
      />
      </>
    </CardDataReportContext.Provider>
    </CardExpandedContext.Provider>
  )
}
