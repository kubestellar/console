import type { CardComponent } from './cardRegistry.types'
import { safeLazy } from '../../lib/safeLazy'

const _clusterAdminBundle = import('./cluster-admin-bundle').catch(() => undefined as never)
const AdmissionWebhooks = safeLazy(() => _clusterAdminBundle, 'AdmissionWebhooks')
const ArtifactHubStatus = safeLazy(() => import('./artifact_hub_status'), 'ArtifactHubStatus')
const BuildpacksStatus = safeLazy(() => import('./buildpacks-status'), 'BuildpacksStatus')
const _insightsBundle = import('./insights').catch(() => undefined as never)
const CascadeImpactMap = safeLazy(() => _insightsBundle, 'CascadeImpactMap')
const ChangeTimeline = safeLazy(() => import('./change_timeline/ChangeTimeline'), 'ChangeTimeline')
const ChaosMeshStatus = safeLazy(() => import('./chaos_mesh_status'), 'ChaosMeshStatus')
const _arcadeBundle = import('./arcade-bundle').catch(() => undefined as never)
const Checkers = safeLazy(() => _arcadeBundle, 'Checkers')
const CloudEventsStatus = safeLazy(() => import('./cloudevents_status'), 'CloudEventsStatus')
const ClusterChangelog = safeLazy(() => _clusterAdminBundle, 'ClusterChangelog')
const ClusterDeltaDetector = safeLazy(() => _insightsBundle, 'ClusterDeltaDetector')
const ConfigDriftHeatmap = safeLazy(() => _insightsBundle, 'ConfigDriftHeatmap')
const ContainerTetris = safeLazy(() => _arcadeBundle, 'ContainerTetris')
const ControlPlaneHealth = safeLazy(() => _clusterAdminBundle, 'ControlPlaneHealth')
const CrioStatus = safeLazy(() => import('./crio_status'), 'CrioStatus')
const CrossClusterEventCorrelation = safeLazy(() => _insightsBundle, 'CrossClusterEventCorrelation')
const CrossplaneManagedResources = safeLazy(() => import('./crossplane-status/CrossplaneManagedResources'), 'CrossplaneManagedResources')
const CubefsStatus = safeLazy(() => import('./cubefs_status'), 'CubefsStatus')
const DeploymentRolloutTracker = safeLazy(() => _insightsBundle, 'DeploymentRolloutTracker')
const DragonflyStatus = safeLazy(() => import('./dragonfly_status'), 'DragonflyStatus')
const DrasiPipelines = safeLazy(() => import('./DrasiPipelines'), 'DrasiPipelines')
const _drasiBundle = import('./drasi').catch(() => undefined as never)
const DrasiReactiveGraph = safeLazy(() => _drasiBundle, 'DrasiReactiveGraph')
const DynamicCard = safeLazy(() => import('./DynamicCard'), 'DynamicCard')
const EtcdStatus = safeLazy(() => _clusterAdminBundle, 'EtcdStatus')
const FailoverTimeline = safeLazy(() => import('./failover_timeline'), 'FailoverTimeline')
const FlappyPod = safeLazy(() => _arcadeBundle, 'FlappyPod')
const FlatcarStatus = safeLazy(() => import('./flatcar_status'), 'FlatcarStatus')
const FluidStatus = safeLazy(() => import('./fluid_status'), 'FluidStatus')
const Game2048 = safeLazy(() => _arcadeBundle, 'Game2048')
const GatewayStatus = safeLazy(() => import('./GatewayStatus'), 'GatewayStatus')
const GitHubActivity = safeLazy(() => import('./GitHubActivity'), 'GitHubActivity')
const IframeEmbed = safeLazy(() => import('./IframeEmbed'), 'IframeEmbed')
const IssueActivityChart = safeLazy(() => import('./IssueActivityChart'), 'IssueActivityChart')
const KServeStatus = safeLazy(() => import('./kserve_status'), 'KServeStatus')
const KarmadaStatus = safeLazy(() => import('./karmada_status'), 'KarmadaStatus')
const KedaStatus = safeLazy(() => import('./keda_status'), 'KedaStatus')
const KnativeStatus = safeLazy(() => import('./knative_status'), 'KnativeStatus')
const KubeBert = safeLazy(() => _arcadeBundle, 'KubeBert')
const KubeChess = safeLazy(() => _arcadeBundle, 'KubeChess')
const KubeDoom = safeLazy(() => _arcadeBundle, 'KubeDoom')
const KubeGalaga = safeLazy(() => _arcadeBundle, 'KubeGalaga')
const KubeKart = safeLazy(() => _arcadeBundle, 'KubeKart')
const KubeKong = safeLazy(() => _arcadeBundle, 'KubeKong')
const KubeMan = safeLazy(() => _arcadeBundle, 'KubeMan')
const KubePong = safeLazy(() => _arcadeBundle, 'KubePong')
const KubeRayFleet = safeLazy(() => import('./kuberay_fleet'), 'KubeRayFleet')
const KubeSnake = safeLazy(() => _arcadeBundle, 'KubeSnake')
const KubeVelaStatus = safeLazy(() => import('./kubevela_status'), 'KubeVelaStatus')
const Kubectl = safeLazy(() => import('./Kubectl'), 'Kubectl')
const Kubedle = safeLazy(() => _arcadeBundle, 'Kubedle')
const LimaStatus = safeLazy(() => import('./lima_status'), 'LimaStatus')
const MaintenanceWindows = safeLazy(() => _clusterAdminBundle, 'MaintenanceWindows')
const MatchGame = safeLazy(() => _arcadeBundle, 'MatchGame')
const MissileCommand = safeLazy(() => _arcadeBundle, 'MissileCommand')
const MobileBrowser = safeLazy(() => import('./MobileBrowser'), 'MobileBrowser')
const NetworkUtils = safeLazy(() => import('./NetworkUtils'), 'NetworkUtils')
const NodeConditions = safeLazy(() => _clusterAdminBundle, 'NodeConditions')
const NodeDebug = safeLazy(() => _clusterAdminBundle, 'NodeDebug')
const NodeInvaders = safeLazy(() => _arcadeBundle, 'NodeInvaders')
const OpenFeatureStatus = safeLazy(() => import('./openfeature_status'), 'OpenFeatureStatus')
const OpenKruiseStatus = safeLazy(() => import('./openkruise_status'), 'OpenKruiseStatus')
const OpenYurtStatus = safeLazy(() => import('./openyurt_status'), 'OpenYurtStatus')
const PodBrothers = safeLazy(() => _arcadeBundle, 'PodBrothers')
const PodCrosser = safeLazy(() => _arcadeBundle, 'PodCrosser')
const PodPitfall = safeLazy(() => _arcadeBundle, 'PodPitfall')
const PodSweeper = safeLazy(() => _arcadeBundle, 'PodSweeper')
const PredictiveHealth = safeLazy(() => _clusterAdminBundle, 'PredictiveHealth')
const QuotaHeatmap = safeLazy(() => _clusterAdminBundle, 'QuotaHeatmap')
const RBACExplorer = safeLazy(() => _clusterAdminBundle, 'RBACExplorer')
const RSSFeed = safeLazy(() => import('./rss'), 'RSSFeed')
const ResourceImbalanceDetector = safeLazy(() => _insightsBundle, 'ResourceImbalanceDetector')
const RestartCorrelationMatrix = safeLazy(() => _insightsBundle, 'RestartCorrelationMatrix')
const RightSizeAdvisor = safeLazy(() => _insightsBundle, 'RightSizeAdvisor')
const SLOCompliance = safeLazy(() => import('./slo_compliance'), 'SLOCompliance')
const ServiceExports = safeLazy(() => import('./ServiceExports'), 'ServiceExports')
const ServiceImports = safeLazy(() => import('./ServiceImports'), 'ServiceImports')
const ServiceTopology = safeLazy(() => import('./ServiceTopology'), 'ServiceTopology')
const Solitaire = safeLazy(() => _arcadeBundle, 'Solitaire')
const StrimziStatus = safeLazy(() => import('./strimzi_status'), 'StrimziStatus')
const SudokuGame = safeLazy(() => _arcadeBundle, 'SudokuGame')
const TrinoGateway = safeLazy(() => import('./trino_gateway'), 'TrinoGateway')
const UserManagement = safeLazy(() => import('./UserManagement'), 'UserManagement')
const VolcanoStatus = safeLazy(() => import('./volcano_status'), 'VolcanoStatus')
const WasmcloudStatus = safeLazy(() => import('./wasmcloud_status'), 'WasmcloudStatus')

/**
 * Miscellaneous cards.
 * Cards:
 * admission_webhooks, artifact_hub_status, buildpacks_status, cascade_impact_map, change_timeline,
 * chaos_mesh_status, checkers, cloudevents_status, cluster_changelog, cluster_delta_detector,
 * config_drift_heatmap, container_tetris, control_plane_health, crio_status,
 * cross_cluster_event_correlation, crossplane_managed_resources, cubefs_status,
 * deployment_rollout_tracker, dragonfly_status, drasi_pipelines, drasi_reactive_graph, dynamic_card,
 * etcd_status, failover_timeline, flappy_pod, flatcar_status, fluid_status, game_2048, gateway_status,
 * github_activity, iframe_embed, issue_activity_chart, karmada_status, keda_status,
 * knative_status, kserve_status, kube_bert, kube_chess, kube_doom, kube_galaga, kube_kart,
 * kube_kong, kube_man, kube_pong, kube_snake, kubectl, kubedle, kuberay_fleet, kubevela_status,
 * lima_status, maintenance_windows, match_game, missile_command, mobile_browser, network_utils,
 * node_conditions, node_debug, node_invaders, openfeature_status, openkruise_status,
 * openyurt_status, pod_brothers, pod_crosser, pod_pitfall, pod_sweeper, predictive_health,
 * quota_heatmap, rbac_explorer, resource_imbalance_detector, restart_correlation_matrix,
 * right_size_advisor, rss_feed, service_exports, service_imports, service_topology,
 * slo_compliance, solitaire, strimzi_status, sudoku_game, trino_gateway, user_management,
 * volcano_status, wasmcloud_status
 */
export interface CardRegistryDomain {
  components: Record<string, CardComponent>
  demoDataCards: Set<string>
  liveDataCards: Set<string>
  chunkPreloaders: Record<string, () => Promise<unknown>>
  defaultWidths: Record<string, number>
}

const components: Record<string, CardComponent> = {
  admission_webhooks: AdmissionWebhooks,
  artifact_hub_status: ArtifactHubStatus,
  buildpacks_status: BuildpacksStatus,
  cascade_impact_map: CascadeImpactMap,
  change_timeline: ChangeTimeline,
  chaos_mesh_status: ChaosMeshStatus,
  checkers: Checkers,
  cloudevents_status: CloudEventsStatus,
  cluster_changelog: ClusterChangelog,
  cluster_delta_detector: ClusterDeltaDetector,
  config_drift_heatmap: ConfigDriftHeatmap,
  container_tetris: ContainerTetris,
  control_plane_health: ControlPlaneHealth,
  crio_status: CrioStatus,
  cross_cluster_event_correlation: CrossClusterEventCorrelation,
  crossplane_managed_resources: CrossplaneManagedResources,
  cubefs_status: CubefsStatus,
  deployment_rollout_tracker: DeploymentRolloutTracker,
  dragonfly_status: DragonflyStatus,
  drasi_pipelines: DrasiPipelines,
  drasi_reactive_graph: DrasiReactiveGraph,
  dynamic_card: DynamicCard,
  etcd_status: EtcdStatus,
  failover_timeline: FailoverTimeline,
  flappy_pod: FlappyPod,
  flatcar_status: FlatcarStatus,
  fluid_status: FluidStatus,
  game_2048: Game2048,
  gateway_status: GatewayStatus,
  github_activity: GitHubActivity,
  iframe_embed: IframeEmbed,
  issue_activity_chart: IssueActivityChart,
  karmada_status: KarmadaStatus,
  keda_status: KedaStatus,
  knative_status: KnativeStatus,
  kserve_status: KServeStatus,
  kube_bert: KubeBert,
  kube_chess: KubeChess,
  kube_doom: KubeDoom,
  kube_galaga: KubeGalaga,
  kube_kart: KubeKart,
  kube_kong: KubeKong,
  kube_man: KubeMan,
  kube_pong: KubePong,
  kube_snake: KubeSnake,
  kubectl: Kubectl,
  kubedle: Kubedle,
  kuberay_fleet: KubeRayFleet,
  kubevela_status: KubeVelaStatus,
  lima_status: LimaStatus,
  maintenance_windows: MaintenanceWindows,
  match_game: MatchGame,
  missile_command: MissileCommand,
  mobile_browser: MobileBrowser,
  network_utils: NetworkUtils,
  node_conditions: NodeConditions,
  node_debug: NodeDebug,
  node_invaders: NodeInvaders,
  openfeature_status: OpenFeatureStatus,
  openkruise_status: OpenKruiseStatus,
  openyurt_status: OpenYurtStatus,
  pod_brothers: PodBrothers,
  pod_crosser: PodCrosser,
  pod_pitfall: PodPitfall,
  pod_sweeper: PodSweeper,
  predictive_health: PredictiveHealth,
  quota_heatmap: QuotaHeatmap,
  rbac_explorer: RBACExplorer,
  resource_imbalance_detector: ResourceImbalanceDetector,
  restart_correlation_matrix: RestartCorrelationMatrix,
  right_size_advisor: RightSizeAdvisor,
  rss_feed: RSSFeed,
  service_exports: ServiceExports,
  service_imports: ServiceImports,
  service_topology: ServiceTopology,
  slo_compliance: SLOCompliance,
  solitaire: Solitaire,
  strimzi_status: StrimziStatus,
  sudoku_game: SudokuGame,
  trino_gateway: TrinoGateway,
  user_management: UserManagement,
  volcano_status: VolcanoStatus,
  wasmcloud_status: WasmcloudStatus,
}

export const miscCardRegistry: CardRegistryDomain = {
  components,
  demoDataCards: new Set([
    'admission_webhooks',
    'crossplane_managed_resources',
    'cubefs_status',
    'drasi_pipelines',
    'fluid_status',
    'gateway_status',
    'knative_status',
    'kserve_status',
    'kubevela_status',
    'rbac_explorer',
    'service_exports',
    'service_imports',
  ]),
  liveDataCards: new Set([
    'artifact_hub_status',
    'change_timeline',
    'chaos_mesh_status',
    'cluster_changelog',
    'control_plane_health',
    'crio_status',
    'dragonfly_status',
    'failover_timeline',
    'keda_status',
    'kserve_status',
    'kuberay_fleet',
    'kubevela_status',
    'node_conditions',
    'openyurt_status',
    'predictive_health',
    'quota_heatmap',
    'slo_compliance',
    'strimzi_status',
    'trino_gateway',
  ]),
  chunkPreloaders: {
    admission_webhooks: () => import('./cluster-admin-bundle'),
    artifact_hub_status: () => import('./artifact_hub_status'),
    buildpacks_status: () => import('./buildpacks-status'),
    cascade_impact_map: () => import('./insights'),
    change_timeline: () => import('./change_timeline/ChangeTimeline'),
    chaos_mesh_status: () => import('./chaos_mesh_status'),
    checkers: () => import('./arcade-bundle'),
    cloudevents_status: () => import('./cloudevents_status'),
    cluster_changelog: () => import('./cluster-admin-bundle'),
    cluster_delta_detector: () => import('./insights'),
    config_drift_heatmap: () => import('./insights'),
    container_tetris: () => import('./arcade-bundle'),
    control_plane_health: () => import('./cluster-admin-bundle'),
    crio_status: () => import('./crio_status'),
    cross_cluster_event_correlation: () => import('./insights'),
    crossplane_managed_resources: () => import('./crossplane-status'),
    cubefs_status: () => import('./cubefs_status'),
    deployment_rollout_tracker: () => import('./insights'),
    dragonfly_status: () => import('./dragonfly_status'),
    drasi_pipelines: () => import('./DrasiPipelines'),
    drasi_reactive_graph: () => import('./drasi'),
    dynamic_card: () => import('./DynamicCard'),
    etcd_status: () => import('./cluster-admin-bundle'),
    failover_timeline: () => import('./failover_timeline'),
    flappy_pod: () => import('./arcade-bundle'),
    flatcar_status: () => import('./flatcar_status'),
    fluid_status: () => import('./fluid_status'),
    game_2048: () => import('./arcade-bundle'),
    gateway_status: () => import('./GatewayStatus'),
    github_activity: () => import('./GitHubActivity'),
    iframe_embed: () => import('./IframeEmbed'),
    issue_activity_chart: () => import('./IssueActivityChart'),
    karmada_status: () => import('./karmada_status'),
    keda_status: () => import('./keda_status'),
    knative_status: () => import('./knative_status'),
    kserve_status: () => import('./kserve_status'),
    kube_bert: () => import('./arcade-bundle'),
    kube_chess: () => import('./arcade-bundle'),
    kube_doom: () => import('./arcade-bundle'),
    kube_galaga: () => import('./arcade-bundle'),
    kube_kart: () => import('./arcade-bundle'),
    kube_kong: () => import('./arcade-bundle'),
    kube_man: () => import('./arcade-bundle'),
    kube_pong: () => import('./arcade-bundle'),
    kube_snake: () => import('./arcade-bundle'),
    kubectl: () => import('./Kubectl'),
    kubedle: () => import('./arcade-bundle'),
    kuberay_fleet: () => import('./kuberay_fleet'),
    kubevela_status: () => import('./kubevela_status'),
    lima_status: () => import('./lima_status'),
    maintenance_windows: () => import('./cluster-admin-bundle'),
    match_game: () => import('./arcade-bundle'),
    missile_command: () => import('./arcade-bundle'),
    mobile_browser: () => import('./MobileBrowser'),
    network_utils: () => import('./NetworkUtils'),
    node_conditions: () => import('./cluster-admin-bundle'),
    node_debug: () => import('./cluster-admin-bundle'),
    node_invaders: () => import('./arcade-bundle'),
    openfeature_status: () => import('./openfeature_status'),
    openkruise_status: () => import('./openkruise_status'),
    openyurt_status: () => import('./openyurt_status'),
    pod_brothers: () => import('./arcade-bundle'),
    pod_crosser: () => import('./arcade-bundle'),
    pod_pitfall: () => import('./arcade-bundle'),
    pod_sweeper: () => import('./arcade-bundle'),
    predictive_health: () => import('./cluster-admin-bundle'),
    quota_heatmap: () => import('./cluster-admin-bundle'),
    rbac_explorer: () => import('./cluster-admin-bundle'),
    resource_imbalance_detector: () => import('./insights'),
    restart_correlation_matrix: () => import('./insights'),
    right_size_advisor: () => import('./insights'),
    rss_feed: () => import('./rss'),
    service_exports: () => import('./ServiceExports'),
    service_imports: () => import('./ServiceImports'),
    service_topology: () => import('./ServiceTopology'),
    slo_compliance: () => import('./slo_compliance'),
    solitaire: () => import('./arcade-bundle'),
    strimzi_status: () => import('./strimzi_status'),
    sudoku_game: () => import('./arcade-bundle'),
    trino_gateway: () => import('./trino_gateway'),
    user_management: () => import('./UserManagement'),
    volcano_status: () => import('./volcano_status'),
    wasmcloud_status: () => import('./wasmcloud_status'),
  },
  defaultWidths: {
    admission_webhooks: 6,
    artifact_hub_status: 6,
    buildpacks_status: 6,
    cascade_impact_map: 6,
    change_timeline: 6,
    chaos_mesh_status: 6,
    checkers: 6,
    cloudevents_status: 6,
    cluster_changelog: 6,
    cluster_delta_detector: 6,
    config_drift_heatmap: 6,
    container_tetris: 6,
    control_plane_health: 4,
    crio_status: 6,
    cross_cluster_event_correlation: 6,
    crossplane_managed_resources: 4,
    deployment_rollout_tracker: 6,
    dragonfly_status: 6,
    drasi_pipelines: 6,
    drasi_reactive_graph: 12,
    etcd_status: 4,
    failover_timeline: 8,
    flappy_pod: 6,
    flatcar_status: 6,
    fluid_status: 6,
    game_2048: 5,
    gateway_status: 6,
    github_activity: 8,
    iframe_embed: 6,
    issue_activity_chart: 12,
    karmada_status: 6,
    keda_status: 6,
    kserve_status: 6,
    kube_bert: 5,
    kube_chess: 5,
    kube_doom: 6,
    kube_galaga: 5,
    kube_kart: 5,
    kube_kong: 6,
    kube_man: 6,
    kube_pong: 5,
    kube_snake: 5,
    kubectl: 8,
    kubedle: 6,
    kuberay_fleet: 6,
    kubevela_status: 6,
    lima_status: 6,
    maintenance_windows: 6,
    match_game: 6,
    missile_command: 6,
    mobile_browser: 5,
    network_utils: 5,
    node_conditions: 6,
    node_debug: 6,
    node_invaders: 6,
    openfeature_status: 6,
    openkruise_status: 6,
    openyurt_status: 6,
    pod_brothers: 6,
    pod_crosser: 6,
    pod_pitfall: 6,
    pod_sweeper: 6,
    predictive_health: 8,
    quota_heatmap: 8,
    rbac_explorer: 6,
    resource_imbalance_detector: 6,
    restart_correlation_matrix: 6,
    right_size_advisor: 8,
    rss_feed: 6,
    service_exports: 6,
    service_imports: 6,
    service_topology: 8,
    slo_compliance: 6,
    solitaire: 6,
    strimzi_status: 6,
    sudoku_game: 6,
    trino_gateway: 6,
    user_management: 6,
    volcano_status: 6,
    wasmcloud_status: 6,
  },
}
