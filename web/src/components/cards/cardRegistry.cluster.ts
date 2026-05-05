import { safeLazy } from '../../lib/safeLazy'
import type { CardRegistryCategory } from './cardRegistry.types'
import { ClusterHealth } from './ClusterHealth'
import { PodIssues } from './PodIssues'
import { ResourceUsage } from './ResourceUsage'
import { DeploymentStatus } from './DeploymentStatus'

const PodLogs = safeLazy(() => import('./PodLogs'), 'PodLogs')
const TopPods = safeLazy(() => import('./TopPods'), 'TopPods')
const AppStatus = safeLazy(() => import('./AppStatus'), 'AppStatus')
const _deployBundle = import('./deploy-bundle').catch(() => undefined as never)
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
const FluxStatus = safeLazy(() => import('./flux_status'), 'FluxStatus')
const OverlayComparison = safeLazy(() => _deployBundle, 'OverlayComparison')
const ArgoCDApplications = safeLazy(() => _deployBundle, 'ArgoCDApplications')
const ArgoCDApplicationSets = safeLazy(() => _deployBundle, 'ArgoCDApplicationSets')
const ArgoCDSyncStatus = safeLazy(() => _deployBundle, 'ArgoCDSyncStatus')
const ArgoCDHealth = safeLazy(() => _deployBundle, 'ArgoCDHealth')
const UserManagement = safeLazy(() => import('./UserManagement'), 'UserManagement')
const OpenCostOverview = safeLazy(() => import('./OpenCostOverview'), 'OpenCostOverview')
const KubecostOverview = safeLazy(() => import('./KubecostOverview'), 'KubecostOverview')
const ServiceExports = safeLazy(() => import('./ServiceExports'), 'ServiceExports')
const ServiceImports = safeLazy(() => import('./ServiceImports'), 'ServiceImports')
const GatewayStatus = safeLazy(() => import('./GatewayStatus'), 'GatewayStatus')
const ServiceTopology = safeLazy(() => import('./ServiceTopology'), 'ServiceTopology')
const WorkloadDeployment = safeLazy(() => _deployBundle, 'WorkloadDeployment')
const ClusterGroups = safeLazy(() => _deployBundle, 'ClusterGroups')
const Missions = safeLazy(() => _deployBundle, 'Missions')
const ResourceMarshall = safeLazy(() => _deployBundle, 'ResourceMarshall')

export const clusterCardRegistry: CardRegistryCategory = {
  components: {
    cluster_health: ClusterHealth, pod_issues: PodIssues, pod_logs: PodLogs, top_pods: TopPods, app_status: AppStatus,
    resource_usage: ResourceUsage, deployment_status: DeploymentStatus, deployment_progress: DeploymentProgress,
    deployment_issues: DeploymentIssues, gitops_drift: GitOpsDrift, upgrade_status: UpgradeStatus,
    resource_capacity: ResourceCapacity, gpu_inventory: GPUInventory, gpu_status: GPUStatus, gpu_overview: GPUOverview,
    gpu_workloads: GPUWorkloads, gpu_namespace_allocations: GPUNamespaceAllocations,
    gpu_inventory_history: GPUInventoryHistory, cluster_resource_tree: ClusterResourceTree,
    storage_overview: StorageOverview, pvc_status: PVCStatus, network_overview: NetworkOverview,
    service_status: ServiceStatus, compute_overview: ComputeOverview, cluster_focus: ClusterFocus,
    cluster_comparison: ClusterComparison, cluster_costs: ClusterCosts, cluster_network: ClusterNetwork,
    cluster_locations: ClusterLocations, namespace_overview: NamespaceOverview, namespace_quotas: NamespaceQuotas,
    namespace_rbac: NamespaceRBAC, namespace_events: NamespaceEvents, namespace_monitor: NamespaceMonitor,
    operator_status: OperatorStatus, operator_subscriptions: OperatorSubscriptions, crd_health: CRDHealth,
    helm_release_status: HelmReleaseStatus, helm_values_diff: HelmValuesDiff, helm_history: HelmHistory,
    chart_versions: ChartVersions, kustomization_status: KustomizationStatus, flux_status: FluxStatus,
    overlay_comparison: OverlayComparison, argocd_applications: ArgoCDApplications,
    argocd_applicationsets: ArgoCDApplicationSets, argocd_sync_status: ArgoCDSyncStatus,
    argocd_health: ArgoCDHealth, user_management: UserManagement, opencost_overview: OpenCostOverview,
    kubecost_overview: KubecostOverview, service_exports: ServiceExports, service_imports: ServiceImports,
    gateway_status: GatewayStatus, service_topology: ServiceTopology, workload_deployment: WorkloadDeployment,
    cluster_groups: ClusterGroups, deployment_missions: Missions, resource_marshall: ResourceMarshall,
    gpu_list: GPUInventory, gpu_issues: GPUStatus, memory_usage: ResourceUsage, cpu_usage: ResourceUsage,
    top_cpu_pods: TopPods, pod_status: AppStatus, pod_list: TopPods, rbac_summary: NamespaceRBAC,
  },
  preloaders: {
    cluster_health: () => import('./ClusterHealth'), pod_issues: () => import('./PodIssues'), pod_logs: () => import('./PodLogs'),
    top_pods: () => import('./TopPods'), app_status: () => import('./AppStatus'), resource_usage: () => import('./ResourceUsage'),
    deployment_status: () => import('./deploy-bundle'), deployment_progress: () => import('./deploy-bundle'),
    deployment_issues: () => import('./deploy-bundle'), gitops_drift: () => import('./deploy-bundle'),
    upgrade_status: () => import('./UpgradeStatus'), resource_capacity: () => import('./ResourceCapacity'),
    gpu_inventory: () => import('./GPUInventory'), gpu_status: () => import('./GPUStatus'), gpu_overview: () => import('./GPUOverview'),
    gpu_workloads: () => import('./GPUWorkloads'), gpu_namespace_allocations: () => import('./GPUNamespaceAllocations'),
    gpu_inventory_history: () => import('./GPUInventoryHistory'), cluster_resource_tree: () => import('./cluster-resource-tree/ClusterResourceTree'),
    storage_overview: () => import('./StorageOverview'), pvc_status: () => import('./PVCStatus'), network_overview: () => import('./NetworkOverview'),
    service_status: () => import('./ServiceStatus'), compute_overview: () => import('./ComputeOverview'), cluster_focus: () => import('./ClusterFocus'),
    cluster_comparison: () => import('./ClusterComparison'), cluster_costs: () => import('./ClusterCosts'),
    cluster_network: () => import('./ClusterNetwork'), cluster_locations: () => import('./ClusterLocations'),
    namespace_overview: () => import('./NamespaceOverview'), namespace_quotas: () => import('./NamespaceQuotas'),
    namespace_rbac: () => import('./NamespaceRBAC'), namespace_events: () => import('./NamespaceEvents'),
    namespace_monitor: () => import('./NamespaceMonitor'), operator_status: () => import('./OperatorStatus'),
    operator_subscriptions: () => import('./OperatorSubscriptions'), crd_health: () => import('./CRDHealth'),
    helm_release_status: () => import('./deploy-bundle'), helm_values_diff: () => import('./HelmValuesDiff'),
    helm_history: () => import('./deploy-bundle'), chart_versions: () => import('./deploy-bundle'),
    kustomization_status: () => import('./deploy-bundle'), flux_status: () => import('./flux_status'),
    overlay_comparison: () => import('./deploy-bundle'), argocd_applications: () => import('./deploy-bundle'),
    argocd_applicationsets: () => import('./deploy-bundle'), argocd_sync_status: () => import('./deploy-bundle'),
    argocd_health: () => import('./deploy-bundle'), user_management: () => import('./UserManagement'),
    opencost_overview: () => import('./OpenCostOverview'), kubecost_overview: () => import('./KubecostOverview'),
    service_exports: () => import('./ServiceExports'), service_imports: () => import('./ServiceImports'),
    gateway_status: () => import('./GatewayStatus'), service_topology: () => import('./ServiceTopology'),
    workload_deployment: () => import('./deploy-bundle'), cluster_groups: () => import('./deploy-bundle'),
    deployment_missions: () => import('./deploy-bundle'), resource_marshall: () => import('./deploy-bundle'),
  },
  defaultWidths: {
    cluster_health: 4, resource_usage: 4, app_status: 4, compute_overview: 4, storage_overview: 4, network_overview: 4,
    gpu_overview: 4, upgrade_status: 4, gateway_status: 6, service_exports: 6, service_imports: 6,
    user_management: 6, service_topology: 8, workload_deployment: 6, cluster_groups: 4, deployment_missions: 5,
    resource_marshall: 6, pvc_status: 6, gpu_status: 6, gpu_inventory: 6, gpu_workloads: 6, gpu_namespace_allocations: 6,
    namespace_overview: 6, namespace_events: 6, namespace_quotas: 5, namespace_rbac: 6, namespace_monitor: 8,
    operator_status: 6, operator_subscriptions: 6, crd_health: 5, helm_release_status: 6, helm_values_diff: 8,
    helm_history: 8, chart_versions: 6, gitops_drift: 6, kustomization_status: 6, flux_status: 6, overlay_comparison: 8, argocd_applications: 6,
    argocd_applicationsets: 6, argocd_sync_status: 6, argocd_health: 6, opencost_overview: 8, kubecost_overview: 8,
    pod_logs: 12, pod_issues: 6, deployment_status: 6, deployment_issues: 6, deployment_progress: 5, top_pods: 6,
    service_status: 6, cluster_resource_tree: 12, cluster_focus: 8, cluster_comparison: 12, cluster_costs: 8,
    cluster_network: 8, cluster_locations: 8, resource_capacity: 8, gpu_inventory_history: 8,
  },
  demoDataCards: ['opencost_overview', 'kubecost_overview', 'service_exports', 'service_imports', 'gateway_status'],
  liveDataCards: ['storage_overview', 'network_overview', 'compute_overview', 'service_status', 'pvc_status', 'gpu_inventory_history', 'deployment_missions'],
  demoStartupPreloaders: [
    () => import('./ServiceExports'), () => import('./ServiceImports'), () => import('./GatewayStatus'), () => import('./ServiceTopology'),
    () => import('./ArgoCDApplications'), () => import('./ArgoCDHealth'), () => import('./ArgoCDSyncStatus'),
    () => import('./KustomizationStatus'), () => import('./OverlayComparison'), () => import('./OpenCostOverview'), () => import('./KubecostOverview'),
  ],
}
