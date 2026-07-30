import type { CardComponent } from './cardRegistry.types'
import { createElement } from 'react'
import { safeLazy } from '../../lib/safeLazy'
import { getCardConfig } from '../../config/cards'
import { ClusterHealth } from './ClusterHealth'
import { ClusterMetrics } from './ClusterMetrics'
import { DeploymentStatus } from './DeploymentStatus'
import { EventStream } from './EventStream'
import { HardwareHealthCard } from './HardwareHealthCard'
import { PodIssues } from './PodIssues'
import { ResourceUsage } from './ResourceUsage'

const AppStatus = safeLazy(() => import('./AppStatus'), 'AppStatus')
const CRDHealth = safeLazy(() => import('./CRDHealth'), 'CRDHealth')
const ClusterComparison = safeLazy(() => import('./ClusterComparison'), 'ClusterComparison')
const ClusterCosts = safeLazy(() => import('./ClusterCosts'), 'ClusterCosts')
const ClusterFocus = safeLazy(() => import('./ClusterFocus'), 'ClusterFocus')
const _workloadMonitorBundle = import('./workload-monitor').catch(() => undefined as never)
const ClusterHealthMonitor = safeLazy(() => _workloadMonitorBundle, 'ClusterHealthMonitor')
const ClusterLocations = safeLazy(() => import('./ClusterLocations'), 'ClusterLocations')
const ClusterNetwork = safeLazy(() => import('./ClusterNetwork'), 'ClusterNetwork')
const ClusterResourceTree = safeLazy(() => import('./cluster-resource-tree/ClusterResourceTree'), 'ClusterResourceTree')
const ComputeOverview = safeLazy(() => import('./ComputeOverview'), 'ComputeOverview')
const _deployBundle = import('./deploy-bundle').catch(() => undefined as never)
const DeploymentIssues = safeLazy(() => _deployBundle, 'DeploymentIssues')
const DeploymentProgress = safeLazy(() => _deployBundle, 'DeploymentProgress')
const EventSummary = safeLazy(() => import('./EventSummary'), 'EventSummary')
const EventsTimeline = safeLazy(() => import('./EventsTimeline'), 'EventsTimeline')
const GPUInventory = safeLazy(() => import('./GPUInventory'), 'GPUInventory')
const GPUInventoryHistory = safeLazy(() => import('./GPUInventoryHistory'), 'GPUInventoryHistory')
const GPUNamespaceAllocations = safeLazy(() => import('./GPUNamespaceAllocations'), 'GPUNamespaceAllocations')
const GPUOverview = safeLazy(() => import('./GPUOverview'), 'GPUOverview')
const GPUStatus = safeLazy(() => import('./GPUStatus'), 'GPUStatus')
const GPUUsageTrend = safeLazy(() => import('./GPUUsageTrend'), 'GPUUsageTrend')
const GPUUtilization = safeLazy(() => import('./GPUUtilization'), 'GPUUtilization')
const GPUWorkloads = safeLazy(() => import('./GPUWorkloads'), 'GPUWorkloads')
const KubecostOverview = safeLazy(() => import('./KubecostOverview'), 'KubecostOverview')
const NamespaceEvents = safeLazy(() => import('./NamespaceEvents'), 'NamespaceEvents')
const NamespaceMonitor = safeLazy(() => import('./NamespaceMonitor'), 'NamespaceMonitor')
const NamespaceOverview = safeLazy(() => import('./NamespaceOverview'), 'NamespaceOverview')
const NamespaceQuotas = safeLazy(() => import('./NamespaceQuotas'), 'NamespaceQuotas')
const NetworkOverview = safeLazy(() => import('./NetworkOverview'), 'NetworkOverview')
const OpenCostOverview = safeLazy(() => import('./OpenCostOverview'), 'OpenCostOverview')
const OperatorStatus = safeLazy(() => import('./OperatorStatus'), 'OperatorStatus')
const OperatorSubscriptions = safeLazy(() => import('./OperatorSubscriptions'), 'OperatorSubscriptions')
const PVCStatus = safeLazy(() => import('./PVCStatus'), 'PVCStatus')
const PodHealthTrend = safeLazy(() => import('./PodHealthTrend'), 'PodHealthTrend')
const PodLogs = safeLazy(() => import('./PodLogs'), 'PodLogs')
const ProactiveGPUNodeHealthMonitor = safeLazy(() => import('./ProactiveGPUNodeHealthMonitor'), 'ProactiveGPUNodeHealthMonitor')
const RecentEvents = safeLazy(() => import('./RecentEvents'), 'RecentEvents')
const ResourceCapacity = safeLazy(() => import('./ResourceCapacity'), 'ResourceCapacity')
const ResourceTrend = safeLazy(() => import('./ResourceTrend'), 'ResourceTrend')
const ServiceStatus = safeLazy(() => import('./ServiceStatus'), 'ServiceStatus')
const StorageOverview = safeLazy(() => import('./StorageOverview'), 'StorageOverview')
const TopPods = safeLazy(() => import('./TopPods'), 'TopPods')
const UpgradeStatus = safeLazy(() => import('./UpgradeStatus'), 'UpgradeStatus')
const WarningEvents = safeLazy(() => import('./WarningEvents'), 'WarningEvents')
const WorkloadMonitor = safeLazy(() => _workloadMonitorBundle, 'WorkloadMonitor')

/**
 * Core infrastructure cards.
 * Cards:
 * app_status, cluster_comparison, cluster_costs, cluster_focus, cluster_health,
 * cluster_health_monitor, cluster_locations, cluster_metrics, cluster_network,
 * cluster_resource_tree, compute_overview, configmap_status, cpu_trend, cpu_usage, crd_health,
 * cronjob_status, daemonset_status, deployment_issues, deployment_progress, deployment_status,
 * error_count, event_stream, event_summary, events_timeline, gpu_inventory, gpu_inventory_history,
 * gpu_issues, gpu_list, gpu_namespace_allocations, gpu_node_health, gpu_overview, gpu_status,
 * gpu_usage_trend, gpu_utilization, gpu_workloads, hardware_health, hpa_status, ingress_status,
 * job_status, kubecost_overview, limit_range_status, memory_trend, memory_usage, namespace_events,
 * namespace_monitor, namespace_overview, namespace_quotas, namespace_status, network_overview,
 * node_status, opencost_overview, operator_status, operator_subscription_status,
 * operator_subscriptions, pod_health_trend, pod_issues, pod_list, pod_logs, pod_status, pv_status,
 * pvc_status, recent_events, replicaset_status, resource_capacity, resource_quota_status,
 * resource_trend, resource_usage, service_status, statefulset_status, storage_overview,
 * top_cpu_pods, top_pods, upgrade_status, warning_events, workload_monitor, workload_status
 */
export interface CardRegistryDomain {
  components: Record<string, CardComponent>
  demoDataCards: Set<string>
  liveDataCards: Set<string>
  chunkPreloaders: Record<string, () => Promise<unknown>>
  defaultWidths: Record<string, number>
}

const LazyUnifiedCard = safeLazy(() => import('../../lib/unified/card/UnifiedCard'), 'UnifiedCard')
const UNIFIED_CONTENT_TYPES = ['list', 'table', 'chart', 'status-grid']

function makeUnifiedEntry(cardType: string): CardComponent | undefined {
  const config = getCardConfig(cardType)
  if (!config?.dataSource || !config?.content || !UNIFIED_CONTENT_TYPES.includes(config.content.type)) {
    return undefined
  }
  const Adapter: CardComponent = () => createElement(LazyUnifiedCard, { config, className: 'h-full' })
  Adapter.displayName = `Unified(${cardType})`
  return Adapter
}

const components: Record<string, CardComponent> = {
  app_status: AppStatus,
  cluster_comparison: ClusterComparison,
  cluster_costs: ClusterCosts,
  cluster_focus: ClusterFocus,
  cluster_health: ClusterHealth,
  cluster_health_monitor: ClusterHealthMonitor,
  cluster_locations: ClusterLocations,
  cluster_metrics: ClusterMetrics,
  cluster_network: ClusterNetwork,
  cluster_resource_tree: ClusterResourceTree,
  compute_overview: ComputeOverview,
  cpu_trend: ClusterMetrics,
  cpu_usage: ResourceUsage,
  crd_health: CRDHealth,
  deployment_issues: DeploymentIssues,
  deployment_progress: DeploymentProgress,
  deployment_status: DeploymentStatus,
  error_count: PodIssues,
  event_stream: EventStream,
  event_summary: EventSummary,
  events_timeline: EventsTimeline,
  gpu_inventory: GPUInventory,
  gpu_inventory_history: GPUInventoryHistory,
  gpu_issues: GPUStatus,
  gpu_list: GPUInventory,
  gpu_namespace_allocations: GPUNamespaceAllocations,
  gpu_node_health: ProactiveGPUNodeHealthMonitor,
  gpu_overview: GPUOverview,
  gpu_status: GPUStatus,
  gpu_usage_trend: GPUUsageTrend,
  gpu_utilization: GPUUtilization,
  gpu_workloads: GPUWorkloads,
  hardware_health: HardwareHealthCard,
  kubecost_overview: KubecostOverview,
  memory_trend: ClusterMetrics,
  memory_usage: ResourceUsage,
  namespace_events: NamespaceEvents,
  namespace_monitor: NamespaceMonitor,
  namespace_overview: NamespaceOverview,
  namespace_quotas: NamespaceQuotas,
  network_overview: NetworkOverview,
  opencost_overview: OpenCostOverview,
  operator_status: OperatorStatus,
  operator_subscriptions: OperatorSubscriptions,
  pod_health_trend: PodHealthTrend,
  pod_issues: PodIssues,
  pod_list: TopPods,
  pod_logs: PodLogs,
  pod_status: AppStatus,
  pvc_status: PVCStatus,
  recent_events: RecentEvents,
  resource_capacity: ResourceCapacity,
  resource_trend: ResourceTrend,
  resource_usage: ResourceUsage,
  service_status: ServiceStatus,
  storage_overview: StorageOverview,
  top_cpu_pods: TopPods,
  top_pods: TopPods,
  upgrade_status: UpgradeStatus,
  warning_events: WarningEvents,
  workload_monitor: WorkloadMonitor,
  workload_status: WorkloadMonitor,
}

const configmap_statusComponent = makeUnifiedEntry('configmap_status')
if (configmap_statusComponent) components['configmap_status'] = configmap_statusComponent
const cronjob_statusComponent = makeUnifiedEntry('cronjob_status')
if (cronjob_statusComponent) components['cronjob_status'] = cronjob_statusComponent
const daemonset_statusComponent = makeUnifiedEntry('daemonset_status')
if (daemonset_statusComponent) components['daemonset_status'] = daemonset_statusComponent
const hpa_statusComponent = makeUnifiedEntry('hpa_status')
if (hpa_statusComponent) components['hpa_status'] = hpa_statusComponent
const ingress_statusComponent = makeUnifiedEntry('ingress_status')
if (ingress_statusComponent) components['ingress_status'] = ingress_statusComponent
const job_statusComponent = makeUnifiedEntry('job_status')
if (job_statusComponent) components['job_status'] = job_statusComponent
const limit_range_statusComponent = makeUnifiedEntry('limit_range_status')
if (limit_range_statusComponent) components['limit_range_status'] = limit_range_statusComponent
const namespace_statusComponent = makeUnifiedEntry('namespace_status')
if (namespace_statusComponent) components['namespace_status'] = namespace_statusComponent
const node_statusComponent = makeUnifiedEntry('node_status')
if (node_statusComponent) components['node_status'] = node_statusComponent
const operator_subscription_statusComponent = makeUnifiedEntry('operator_subscription_status')
if (operator_subscription_statusComponent) components['operator_subscription_status'] = operator_subscription_statusComponent
const pv_statusComponent = makeUnifiedEntry('pv_status')
if (pv_statusComponent) components['pv_status'] = pv_statusComponent
const replicaset_statusComponent = makeUnifiedEntry('replicaset_status')
if (replicaset_statusComponent) components['replicaset_status'] = replicaset_statusComponent
const resource_quota_statusComponent = makeUnifiedEntry('resource_quota_status')
if (resource_quota_statusComponent) components['resource_quota_status'] = resource_quota_statusComponent
const statefulset_statusComponent = makeUnifiedEntry('statefulset_status')
if (statefulset_statusComponent) components['statefulset_status'] = statefulset_statusComponent

export const coreCardRegistry: CardRegistryDomain = {
  components,
  demoDataCards: new Set([
    'kubecost_overview',
    'opencost_overview',
  ]),
  liveDataCards: new Set([
    'cluster_health_monitor',
    'cluster_metrics',
    'compute_overview',
    'event_stream',
    'event_summary',
    'events_timeline',
    'gpu_inventory_history',
    'gpu_node_health',
    'gpu_usage_trend',
    'gpu_utilization',
    'network_overview',
    'node_status',
    'pod_health_trend',
    'pvc_status',
    'recent_events',
    'resource_trend',
    'service_status',
    'storage_overview',
    'warning_events',
    'workload_monitor',
    'workload_status',
  ]),
  chunkPreloaders: {
    app_status: () => import('./AppStatus'),
    cluster_comparison: () => import('./ClusterComparison'),
    cluster_costs: () => import('./ClusterCosts'),
    cluster_focus: () => import('./ClusterFocus'),
    cluster_health: () => import('./ClusterHealth'),
    cluster_health_monitor: () => import('./workload-monitor'),
    cluster_locations: () => import('./ClusterLocations'),
    cluster_metrics: () => import('./ClusterMetrics'),
    cluster_network: () => import('./ClusterNetwork'),
    cluster_resource_tree: () => import('./cluster-resource-tree/ClusterResourceTree'),
    compute_overview: () => import('./ComputeOverview'),
    crd_health: () => import('./CRDHealth'),
    deployment_issues: () => import('./deploy-bundle'),
    deployment_progress: () => import('./deploy-bundle'),
    deployment_status: () => import('./deploy-bundle'),
    event_stream: () => import('./EventStream'),
    event_summary: () => import('./EventSummary'),
    events_timeline: () => import('./EventsTimeline'),
    gpu_inventory: () => import('./GPUInventory'),
    gpu_inventory_history: () => import('./GPUInventoryHistory'),
    gpu_namespace_allocations: () => import('./GPUNamespaceAllocations'),
    gpu_node_health: () => import('./ProactiveGPUNodeHealthMonitor'),
    gpu_overview: () => import('./GPUOverview'),
    gpu_status: () => import('./GPUStatus'),
    gpu_usage_trend: () => import('./GPUUsageTrend'),
    gpu_utilization: () => import('./GPUUtilization'),
    gpu_workloads: () => import('./GPUWorkloads'),
    hardware_health: () => import('./HardwareHealthCard'),
    kubecost_overview: () => import('./KubecostOverview'),
    namespace_events: () => import('./NamespaceEvents'),
    namespace_monitor: () => import('./NamespaceMonitor'),
    namespace_overview: () => import('./NamespaceOverview'),
    namespace_quotas: () => import('./NamespaceQuotas'),
    network_overview: () => import('./NetworkOverview'),
    opencost_overview: () => import('./OpenCostOverview'),
    operator_status: () => import('./OperatorStatus'),
    operator_subscriptions: () => import('./OperatorSubscriptions'),
    pod_health_trend: () => import('./PodHealthTrend'),
    pod_issues: () => import('./PodIssues'),
    pod_logs: () => import('./PodLogs'),
    pvc_status: () => import('./PVCStatus'),
    recent_events: () => import('./RecentEvents'),
    resource_capacity: () => import('./ResourceCapacity'),
    resource_trend: () => import('./ResourceTrend'),
    resource_usage: () => import('./ResourceUsage'),
    service_status: () => import('./ServiceStatus'),
    storage_overview: () => import('./StorageOverview'),
    top_pods: () => import('./TopPods'),
    upgrade_status: () => import('./UpgradeStatus'),
    warning_events: () => import('./WarningEvents'),
    workload_monitor: () => import('./workload-monitor'),
    workload_status: () => import('./workload-monitor'),
  },
  defaultWidths: {
    app_status: 4,
    cluster_comparison: 12,
    cluster_costs: 8,
    cluster_focus: 8,
    cluster_health: 4,
    cluster_health_monitor: 6,
    cluster_locations: 8,
    cluster_metrics: 8,
    cluster_network: 8,
    cluster_resource_tree: 12,
    compute_overview: 4,
    crd_health: 5,
    deployment_issues: 6,
    deployment_progress: 5,
    deployment_status: 6,
    event_stream: 6,
    event_summary: 6,
    events_timeline: 8,
    gpu_inventory: 6,
    gpu_inventory_history: 8,
    gpu_namespace_allocations: 6,
    gpu_node_health: 6,
    gpu_overview: 4,
    gpu_status: 6,
    gpu_usage_trend: 8,
    gpu_utilization: 8,
    gpu_workloads: 6,
    hardware_health: 6,
    kubecost_overview: 8,
    namespace_events: 6,
    namespace_monitor: 8,
    namespace_overview: 6,
    namespace_quotas: 5,
    network_overview: 4,
    node_status: 6,
    opencost_overview: 8,
    operator_status: 6,
    operator_subscriptions: 6,
    pod_health_trend: 8,
    pod_issues: 6,
    pod_logs: 12,
    pvc_status: 6,
    recent_events: 6,
    resource_capacity: 8,
    resource_trend: 8,
    resource_usage: 4,
    service_status: 6,
    storage_overview: 4,
    top_pods: 6,
    upgrade_status: 4,
    warning_events: 6,
    workload_monitor: 8,
    workload_status: 8,
  },
}
