/**
 * Card Configuration Registry
 *
 * Adding a new card? Update ALL of these:
 *
 * 1. Create config:       src/config/cards/<card-name>.ts
 * 2. Register config:     src/config/cards/index.ts          (import + add to CARD_CONFIGS)
 * 3. Create component:    src/components/cards/<CardName>.tsx
 * 4. Register component:  src/components/cards/cardRegistry.ts (lazy import + add to CARD_COMPONENTS)
 * 5. Add to browse catalog: src/components/dashboard/AddCardModal.tsx (add to CARD_CATALOG)
 *    ↑ WITHOUT THIS the card won't appear in the "Add Cards" browse dialog.
 */

import type { UnifiedCardConfig, CardConfigRegistry } from '../../lib/unified/types'
import { isVisibleForProject } from '../../lib/project/context'

import { activeAlertsConfig } from './active-alerts'
import { alertRulesConfig } from './alert-rules'
import { appStatusConfig } from './app-status'
import { argocdApplicationsConfig } from './argocd-applications'
import { argocdHealthConfig } from './argocd-health'
import { argocdSyncStatusConfig } from './argocd-sync-status'
import { certManagerConfig } from './cert-manager'
import { chartVersionsConfig } from './chart-versions'
import { checkersConfig } from './checkers'
import { ciliumStatusConfig } from './cilium-status'
import { clusterComparisonConfig } from './cluster-comparison'
import { clusterCostsConfig } from './cluster-costs'
import { clusterFocusConfig } from './cluster-focus'
import { clusterGroupsConfig } from './cluster-groups'
import { clusterHealthConfig } from './cluster-health'
import { clusterHealthMonitorConfig } from './cluster-health-monitor'
import { clusterLocationsConfig } from './cluster-locations'
import { clusterMetricsConfig } from './cluster-metrics'
import { clusterNetworkConfig } from './cluster-network'
import { clusterResourceTreeConfig } from './cluster-resource-tree'
import { complianceScoreConfig } from './compliance-score'
import { computeOverviewConfig } from './compute-overview'
import { configMapStatusConfig } from './configmap-status'
import { cubefsStatusConfig } from './cubefs-status'
import { consoleAiHealthCheckConfig } from './console-ai-health-check'
import { consoleAiIssuesConfig } from './console-ai-issues'
import { consoleAiKubeconfigAuditConfig } from './console-ai-kubeconfig-audit'
import { consoleAiOfflineDetectionConfig } from './console-ai-offline-detection'
import { containerTetrisConfig } from './container-tetris'
import { crdHealthConfig } from './crd-health'
import { cronJobStatusConfig } from './cronjob-status'
import { daemonSetStatusConfig } from './daemonset-status'
import { deploymentIssuesConfig } from './deployment-issues'
import { deploymentMissionsConfig } from './deployment-missions'
import { deploymentProgressConfig } from './deployment-progress'
import { deploymentStatusConfig } from './deployment-status'
import { dynamicCardConfig } from './dynamic-card'
import { eventStreamConfig } from './event-stream'
import { eventSummaryConfig } from './event-summary'
import { eventsTimelineConfig } from './events-timeline'
import { externalSecretsConfig } from './external-secrets'
import { falcoAlertsConfig } from './falco-alerts'
import { flappyPodConfig } from './flappy-pod'
import { game2048Config } from './game-2048'
import { gatewayStatusConfig } from './gateway-status'
import { githubActivityConfig } from './github-activity'
import { githubCiMonitorConfig } from './github-ci-monitor'
import { fluxStatusConfig } from './flux-status'
import { backstageStatusConfig } from './backstage-status'
import { contourStatusConfig } from './contour-status'
import { cloudCustodianStatusConfig } from './cloud-custodian-status'
import { containerdStatusConfig } from './containerd-status'
import { cortexStatusConfig } from './cortex-status'
import { daprStatusConfig } from './dapr-status'
import { dragonflyStatusConfig } from './dragonfly-status'
import { envoyStatusConfig } from './envoy-status'
import { grpcStatusConfig } from './grpc-status'
import { kedaStatusConfig } from './keda-status'
import { linkerdStatusConfig } from './linkerd-status'
import { otelStatusConfig } from './otel-status'
import { rookStatusConfig } from './rook-status'
import { tikvStatusConfig } from './tikv-status'
import { tufStatusConfig } from './tuf-status'
import { vitessStatusConfig } from './vitess-status'
import { nightlyReleasePulseConfig } from './nightly-release-pulse'
import { workflowMatrixConfig } from './workflow-matrix'
import { pipelineFlowConfig } from './pipeline-flow'
import { recentFailuresConfig } from './recent-failures'
import { gitopsDriftConfig } from './gitops-drift'
import { gpuInventoryConfig } from './gpu-inventory'
import { gpuInventoryHistoryConfig } from './gpu-inventory-history'
import { gpuOverviewConfig } from './gpu-overview'
import { gpuStatusConfig } from './gpu-status'
import { gpuUsageTrendConfig } from './gpu-usage-trend'
import { gpuUtilizationConfig } from './gpu-utilization'
import { gpuNodeHealthConfig } from './gpu-node-health'
import { gpuWorkloadsConfig } from './gpu-workloads'
import { hardwareHealthConfig } from './hardware-health'
import { helmHistoryConfig } from './helm-history'
import { helmReleaseStatusConfig } from './helm-release-status'
import { helmValuesDiffConfig } from './helm-values-diff'
import { hpaStatusConfig } from './hpa-status'
import { iframeEmbedConfig } from './iframe-embed'
import { ingressStatusConfig } from './ingress-status'
import { jobStatusConfig } from './job-status'
import { kubeBertConfig } from './kube-bert'
import { kubeChessConfig } from './kube-chess'
import { kubeDoomConfig } from './kube-doom'
import { kubeGalagaConfig } from './kube-galaga'
import { kubeKartConfig } from './kube-kart'
import { kubeKongConfig } from './kube-kong'
import { kubeManConfig } from './kube-man'
import { kubePongConfig } from './kube-pong'
import { kubeSnakeConfig } from './kube-snake'
import { kubecostOverviewConfig } from './kubecost-overview'
import { kubectlConfig } from './kubectl'
import { kubedleConfig } from './kubedle'
import { kubescapeScanConfig } from './kubescape-scan'
import { kubevirtStatusConfig } from './kubevirt-status'
import { kustomizationStatusConfig } from './kustomization-status'
import { keycloakStatusConfig } from './keycloak-status'
import { kyvernoPoliciesConfig } from './kyverno-policies'
import { limitRangeStatusConfig } from './limit-range-status'
import { llmInferenceConfig } from './llm-inference'
import { llmModelsConfig } from './llm-models'
import { llmdStackMonitorConfig } from './llmd-stack-monitor'
import { matchGameConfig } from './match-game'
import { mlJobsConfig } from './ml-jobs'
import { mlNotebooksConfig } from './ml-notebooks'
import { mobileBrowserConfig } from './mobile-browser'
import { namespaceEventsConfig } from './namespace-events'
import { namespaceMonitorConfig } from './namespace-monitor'
import { namespaceOverviewConfig } from './namespace-overview'
import { namespaceQuotasConfig } from './namespace-quotas'
import { namespaceRbacConfig } from './namespace-rbac'
import { namespaceStatusConfig } from './namespace-status'
import { nightlyE2eStatusConfig } from './nightly-e2e-status'
import { networkOverviewConfig } from './network-overview'
import { networkPolicyStatusConfig } from './network-policy-status'
import { networkUtilsConfig } from './network-utils'
import { nodeInvadersConfig } from './node-invaders'
import { missileCommandConfig } from './missile-command'
import { nodeStatusConfig } from './node-status'
import { opaPoliciesConfig } from './opa-policies'
import { opencostOverviewConfig } from './opencost-overview'
import { operatorStatusConfig } from './operator-status'
import { operatorSubscriptionStatusConfig } from './operator-subscription-status'
import { overlayComparisonConfig } from './overlay-comparison'
import { podBrothersConfig } from './pod-brothers'
import { podCrosserConfig } from './pod-crosser'
import { podHealthTrendConfig } from './pod-health-trend'
import { podIssuesConfig } from './pod-issues'
import { podLogsConfig } from './pod-logs'
import { podPitfallConfig } from './pod-pitfall'
import { podSweeperConfig } from './pod-sweeper'
import { policyViolationsConfig } from './policy-violations'
import { providerHealthConfig } from './provider-health'
import { prowCiMonitorConfig } from './prow-ci-monitor'
import { prowHistoryConfig } from './prow-history'
import { prowJobsConfig } from './prow-jobs'
import harborStatusConfig from './harbor-status'
import deploymentRiskScoreConfig from './deployment-risk-score'
import { prowStatusConfig } from './prow-status'
import { pvStatusConfig } from './pv-status'
import { pvcStatusConfig } from './pvc-status'
import { recentEventsConfig } from './recent-events'
import { replicaSetStatusConfig } from './replicaset-status'
import { resourceCapacityConfig } from './resource-capacity'
import { resourceMarshallConfig } from './resource-marshall'
import { resourceQuotaStatusConfig } from './resource-quota-status'
import { resourceTrendConfig } from './resource-trend'
import { resourceUsageConfig } from './resource-usage'
import { roleBindingStatusConfig } from './role-binding-status'
import { roleStatusConfig } from './role-status'
import { rssFeedConfig } from './rss-feed'
import { secretStatusConfig } from './secret-status'
import { securityIssuesConfig } from './security-issues'
import { serviceAccountStatusConfig } from './service-account-status'
import { serviceExportsConfig } from './service-exports'
import { serviceImportsConfig } from './service-imports'
import { serviceStatusConfig } from './service-status'
import { serviceTopologyConfig } from './service-topology'
import { solitaireConfig } from './solitaire'
import { spiffeStatusConfig } from './spiffe-status'
import { statefulSetStatusConfig } from './statefulset-status'
import { stockMarketTickerConfig } from './stock-market-ticker'
import { storageOverviewConfig } from './storage-overview'
import { sudokuGameConfig } from './sudoku-game'
import { topPodsConfig } from './top-pods'
import { trestleScanConfig } from './trestle-scan'
import { trivyScanConfig } from './trivy-scan'
import { upgradeStatusConfig } from './upgrade-status'
import { userManagementConfig } from './user-management'
import { vaultSecretsConfig } from './vault-secrets'
import { vclusterStatusConfig } from './vcluster-status'
import { warningEventsConfig } from './warning-events'
import { weatherConfig } from './weather'
import { workloadDeploymentConfig } from './workload-deployment'
import { workloadMonitorConfig } from './workload-monitor'
import { crossClusterEventCorrelationConfig } from './cross-cluster-event-correlation'
import { clusterDeltaDetectorConfig } from './cluster-delta-detector'
import { cascadeImpactMapConfig } from './cascade-impact-map'
import { configDriftHeatmapConfig } from './config-drift-heatmap'
import { resourceImbalanceDetectorConfig } from './resource-imbalance-detector'
import { rightSizeAdvisorConfig } from './right-size-advisor'
import { restartCorrelationMatrixConfig } from './restart-correlation-matrix'
import { deploymentRolloutTrackerConfig } from './deployment-rollout-tracker'
import { fleetComplianceHeatmapConfig } from './fleet-compliance-heatmap'
import { complianceDriftConfig } from './compliance-drift'
import { crossClusterPolicyComparisonConfig } from './cross-cluster-policy-comparison'
import { recommendedPoliciesConfig } from './recommended-policies'
import { drasiReactiveGraphConfig } from './drasi-reactive-graph'
import { acmmLevelConfig } from './acmm-level'
import { acmmFeedbackLoopsConfig } from './acmm-feedback-loops'
import { acmmRecommendationsConfig } from './acmm-recommendations'

export const CARD_CONFIGS: CardConfigRegistry = {
  acmm_level: acmmLevelConfig,
  acmm_feedback_loops: acmmFeedbackLoopsConfig,
  acmm_recommendations: acmmRecommendationsConfig,
  active_alerts: activeAlertsConfig,
  alert_rules: alertRulesConfig,
  app_status: appStatusConfig,
  argocd_applications: argocdApplicationsConfig,
  argocd_health: argocdHealthConfig,
  argocd_sync_status: argocdSyncStatusConfig,
  cert_manager: certManagerConfig,
  chart_versions: chartVersionsConfig,
  checkers: checkersConfig,
  cilium_status: ciliumStatusConfig,
  cluster_comparison: clusterComparisonConfig,
  cluster_costs: clusterCostsConfig,
  cluster_focus: clusterFocusConfig,
  cluster_groups: clusterGroupsConfig,
  cluster_health: clusterHealthConfig,
  cluster_health_monitor: clusterHealthMonitorConfig,
  cluster_locations: clusterLocationsConfig,
  cluster_metrics: clusterMetricsConfig,
  cluster_network: clusterNetworkConfig,
  cluster_resource_tree: clusterResourceTreeConfig,
  compliance_score: complianceScoreConfig,
  compute_overview: computeOverviewConfig,
  configmap_status: configMapStatusConfig,
  cubefs_status: cubefsStatusConfig,
  console_ai_health_check: consoleAiHealthCheckConfig,
  console_ai_issues: consoleAiIssuesConfig,
  console_ai_kubeconfig_audit: consoleAiKubeconfigAuditConfig,
  console_ai_offline_detection: consoleAiOfflineDetectionConfig,
  container_tetris: containerTetrisConfig,
  crd_health: crdHealthConfig,
  cronjob_status: cronJobStatusConfig,
  daemonset_status: daemonSetStatusConfig,
  deployment_issues: deploymentIssuesConfig,
  deployment_missions: deploymentMissionsConfig,
  deployment_progress: deploymentProgressConfig,
  deployment_status: deploymentStatusConfig,
  dynamic_card: dynamicCardConfig,
  event_stream: eventStreamConfig,
  event_summary: eventSummaryConfig,
  events_timeline: eventsTimelineConfig,
  external_secrets: externalSecretsConfig,
  falco_alerts: falcoAlertsConfig,
  flappy_pod: flappyPodConfig,
  game_2048: game2048Config,
  gateway_status: gatewayStatusConfig,
  github_activity: githubActivityConfig,
  github_ci_monitor: githubCiMonitorConfig,
  flux_status: fluxStatusConfig,
  backstage_status: backstageStatusConfig,
  contour_status: contourStatusConfig,
  cloud_custodian_status: cloudCustodianStatusConfig,
  containerd_status: containerdStatusConfig,
  cortex_status: cortexStatusConfig,
  dapr_status: daprStatusConfig,
  dragonfly_status: dragonflyStatusConfig,
  envoy_status: envoyStatusConfig,
  grpc_status: grpcStatusConfig,
  keda_status: kedaStatusConfig,
  linkerd_status: linkerdStatusConfig,
  otel_status: otelStatusConfig,
  rook_status: rookStatusConfig,
  tikv_status: tikvStatusConfig,
  tuf_status: tufStatusConfig,
  vitess_status: vitessStatusConfig,
  nightly_release_pulse: nightlyReleasePulseConfig,
  workflow_matrix: workflowMatrixConfig,
  pipeline_flow: pipelineFlowConfig,
  recent_failures: recentFailuresConfig,
  gitops_drift: gitopsDriftConfig,
  gpu_inventory: gpuInventoryConfig,
  gpu_inventory_history: gpuInventoryHistoryConfig,
  gpu_node_health: gpuNodeHealthConfig,
  gpu_overview: gpuOverviewConfig,
  gpu_status: gpuStatusConfig,
  gpu_usage_trend: gpuUsageTrendConfig,
  gpu_utilization: gpuUtilizationConfig,
  gpu_workloads: gpuWorkloadsConfig,
  hardware_health: hardwareHealthConfig,
  helm_history: helmHistoryConfig,
  helm_release_status: helmReleaseStatusConfig,
  helm_values_diff: helmValuesDiffConfig,
  hpa_status: hpaStatusConfig,
  iframe_embed: iframeEmbedConfig,
  ingress_status: ingressStatusConfig,
  job_status: jobStatusConfig,
  kube_bert: kubeBertConfig,
  kube_chess: kubeChessConfig,
  kube_doom: kubeDoomConfig,
  kube_galaga: kubeGalagaConfig,
  kube_kart: kubeKartConfig,
  kube_kong: kubeKongConfig,
  kube_man: kubeManConfig,
  kube_pong: kubePongConfig,
  kube_snake: kubeSnakeConfig,
  kubecost_overview: kubecostOverviewConfig,
  kubectl: kubectlConfig,
  kubedle: kubedleConfig,
  kubescape_scan: kubescapeScanConfig,
  kubevirt_status: kubevirtStatusConfig,
  kustomization_status: kustomizationStatusConfig,
  keycloak_status: keycloakStatusConfig,
  kyverno_policies: kyvernoPoliciesConfig,
  limit_range_status: limitRangeStatusConfig,
  llm_inference: llmInferenceConfig,
  llm_models: llmModelsConfig,
  llmd_stack_monitor: llmdStackMonitorConfig,
  match_game: matchGameConfig,
  ml_jobs: mlJobsConfig,
  ml_notebooks: mlNotebooksConfig,
  mobile_browser: mobileBrowserConfig,
  namespace_events: namespaceEventsConfig,
  namespace_monitor: namespaceMonitorConfig,
  namespace_overview: namespaceOverviewConfig,
  namespace_quotas: namespaceQuotasConfig,
  namespace_rbac: namespaceRbacConfig,
  namespace_status: namespaceStatusConfig,
  nightly_e2e_status: nightlyE2eStatusConfig,
  network_overview: networkOverviewConfig,
  network_policy_status: networkPolicyStatusConfig,
  network_utils: networkUtilsConfig,
  node_invaders: nodeInvadersConfig,
  missile_command: missileCommandConfig,
  node_status: nodeStatusConfig,
  opa_policies: opaPoliciesConfig,
  opencost_overview: opencostOverviewConfig,
  operator_status: operatorStatusConfig,
  operator_subscription_status: operatorSubscriptionStatusConfig,
  overlay_comparison: overlayComparisonConfig,
  pod_brothers: podBrothersConfig,
  pod_crosser: podCrosserConfig,
  pod_health_trend: podHealthTrendConfig,
  pod_issues: podIssuesConfig,
  pod_logs: podLogsConfig,
  pod_pitfall: podPitfallConfig,
  pod_sweeper: podSweeperConfig,
  policy_violations: policyViolationsConfig,
  provider_health: providerHealthConfig,
  prow_ci_monitor: prowCiMonitorConfig,
  prow_history: prowHistoryConfig,
  prow_jobs: prowJobsConfig,
  prow_status: prowStatusConfig,
  pv_status: pvStatusConfig,
  pvc_status: pvcStatusConfig,
  recent_events: recentEventsConfig,
  replicaset_status: replicaSetStatusConfig,
  resource_capacity: resourceCapacityConfig,
  resource_marshall: resourceMarshallConfig,
  resource_quota_status: resourceQuotaStatusConfig,
  resource_trend: resourceTrendConfig,
  resource_usage: resourceUsageConfig,
  // Harbor registry
  harbor_status: harborStatusConfig,
  // Deployment Risk Score — correlates Argo CD + Kyverno + pod restarts (#9827)
  deployment_risk_score: deploymentRiskScoreConfig,
  role_binding_status: roleBindingStatusConfig,
  role_status: roleStatusConfig,
  rss_feed: rssFeedConfig,
  secret_status: secretStatusConfig,
  security_issues: securityIssuesConfig,
  service_account_status: serviceAccountStatusConfig,
  service_exports: serviceExportsConfig,
  service_imports: serviceImportsConfig,
  service_status: serviceStatusConfig,
  service_topology: serviceTopologyConfig,
  solitaire: solitaireConfig,
  spiffe_status: spiffeStatusConfig,
  statefulset_status: statefulSetStatusConfig,
  stock_market_ticker: stockMarketTickerConfig,
  storage_overview: storageOverviewConfig,
  sudoku_game: sudokuGameConfig,
  top_pods: topPodsConfig,
  trestle_scan: trestleScanConfig,
  trivy_scan: trivyScanConfig,
  upgrade_status: upgradeStatusConfig,
  user_management: userManagementConfig,
  vault_secrets: vaultSecretsConfig,
  vcluster_status: vclusterStatusConfig,
  warning_events: warningEventsConfig,
  weather: weatherConfig,
  workload_deployment: workloadDeploymentConfig,
  workload_monitor: workloadMonitorConfig,
  // Multi-cluster insights cards
  cross_cluster_event_correlation: crossClusterEventCorrelationConfig,
  cluster_delta_detector: clusterDeltaDetectorConfig,
  cascade_impact_map: cascadeImpactMapConfig,
  config_drift_heatmap: configDriftHeatmapConfig,
  resource_imbalance_detector: resourceImbalanceDetectorConfig,
  right_size_advisor: rightSizeAdvisorConfig,
  restart_correlation_matrix: restartCorrelationMatrixConfig,
  deployment_rollout_tracker: deploymentRolloutTrackerConfig,
  // Cross-cluster compliance cards
  fleet_compliance_heatmap: fleetComplianceHeatmapConfig,
  compliance_drift: complianceDriftConfig,
  cross_cluster_policy_comparison: crossClusterPolicyComparisonConfig,
  recommended_policies: recommendedPoliciesConfig,
  // Drasi cards
  drasi_reactive_graph: drasiReactiveGraphConfig,
}

/**
 * Project tags for cards that only exist in the component registry (no config file).
 * Cards with config files use the `projects` field on their UnifiedCardConfig instead.
 * Cards not listed here and without a config `projects` field are universal.
 */
export const CARD_PROJECT_TAGS: Record<string, string[]> = {
  // LLM-d benchmark cards (component-only, no config files)
  benchmark_hero: ['kubestellar'],
  pareto_frontier: ['kubestellar'],
  hardware_leaderboard: ['kubestellar'],
  latency_breakdown: ['kubestellar'],
  throughput_comparison: ['kubestellar'],
  performance_timeline: ['kubestellar'],
  resource_utilization: ['kubestellar'],
  // LLM-d architecture cards (component-only)
  llmd_flow: ['kubestellar'],
  kvcache_monitor: ['kubestellar'],
  epp_routing: ['kubestellar'],
  pd_disaggregation: ['kubestellar'],
  llmd_ai_insights: ['kubestellar'],
  llmd_configurator: ['kubestellar'],
  // Kagenti cards (component-only, shared with kagenti project)
  kagenti_status: ['kubestellar', 'kagenti'],
  kagenti_agent_fleet: ['kubestellar', 'kagenti'],
  kagenti_build_pipeline: ['kubestellar', 'kagenti'],
  kagenti_tool_registry: ['kubestellar', 'kagenti'],
  kagenti_agent_discovery: ['kubestellar', 'kagenti'],
  kagenti_security: ['kubestellar', 'kagenti'],
  kagenti_security_posture: ['kubestellar', 'kagenti'],
  kagenti_topology: ['kubestellar', 'kagenti'],
  // Kagent CRD cards (component-only, shared with kagent project)
  kagent_status: ['kubestellar', 'kagent'],
  kagent_agent_fleet: ['kubestellar', 'kagent'],
  kagent_tool_registry: ['kubestellar', 'kagent'],
  kagent_model_providers: ['kubestellar', 'kagent'],
  kagent_agent_discovery: ['kubestellar', 'kagent'],
  kagent_security: ['kubestellar', 'kagent'],
  kagent_topology: ['kubestellar', 'kagent'],
}

/**
 * Get the project tags for a card, checking both config file and fallback map.
 */
export function getCardProjectTags(cardType: string): string[] | undefined {
  const config = CARD_CONFIGS[cardType]
  if (config?.projects) return config.projects
  return CARD_PROJECT_TAGS[cardType]
}

export function getCardConfig(cardType: string): UnifiedCardConfig | undefined {
  return CARD_CONFIGS[cardType]
}

export function hasUnifiedConfig(cardType: string): boolean {
  // Use hasOwnProperty to avoid false positives from inherited Object.prototype
  // keys such as 'toString', 'constructor', '__proto__', etc.
  return Object.prototype.hasOwnProperty.call(CARD_CONFIGS, cardType)
}

export function getUnifiedCardTypes(): string[] {
  return Object.keys(CARD_CONFIGS)
}

/**
 * Get all card configs visible for the active project.
 * Checks both the config `projects` field and the CARD_PROJECT_TAGS fallback.
 */
export function getVisibleCardConfigs(): CardConfigRegistry {
  const result: CardConfigRegistry = {}
  for (const [key, config] of Object.entries(CARD_CONFIGS)) {
    const projects = config.projects || CARD_PROJECT_TAGS[key]
    if (isVisibleForProject(projects)) {
      result[key] = config
    }
  }
  return result
}

/**
 * Check if a card type (by ID) is visible for the active project.
 * Works for both config-based and component-only cards.
 */
export function isCardVisibleForProject(cardType: string): boolean {
  const projects = getCardProjectTags(cardType)
  return isVisibleForProject(projects)
}

// Re-export configs
export {
  acmmLevelConfig,
  acmmFeedbackLoopsConfig,
  acmmRecommendationsConfig,
  activeAlertsConfig,
  alertRulesConfig,
  appStatusConfig,
  argocdApplicationsConfig,
  argocdHealthConfig,
  argocdSyncStatusConfig,
  certManagerConfig,
  chartVersionsConfig,
  checkersConfig,
  ciliumStatusConfig,
  clusterComparisonConfig,
  clusterCostsConfig,
  clusterFocusConfig,
  clusterGroupsConfig,
  clusterHealthConfig,
  clusterHealthMonitorConfig,
  clusterLocationsConfig,
  clusterMetricsConfig,
  clusterNetworkConfig,
  clusterResourceTreeConfig,
  complianceScoreConfig,
  computeOverviewConfig,
  configMapStatusConfig,
  cubefsStatusConfig,
  consoleAiHealthCheckConfig,
  consoleAiIssuesConfig,
  consoleAiKubeconfigAuditConfig,
  consoleAiOfflineDetectionConfig,
  containerTetrisConfig,
  crdHealthConfig,
  cronJobStatusConfig,
  daemonSetStatusConfig,
  deploymentIssuesConfig,
  deploymentMissionsConfig,
  deploymentProgressConfig,
  deploymentStatusConfig,
  dynamicCardConfig,
  eventStreamConfig,
  eventSummaryConfig,
  eventsTimelineConfig,
  externalSecretsConfig,
  falcoAlertsConfig,
  flappyPodConfig,
  game2048Config,
  gatewayStatusConfig,
  githubActivityConfig,
  githubCiMonitorConfig,
  nightlyReleasePulseConfig,
  workflowMatrixConfig,
  pipelineFlowConfig,
  recentFailuresConfig,
  gitopsDriftConfig,
  gpuInventoryConfig,
  gpuInventoryHistoryConfig,
  gpuOverviewConfig,
  gpuStatusConfig,
  gpuUsageTrendConfig,
  gpuUtilizationConfig,
  gpuNodeHealthConfig,
  gpuWorkloadsConfig,
  helmHistoryConfig,
  helmReleaseStatusConfig,
  helmValuesDiffConfig,
  hpaStatusConfig,
  iframeEmbedConfig,
  ingressStatusConfig,
  jobStatusConfig,
  kubeBertConfig,
  kubeChessConfig,
  kubeDoomConfig,
  kubeGalagaConfig,
  kubeKartConfig,
  kubeKongConfig,
  kubeManConfig,
  kubePongConfig,
  kubeSnakeConfig,
  kubecostOverviewConfig,
  kubectlConfig,
  kubedleConfig,
  kubescapeScanConfig,
  kubevirtStatusConfig,
  kustomizationStatusConfig,
  kyvernoPoliciesConfig,
  limitRangeStatusConfig,
  llmInferenceConfig,
  llmModelsConfig,
  llmdStackMonitorConfig,
  matchGameConfig,
  mlJobsConfig,
  mlNotebooksConfig,
  mobileBrowserConfig,
  namespaceEventsConfig,
  namespaceMonitorConfig,
  namespaceOverviewConfig,
  namespaceQuotasConfig,
  namespaceRbacConfig,
  namespaceStatusConfig,
  networkOverviewConfig,
  networkPolicyStatusConfig,
  networkUtilsConfig,
  nodeInvadersConfig,
  missileCommandConfig,
  nodeStatusConfig,
  opaPoliciesConfig,
  opencostOverviewConfig,
  operatorStatusConfig,
  operatorSubscriptionStatusConfig,
  overlayComparisonConfig,
  podBrothersConfig,
  podCrosserConfig,
  podHealthTrendConfig,
  podIssuesConfig,
  podLogsConfig,
  podPitfallConfig,
  podSweeperConfig,
  policyViolationsConfig,
  providerHealthConfig,
  prowCiMonitorConfig,
  prowHistoryConfig,
  prowJobsConfig,
  prowStatusConfig,
  pvStatusConfig,
  pvcStatusConfig,
  recentEventsConfig,
  replicaSetStatusConfig,
  resourceCapacityConfig,
  resourceMarshallConfig,
  resourceQuotaStatusConfig,
  resourceTrendConfig,
  resourceUsageConfig,
  roleBindingStatusConfig,
  roleStatusConfig,
  rssFeedConfig,
  secretStatusConfig,
  securityIssuesConfig,
  serviceAccountStatusConfig,
  serviceExportsConfig,
  serviceImportsConfig,
  serviceStatusConfig,
  serviceTopologyConfig,
  solitaireConfig,
  spiffeStatusConfig,
  statefulSetStatusConfig,
  stockMarketTickerConfig,
  storageOverviewConfig,
  sudokuGameConfig,
  topPodsConfig,
  trestleScanConfig,
  trivyScanConfig,
  upgradeStatusConfig,
  userManagementConfig,
  vaultSecretsConfig,
  vclusterStatusConfig,
  warningEventsConfig,
  weatherConfig,
  workloadDeploymentConfig,
  workloadMonitorConfig,
  crossClusterEventCorrelationConfig,
  clusterDeltaDetectorConfig,
  cascadeImpactMapConfig,
  configDriftHeatmapConfig,
  resourceImbalanceDetectorConfig,
  restartCorrelationMatrixConfig,
  deploymentRolloutTrackerConfig,
  fleetComplianceHeatmapConfig,
  complianceDriftConfig,
  crossClusterPolicyComparisonConfig,
}
