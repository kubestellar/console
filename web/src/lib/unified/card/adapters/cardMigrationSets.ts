/**
 * cardMigrationSets - Data-only card type membership sets used to decide
 * whether a card type should render via UnifiedCard or a legacy component.
 *
 * Extracted from UnifiedCardAdapter.tsx to keep the adapter component and
 * its helper functions focused on the decision logic rather than the bulk
 * of card-type data.
 */

/**
 * Cards that have been validated to work correctly with UnifiedCard.
 *
 * Before adding a card here:
 * 1. Verify the card config in config/cards/*.ts is complete
 * 2. Test that UnifiedCard renders data correctly
 * 3. Verify filtering, pagination, and drill-down work
 * 4. Compare rendering with legacy component
 */
export const UNIFIED_READY_CARDS = new Set<string>([
  // =====================================================================
  // Phase 6 Batch 1 - Simple list cards with registered hooks
  // =====================================================================

  // Core workload cards
  'pod_issues',           // useCachedPodIssues
  'deployment_issues',    // useCachedDeploymentIssues

  // Event cards
  'event_stream',         // useCachedEvents
  'warning_events',       // useWarningEvents
  'recent_events',        // useRecentEvents

  // Resource status cards
  'service_status',       // useServices
  'pvc_status',           // usePVCs
  'operator_status',      // useOperators
  'helm_release_status',  // useHelmReleases
  'configmap_status',     // useConfigMaps
  'secret_status',        // useSecrets
  'ingress_status',       // useIngresses
  'node_status',          // useNodes
  'job_status',           // useJobs
  'cronjob_status',       // useCronJobs
  'statefulset_status',   // useStatefulSets
  'daemonset_status',     // useDaemonSets
  'hpa_status',           // useHPAs
  'replicaset_status',    // useReplicaSets
  'pv_status',            // usePVs
  'namespace_status',     // useNamespaces

  // =====================================================================
  // Phase 6 Batch 2 - Additional list/table cards
  // =====================================================================

  // RBAC cards
  'role_status',          // useK8sRoles
  'role_binding_status',  // useK8sRoleBindings

  // Quota cards
  'resource_quota_status', // useResourceQuotas
  'limit_range_status',   // useLimitRanges

  // Network cards
  'network_policy_status', // useNetworkPolicies
  'service_exports',      // useServiceExports
  'service_imports',      // useServiceImports

  // Operator cards
  'operator_subscription_status', // useOperatorSubscriptions

  // Service account
  'service_account_status', // useServiceAccounts

  // =====================================================================
  // Phase 6 Batch 3 - Chart and overview cards
  // =====================================================================

  // Chart cards (demo data)
  'cluster_metrics',        // useCachedClusterMetrics
  'events_timeline',        // useCachedEventsTimeline
  'pod_health_trend',       // usePodHealthTrend
  'resource_trend',         // useResourceTrend

  // Table/list cards with demo data
  'resource_usage',         // useCachedResourceUsage
  'top_pods',               // useTopPods
  'security_issues',        // useSecurityIssues
  'active_alerts',          // useActiveAlerts
  'gitops_drift',           // useGitOpsDrift

  // Status grid/overview cards (demo data)
  'storage_overview',       // useStorageOverview
  'network_overview',       // useNetworkOverview
  'compute_overview',       // useComputeOverview

  // =====================================================================
  // Phase 6 Batch 4 - ArgoCD, Prow, GPU, ML, Policy cards
  // =====================================================================

  // Deployment cards
  'deployment_status',      // useCachedDeployments (already registered)
  'deployment_progress',    // useDeploymentProgress

  // ArgoCD cards
  'argocd_applications',    // useArgoCDApplications

  // Prow/CI cards
  'prow_jobs',              // useProwJobs

  // GPU cards
  'gpu_inventory',          // useGPUInventory
  'gpu_workloads',          // useGPUWorkloads

  // ML cards
  'ml_jobs',                // useMLJobs
  'ml_notebooks',           // useMLNotebooks

  // Policy cards
  'opa_policies',           // useOPAPolicies
  'kyverno_policies',       // useKyvernoPolicies

  // Alert cards
  'alert_rules',            // useAlertRules

  // Chart/upgrade cards
  'chart_versions',         // useChartVersions

  // CRD cards
  'crd_health',             // useCRDHealth

  // Compliance cards
  'compliance_score',       // useComplianceScore

  // Namespace cards
  'namespace_events',       // useNamespaceEvents

  // =====================================================================
  // Phase 6 Batch 5 - GitOps, Security, Status cards
  // =====================================================================

  // ArgoCD cards
  'argocd_health',          // useArgoCDHealth (stats-grid)
  'argocd_sync_status',     // useArgoCDSyncStatus (stats-grid)

  // GitOps cards
  'gateway_status',         // useGatewayStatus
  'kustomization_status',   // useKustomizationStatus

  // Cluster status cards
  'provider_health',        // useProviderHealth
  'upgrade_status',         // useUpgradeStatus

  // Prow/CI cards
  'prow_status',            // useProwStatus (stats-grid)
  'prow_history',           // useProwHistory

  // Helm cards
  'helm_history',           // useHelmHistory

  // Security cards
  'external_secrets',       // useExternalSecrets (stats-grid)
  'cert_manager',           // useCertManager (stats-grid)
  'vault_secrets',          // useVaultSecrets
  'falco_alerts',           // useFalcoAlerts
  'kubescape_scan',         // useKubescapeScan (stats-grid)
  'trivy_scan',             // useTrivyScan (stats-grid)
  'policy_violations',      // usePolicyViolations

  // Event cards
  'event_summary',          // useEventSummary (stats-grid)

  // App cards
  'app_status',             // useAppStatus

  // GPU cards
  'gpu_status',             // useGPUStatus (stats-grid)
  'gpu_utilization',        // useGPUUtilization (chart)
  'gpu_usage_trend',        // useGPUUsageTrend (chart)

  // Namespace cards
  'namespace_overview',     // useNamespaceOverview (stats-grid)
  'namespace_quotas',       // useNamespaceQuotas
  'namespace_rbac',         // useNamespaceRBAC

  // Resource cards
  'resource_capacity',      // useResourceCapacity (stats-grid)

  // =====================================================================
  // Phase 6 Batch 6 - Final compatible cards
  // =====================================================================

  // Cluster cards
  'cluster_health',         // useClusters (already registered)
  'cluster_costs',          // useClusterCosts

  // CI/CD cards
  'github_activity',        // useGithubActivity

  // Utility cards
  'rss_feed',               // useRSSFeed

  // Cost cards
  'kubecost_overview',      // useKubecostOverview (chart/donut)
  'opencost_overview',      // useOpencostOverview (chart/donut)
])

/**
 * Cards that should NEVER use UnifiedCard (games, embeds, custom viz)
 */
export const UNIFIED_EXCLUDED_CARDS = new Set<string>([
  // Arcade games - require custom rendering
  'kube_man', 'kube_kong', 'node_invaders', 'pod_pitfall', 'container_tetris',
  'flappy_pod', 'pod_sweeper', 'game_2048', 'checkers', 'kube_chess',
  'solitaire', 'match_game', 'kubedle', 'sudoku_game', 'pod_brothers',
  'kube_kart', 'kube_pong', 'kube_snake', 'kube_galaga',
  'kube_doom', 'pod_crosser',

  // Embedded content
  'iframe_embed', 'mobile_browser', 'kubectl',

  // Weather has animated backgrounds
  'weather',

  // Complex tree/topology visualizations
  'cluster_resource_tree', 'service_topology', 'cluster_locations',
  'cluster_comparison', 'cluster_network',

  // AI-ML flow visualizations
  'llmd_flow', 'epp_routing', 'kv_cache_monitor', 'pd_disaggregation',

  // LLM/ML stack cards - require StackContext
  'llm_inference', 'llm_models', 'llmd_stack_monitor',

  // Monitor cards - complex custom visualizations
  'cluster_health_monitor', 'namespace_monitor', 'workload_monitor',
  'prow_ci_monitor', 'github_ci_monitor',

  // GitHub Pipelines dashboard — custom JSX rendering (sparkline strip,
  // CSS heatmap grid, SVG flow, filter-aware table + drill-down modal)
  'nightly_release_pulse', 'workflow_matrix', 'pipeline_flow', 'recent_failures',

  // Complex interactive cards
  'cluster_focus', 'cluster_groups', 'resource_marshall',
  'user_management', 'workload_deployment',

  // Diff/comparison cards
  'helm_values_diff', 'overlay_comparison',

  // Console AI cards - special agent integration
  'console_ai_health_check', 'console_ai_issues',
  'console_ai_kubeconfig_audit', 'console_ai_offline_detection',

  // Special cards
  'deployment_missions', 'dynamic_card', 'hardware_health',
  'stock_market_ticker',
])
