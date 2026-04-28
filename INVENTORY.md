# KubeStellar Console — Component Inventory

This document lists the dashboard card components and their source file locations.
The Auto-QA workflow uses this file to verify component consistency.

## Dashboard Card Components

| Component | File | Type |
|-----------|------|------|
| ClusterHealth | web/src/components/cards/ClusterHealth.tsx | `cluster_health` |
| EventStream | web/src/components/cards/EventStream.tsx | `event_stream` |
| EventSummary | web/src/components/cards/EventSummary.tsx | `event_summary` |
| WarningEvents | web/src/components/cards/WarningEvents.tsx | `warning_events` |
| RecentEvents | web/src/components/cards/RecentEvents.tsx | `recent_events` |
| PodIssues | web/src/components/cards/PodIssues.tsx | `pod_issues` |
| TopPods | web/src/components/cards/TopPods.tsx | `top_pods` |
| AppStatus | web/src/components/cards/AppStatus.tsx | `app_status` |
| ResourceUsage | web/src/components/cards/ResourceUsage.tsx | `resource_usage` |
| ClusterMetrics | web/src/components/cards/ClusterMetrics.tsx | `cluster_metrics` |
| DeploymentStatus | web/src/components/cards/DeploymentStatus.tsx | `deployment_status` |
| DeploymentProgress | web/src/components/cards/DeploymentProgress.tsx | `deployment_progress` |
| DeploymentIssues | web/src/components/cards/DeploymentIssues.tsx | `deployment_issues` |
| GitOpsDrift | web/src/components/cards/GitOpsDrift.tsx | `gitops_drift` |
| UpgradeStatus | web/src/components/cards/UpgradeStatus.tsx | `upgrade_status` |
| ResourceCapacity | web/src/components/cards/ResourceCapacity.tsx | `resource_capacity` |
| GPUInventory | web/src/components/cards/GPUInventory.tsx | `gpu_inventory` |
| GPUStatus | web/src/components/cards/GPUStatus.tsx | `gpu_status` |
| GPUOverview | web/src/components/cards/GPUOverview.tsx | `gpu_overview` |
| GPUWorkloads | web/src/components/cards/GPUWorkloads.tsx | `gpu_workloads` |
| GPUNamespaceAllocations | web/src/components/cards/GPUNamespaceAllocations.tsx | `gpu_namespace_allocations` |
| SecurityIssues | web/src/components/cards/SecurityIssues.tsx | `security_issues` |
| EventsTimeline | web/src/components/cards/EventsTimeline.tsx | `events_timeline` |
| PodHealthTrend | web/src/components/cards/PodHealthTrend.tsx | `pod_health_trend` |
| ResourceTrend | web/src/components/cards/ResourceTrend.tsx | `resource_trend` |
| GPUUtilization | web/src/components/cards/GPUUtilization.tsx | `gpu_utilization` |
| GPUUsageTrend | web/src/components/cards/GPUUsageTrend.tsx | `gpu_usage_trend` |
| StorageOverview | web/src/components/cards/StorageOverview.tsx | `storage_overview` |
| PVCStatus | web/src/components/cards/PVCStatus.tsx | `pvc_status` |
| NetworkOverview | web/src/components/cards/NetworkOverview.tsx | `network_overview` |
| ServiceStatus | web/src/components/cards/ServiceStatus.tsx | `service_status` |
| ComputeOverview | web/src/components/cards/ComputeOverview.tsx | `compute_overview` |
| ClusterFocus | web/src/components/cards/ClusterFocus.tsx | `cluster_focus` |
| ClusterComparison | web/src/components/cards/ClusterComparison.tsx | `cluster_comparison` |
| ClusterCosts | web/src/components/cards/ClusterCosts.tsx | `cluster_costs` |
| ClusterNetwork | web/src/components/cards/ClusterNetwork.tsx | `cluster_network` |
| ClusterLocations | web/src/components/cards/ClusterLocations.tsx | `cluster_locations` |
| NamespaceOverview | web/src/components/cards/NamespaceOverview.tsx | `namespace_overview` |
| NamespaceQuotas | web/src/components/cards/NamespaceQuotas.tsx | `namespace_quotas` |
| NamespaceRBAC | web/src/components/cards/NamespaceRBAC.tsx | `namespace_rbac` |
| NamespaceEvents | web/src/components/cards/NamespaceEvents.tsx | `namespace_events` |
| NamespaceMonitor | web/src/components/cards/NamespaceMonitor.tsx | `namespace_monitor` |
| OperatorStatus | web/src/components/cards/OperatorStatus.tsx | `operator_status` |
| OperatorSubscriptions | web/src/components/cards/OperatorSubscriptions.tsx | `operator_subscriptions` |
| CRDHealth | web/src/components/cards/CRDHealth.tsx | `crd_health` |
| HelmReleaseStatus | web/src/components/cards/HelmReleaseStatus.tsx | `helm_release_status` |
| HelmValuesDiff | web/src/components/cards/HelmValuesDiff.tsx | `helm_values_diff` |
| HelmHistory | web/src/components/cards/HelmHistory.tsx | `helm_history` |
| ChartVersions | web/src/components/cards/ChartVersions.tsx | `chart_versions` |
| KustomizationStatus | web/src/components/cards/KustomizationStatus.tsx | `kustomization_status` |
| OverlayComparison | web/src/components/cards/OverlayComparison.tsx | `overlay_comparison` |
| ArgoCDApplications | web/src/components/cards/ArgoCDApplications.tsx | `argocd_applications` |
| ArgoCDApplicationSets | web/src/components/cards/ArgoCDApplicationSets.tsx | `argocd_applicationsets` |
| ArgoCDSyncStatus | web/src/components/cards/ArgoCDSyncStatus.tsx | `argocd_sync_status` |
| ArgoCDHealth | web/src/components/cards/ArgoCDHealth.tsx | `argocd_health` |
| UserManagement | web/src/components/cards/UserManagement.tsx | `user_management` |
| HardwareHealthCard | web/src/components/cards/HardwareHealthCard.tsx | `hardware_health` |
| ProactiveGPUNodeHealthMonitor | web/src/components/cards/ProactiveGPUNodeHealthMonitor.tsx | `gpu_node_health` |
| AlertRules | web/src/components/cards/AlertRules.tsx | `alert_rules` |
| ActiveAlerts | web/src/components/cards/ActiveAlerts.tsx | `active_alerts` |
| OpenCostOverview | web/src/components/cards/OpenCostOverview.tsx | `opencost_overview` |
| KubecostOverview | web/src/components/cards/KubecostOverview.tsx | `kubecost_overview` |
| OPAPolicies | web/src/components/cards/OPAPolicies.tsx | `opa_policies` |
| KyvernoPolicies | web/src/components/cards/KyvernoPolicies.tsx | `kyverno_policies` |
| ComplianceCards | web/src/components/cards/ComplianceCards.tsx | `falco_alerts` |
| TrestleScan | web/src/components/cards/TrestleScan.tsx | `trestle_scan` |
| DataComplianceCards | web/src/components/cards/DataComplianceCards.tsx | `vault_secrets` |
| FleetComplianceHeatmap | web/src/components/cards/FleetComplianceHeatmap.tsx | `fleet_compliance_heatmap` |
| ComplianceDrift | web/src/components/cards/ComplianceDrift.tsx | `compliance_drift` |
| CrossClusterPolicyComparison | web/src/components/cards/CrossClusterPolicyComparison.tsx | `cross_cluster_policy_comparison` |
| RecommendedPolicies | web/src/components/cards/RecommendedPolicies.tsx | `recommended_policies` |
| GitHubActivity | web/src/components/cards/GitHubActivity.tsx | `github_activity` |
| ServiceExports | web/src/components/cards/ServiceExports.tsx | `service_exports` |
| ServiceImports | web/src/components/cards/ServiceImports.tsx | `service_imports` |
| GatewayStatus | web/src/components/cards/GatewayStatus.tsx | `gateway_status` |
| ServiceTopology | web/src/components/cards/ServiceTopology.tsx | `service_topology` |
| WorkloadDeployment | web/src/components/cards/WorkloadDeployment.tsx | `workload_deployment` |
| ClusterGroups | web/src/components/cards/ClusterGroups.tsx | `cluster_groups` |
| Missions | web/src/components/cards/Missions.tsx | `deployment_missions` |
| ResourceMarshall | web/src/components/cards/ResourceMarshall.tsx | `resource_marshall` |
| DynamicCard | web/src/components/cards/DynamicCard.tsx | `dynamic_card` |
| IframeEmbed | web/src/components/cards/IframeEmbed.tsx | `iframe_embed` |
| NetworkUtils | web/src/components/cards/NetworkUtils.tsx | `network_utils` |
| MobileBrowser | web/src/components/cards/MobileBrowser.tsx | `mobile_browser` |
| Kubectl | web/src/components/cards/Kubectl.tsx | `kubectl` |
| ProviderHealth | web/src/components/cards/ProviderHealth.tsx | `provider_health` |
| ControlPlaneHealth | web/src/components/cards/ControlPlaneHealth.tsx | `control_plane_health` |
| NodeConditions | web/src/components/cards/NodeConditions.tsx | `node_conditions` |
| DNSHealth | web/src/components/cards/DNSHealth.tsx | `dns_health` |
| EtcdStatus | web/src/components/cards/EtcdStatus.tsx | `etcd_status` |
| NetworkPolicyCoverage | web/src/components/cards/NetworkPolicyCoverage.tsx | `network_policies` |
| RBACExplorer | web/src/components/cards/RBACExplorer.tsx | `rbac_explorer` |
| MaintenanceWindows | web/src/components/cards/MaintenanceWindows.tsx | `maintenance_windows` |
| ClusterChangelog | web/src/components/cards/ClusterChangelog.tsx | `cluster_changelog` |
| QuotaHeatmap | web/src/components/cards/QuotaHeatmap.tsx | `quota_heatmap` |
| AdmissionWebhooks | web/src/components/cards/AdmissionWebhooks.tsx | `admission_webhooks` |
| PredictiveHealth | web/src/components/cards/PredictiveHealth.tsx | `predictive_health` |
| NodeDebug | web/src/components/cards/NodeDebug.tsx | `node_debug` |

## Subdirectory Card Components

| Component | File | Type |
|-----------|------|------|
| ClusterResourceTree | web/src/components/cards/cluster-resource-tree/ClusterResourceTree.tsx | `cluster_resource_tree` |
| ConsoleIssuesCard | web/src/components/cards/console-missions/ConsoleIssuesCard.tsx | `console_ai_issues` |
| ConsoleKubeconfigAuditCard | web/src/components/cards/console-missions/ConsoleKubeconfigAuditCard.tsx | `console_ai_kubeconfig_audit` |
| ConsoleHealthCheckCard | web/src/components/cards/console-missions/ConsoleHealthCheckCard.tsx | `console_ai_health_check` |
| ConsoleOfflineDetectionCard | web/src/components/cards/console-missions/ConsoleOfflineDetectionCard.tsx | `console_ai_offline_detection` |
| Weather | web/src/components/cards/weather/Weather.tsx | `weather` |
| StockMarketTicker | web/src/components/cards/StockMarketTicker.tsx | `stock_market_ticker` |
| ProwJobs | web/src/components/cards/workload-detection/ProwJobs.tsx | `prow_jobs` |
| ProwStatus | web/src/components/cards/workload-detection/ProwStatus.tsx | `prow_status` |
| ProwHistory | web/src/components/cards/workload-detection/ProwHistory.tsx | `prow_history` |
| LLMInference | web/src/components/cards/workload-detection/LLMInference.tsx | `llm_inference` |
| LLMModels | web/src/components/cards/workload-detection/LLMModels.tsx | `llm_models` |
| MLJobs | web/src/components/cards/workload-detection/MLJobs.tsx | `ml_jobs` |
| MLNotebooks | web/src/components/cards/workload-detection/MLNotebooks.tsx | `ml_notebooks` |
| WorkloadMonitor | web/src/components/cards/workload-monitor/WorkloadMonitor.tsx | `workload_monitor` |
| LLMdStackMonitor | web/src/components/cards/workload-monitor/LLMdStackMonitor.tsx | `llmd_stack_monitor` |
| ProwCIMonitor | web/src/components/cards/workload-monitor/ProwCIMonitor.tsx | `prow_ci_monitor` |
| GitHubCIMonitor | web/src/components/cards/workload-monitor/GitHubCIMonitor.tsx | `github_ci_monitor` |
| ClusterHealthMonitor | web/src/components/cards/workload-monitor/ClusterHealthMonitor.tsx | `cluster_health_monitor` |
| KagentiStatusCard | web/src/components/cards/KagentiStatusCard.tsx | `kagenti_status` |
| KagentiAgentFleet | web/src/components/cards/kagenti/KagentiAgentFleet.tsx | `kagenti_agent_fleet` |
| KagentiBuildPipeline | web/src/components/cards/kagenti/KagentiBuildPipeline.tsx | `kagenti_build_pipeline` |
| KagentiToolRegistry | web/src/components/cards/kagenti/KagentiToolRegistry.tsx | `kagenti_tool_registry` |
| KagentiAgentDiscovery | web/src/components/cards/kagenti/KagentiAgentDiscovery.tsx | `kagenti_agent_discovery` |
| KagentiSecurity | web/src/components/cards/kagenti/KagentiSecurity.tsx | `kagenti_security` |
| KagentiSecurityPosture | web/src/components/cards/kagenti/KagentiSecurityPosture.tsx | `kagenti_security_posture` |
| KagentiTopology | web/src/components/cards/kagenti/KagentiTopology.tsx | `kagenti_topology` |
| RSSFeed | web/src/components/cards/rss/RSSFeed.tsx | `rss_feed` |

## Operator / Ecosystem Status Cards

| Component | File | Type |
|-----------|------|------|
| BuildpacksStatus | web/src/components/cards/buildpacks-status/index.ts | `buildpacks_status` |
| FlatcarStatus | web/src/components/cards/flatcar_status/index.tsx | `flatcar_status` |
| CoreDNSStatus | web/src/components/cards/coredns_status/index.ts | `coredns_status` |
| KedaStatus | web/src/components/cards/keda_status/index.ts | `keda_status` |
| FluentdStatus | web/src/components/cards/fluentd_status/index.ts | `fluentd_status` |
| CrioStatus | web/src/components/cards/crio_status/index.ts | `crio_status` |
| LimaStatus | web/src/components/cards/lima_status/index.ts | `lima_status` |
| CloudEventsStatus | web/src/components/cards/cloudevents_status/index.ts | `cloudevents_status` |
| StrimziStatus | web/src/components/cards/strimzi_status/index.ts | `strimzi_status` |
| KubeVelaStatus | web/src/components/cards/kubevela_status/index.ts | `kubevela_status` |
| KarmadaStatus | web/src/components/cards/karmada_status/index.ts | `karmada_status` |
| ThanosStatus | web/src/components/cards/thanos_status/index.tsx | `thanos_status` |
| CrossplaneManagedResources | web/src/components/cards/crossplane-status/CrossplaneManagedResources.tsx | `crossplane_managed_resources` |

## Multi-Tenancy Cards

| Component | File | Type |
|-----------|------|------|
| MultiTenancyOverview | web/src/components/cards/multi-tenancy/multi-tenancy-overview/MultiTenancyOverview.tsx | `multi_tenancy_overview` |
| TenantTopology | web/src/components/cards/multi-tenancy/tenant-topology/TenantTopology.tsx | `tenant_topology` |

## LLM-d Cards

| Component | File | Type |
|-----------|------|------|
| LLMdFlow | web/src/components/cards/llmd/LLMdFlow.tsx | `llmd_flow` |
| KVCacheMonitor | web/src/components/cards/llmd/KVCacheMonitor.tsx | `kvcache_monitor` |
| EPPRouting | web/src/components/cards/llmd/EPPRouting.tsx | `epp_routing` |
| PDDisaggregation | web/src/components/cards/llmd/PDDisaggregation.tsx | `pd_disaggregation` |
| LLMdAIInsights | web/src/components/cards/llmd/LLMdAIInsights.tsx | `llmd_ai_insights` |
| LLMdConfigurator | web/src/components/cards/llmd/LLMdConfigurator.tsx | `llmd_configurator` |
| NightlyE2EStatus | web/src/components/cards/llmd/index.ts | `nightly_e2e_status` |
| BenchmarkHero | web/src/components/cards/llmd/BenchmarkHero.tsx | `benchmark_hero` |
| ParetoFrontier | web/src/components/cards/llmd/ParetoFrontier.tsx | `pareto_frontier` |
| HardwareLeaderboard | web/src/components/cards/llmd/HardwareLeaderboard.tsx | `hardware_leaderboard` |
| LatencyBreakdown | web/src/components/cards/llmd/LatencyBreakdown.tsx | `latency_breakdown` |
| ThroughputComparison | web/src/components/cards/llmd/ThroughputComparison.tsx | `throughput_comparison` |
| PerformanceTimeline | web/src/components/cards/llmd/PerformanceTimeline.tsx | `performance_timeline` |
| ResourceUtilization | web/src/components/cards/llmd/ResourceUtilization.tsx | `resource_utilization` |

## Multi-Cluster Insights Cards

| Component | File | Type |
|-----------|------|------|
| CrossClusterEventCorrelation | web/src/components/cards/insights/CrossClusterEventCorrelation.tsx | `cross_cluster_event_correlation` |
| ClusterDeltaDetector | web/src/components/cards/insights/ClusterDeltaDetector.tsx | `cluster_delta_detector` |
| CascadeImpactMap | web/src/components/cards/insights/CascadeImpactMap.tsx | `cascade_impact_map` |
| ConfigDriftHeatmap | web/src/components/cards/insights/ConfigDriftHeatmap.tsx | `config_drift_heatmap` |
| ResourceImbalanceDetector | web/src/components/cards/insights/ResourceImbalanceDetector.tsx | `resource_imbalance_detector` |
| RestartCorrelationMatrix | web/src/components/cards/insights/RestartCorrelationMatrix.tsx | `restart_correlation_matrix` |
| DeploymentRolloutTracker | web/src/components/cards/insights/DeploymentRolloutTracker.tsx | `deployment_rollout_tracker` |

## Game / Entertainment Cards

| Component | File | Type |
|-----------|------|------|
| SudokuGame | web/src/components/cards/SudokuGame.tsx | `sudoku_game` |
| MatchGame | web/src/components/cards/MatchGame.tsx | `match_game` |
| Solitaire | web/src/components/cards/Solitaire.tsx | `solitaire` |
| Checkers | web/src/components/cards/Checkers.tsx | `checkers` |
| Game2048 | web/src/components/cards/Game2048.tsx | `game_2048` |
| Kubedle | web/src/components/cards/Kubedle.tsx | `kubedle` |
| PodSweeper | web/src/components/cards/PodSweeper.tsx | `pod_sweeper` |
| ContainerTetris | web/src/components/cards/ContainerTetris.tsx | `container_tetris` |
| FlappyPod | web/src/components/cards/FlappyPod.tsx | `flappy_pod` |
| KubeMan | web/src/components/cards/KubeMan.tsx | `kube_man` |
| KubeKong | web/src/components/cards/KubeKong.tsx | `kube_kong` |
| PodPitfall | web/src/components/cards/PodPitfall.tsx | `pod_pitfall` |
| NodeInvaders | web/src/components/cards/NodeInvaders.tsx | `node_invaders` |
| MissileCommand | web/src/components/cards/MissileCommand.tsx | `missile_command` |
| PodCrosser | web/src/components/cards/PodCrosser.tsx | `pod_crosser` |
| PodBrothers | web/src/components/cards/PodBrothers.tsx | `pod_brothers` |
| KubeKart | web/src/components/cards/KubeKart.tsx | `kube_kart` |
| KubePong | web/src/components/cards/KubePong.tsx | `kube_pong` |
| KubeSnake | web/src/components/cards/KubeSnake.tsx | `kube_snake` |
| KubeGalaga | web/src/components/cards/KubeGalaga.tsx | `kube_galaga` |
| KubeBert | web/src/components/cards/KubeBert.tsx | `kube_bert` |
| KubeDoom | web/src/components/cards/KubeDoom.tsx | `kube_doom` |
| KubeChess | web/src/components/cards/KubeChess.tsx | `kube_chess` |
