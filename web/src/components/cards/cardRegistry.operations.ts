import { safeLazy } from '../../lib/safeLazy'
import type { CardRegistryCategory } from './cardRegistry.types'

const _drasiBundle = import('./drasi').catch(() => undefined as never)
const DrasiReactiveGraph = safeLazy(() => _drasiBundle, 'DrasiReactiveGraph')
const _insightsBundle = import('./insights').catch(() => undefined as never)
const CrossClusterEventCorrelation = safeLazy(() => _insightsBundle, 'CrossClusterEventCorrelation')
const ClusterDeltaDetector = safeLazy(() => _insightsBundle, 'ClusterDeltaDetector')
const CascadeImpactMap = safeLazy(() => _insightsBundle, 'CascadeImpactMap')
const ConfigDriftHeatmap = safeLazy(() => _insightsBundle, 'ConfigDriftHeatmap')
const ResourceImbalanceDetector = safeLazy(() => _insightsBundle, 'ResourceImbalanceDetector')
const RestartCorrelationMatrix = safeLazy(() => _insightsBundle, 'RestartCorrelationMatrix')
const DeploymentRolloutTracker = safeLazy(() => _insightsBundle, 'DeploymentRolloutTracker')
const RightSizeAdvisor = safeLazy(() => _insightsBundle, 'RightSizeAdvisor')
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
const ChangeTimeline = safeLazy(() => import('./change_timeline/ChangeTimeline'), 'ChangeTimeline')
const KubeRayFleet = safeLazy(() => import('./kuberay_fleet'), 'KubeRayFleet')
const SLOCompliance = safeLazy(() => import('./slo_compliance'), 'SLOCompliance')
const FailoverTimeline = safeLazy(() => import('./failover_timeline'), 'FailoverTimeline')
const TrinoGateway = safeLazy(() => import('./trino_gateway'), 'TrinoGateway')
const JaegerStatus = safeLazy(() => import('./jaeger_status'), 'JaegerStatus')

export const operationsCardRegistry: CardRegistryCategory = {
  components: {
    drasi_reactive_graph: DrasiReactiveGraph, cross_cluster_event_correlation: CrossClusterEventCorrelation,
    cluster_delta_detector: ClusterDeltaDetector, cascade_impact_map: CascadeImpactMap, config_drift_heatmap: ConfigDriftHeatmap,
    resource_imbalance_detector: ResourceImbalanceDetector, restart_correlation_matrix: RestartCorrelationMatrix,
    deployment_rollout_tracker: DeploymentRolloutTracker, right_size_advisor: RightSizeAdvisor, predictive_health: PredictiveHealth,
    node_debug: NodeDebug, control_plane_health: ControlPlaneHealth, node_conditions: NodeConditions,
    admission_webhooks: AdmissionWebhooks, etcd_status: EtcdStatus, network_policies: NetworkPolicyCoverage,
    rbac_explorer: RBACExplorer, maintenance_windows: MaintenanceWindows, cluster_changelog: ClusterChangelog,
    change_timeline: ChangeTimeline, quota_heatmap: QuotaHeatmap, kuberay_fleet: KubeRayFleet,
    slo_compliance: SLOCompliance, failover_timeline: FailoverTimeline, trino_gateway: TrinoGateway, jaeger_status: JaegerStatus,
  },
  preloaders: {
    drasi_reactive_graph: () => import('./drasi'), cross_cluster_event_correlation: () => import('./insights'),
    cluster_delta_detector: () => import('./insights'), cascade_impact_map: () => import('./insights'),
    config_drift_heatmap: () => import('./insights'), resource_imbalance_detector: () => import('./insights'),
    restart_correlation_matrix: () => import('./insights'), deployment_rollout_tracker: () => import('./insights'),
    right_size_advisor: () => import('./insights'), predictive_health: () => import('./cluster-admin-bundle'),
    node_debug: () => import('./cluster-admin-bundle'), control_plane_health: () => import('./cluster-admin-bundle'),
    node_conditions: () => import('./cluster-admin-bundle'), admission_webhooks: () => import('./cluster-admin-bundle'),
    etcd_status: () => import('./cluster-admin-bundle'), network_policies: () => import('./cluster-admin-bundle'),
    rbac_explorer: () => import('./cluster-admin-bundle'), maintenance_windows: () => import('./cluster-admin-bundle'),
    cluster_changelog: () => import('./cluster-admin-bundle'), change_timeline: () => import('./change_timeline/ChangeTimeline'),
    quota_heatmap: () => import('./cluster-admin-bundle'), kuberay_fleet: () => import('./kuberay_fleet'),
    slo_compliance: () => import('./slo_compliance'), failover_timeline: () => import('./failover_timeline'),
    trino_gateway: () => import('./trino_gateway'), jaeger_status: () => import('./jaeger_status'),
  },
  defaultWidths: {
    drasi_reactive_graph: 12, predictive_health: 8, node_debug: 6, control_plane_health: 4, node_conditions: 6,
    admission_webhooks: 6, etcd_status: 4, network_policies: 6, rbac_explorer: 6, maintenance_windows: 6,
    cluster_changelog: 6, change_timeline: 6, quota_heatmap: 8, kuberay_fleet: 6, slo_compliance: 6,
    failover_timeline: 8, trino_gateway: 6, jaeger_status: 6, cross_cluster_event_correlation: 6,
    cluster_delta_detector: 6, cascade_impact_map: 6, config_drift_heatmap: 6, resource_imbalance_detector: 6,
    restart_correlation_matrix: 6, deployment_rollout_tracker: 6, right_size_advisor: 8,
  },
  demoDataCards: ['admission_webhooks', 'rbac_explorer'],
  liveDataCards: ['control_plane_health', 'node_conditions', 'etcd_status', 'network_policies', 'cluster_changelog', 'change_timeline', 'predictive_health', 'quota_heatmap', 'kuberay_fleet', 'slo_compliance', 'failover_timeline', 'trino_gateway'],
}
