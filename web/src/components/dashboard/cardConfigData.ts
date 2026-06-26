/**
 * Card configuration data — types, behavior toggles, and config field schemas.
 * Extracted from ConfigureCardModal to enable reuse across dashboard modals.
 */

export interface CardTypePattern {
  patterns: string[]
  cardType: string
  defaultConfig?: Record<string, unknown>
}

export interface CardBehavior {
  key: string
  label: string
  description: string
  default: boolean
}

export interface CardConfigField {
  key: string
  label: string
  type: 'text' | 'select' | 'number' | 'cluster' | 'namespace'
}

export const CARD_TYPE_PATTERNS: CardTypePattern[] = [
  { patterns: ['event', 'events', 'warning', 'error', 'log'], cardType: 'event_stream' },
  { patterns: ['pod', 'pods', 'crash', 'crashloop', 'oom', 'restart'], cardType: 'pod_issues' },
  { patterns: ['deploy', 'deployment', 'rollout', 'rolling'], cardType: 'deployment_status' },
  { patterns: ['deployment issue', 'stuck deployment', 'failed deployment'], cardType: 'deployment_issues' },
  { patterns: ['cluster health', 'cluster status', 'health'], cardType: 'cluster_health' },
  { patterns: ['resource', 'cpu', 'memory', 'usage'], cardType: 'resource_usage' },
  { patterns: ['metric', 'metrics', 'chart', 'graph'], cardType: 'cluster_metrics' },
  { patterns: ['gpu', 'nvidia', 'cuda', 'accelerator'], cardType: 'gpu_status' },
  { patterns: ['gpu inventory', 'gpu nodes', 'gpu capacity'], cardType: 'gpu_inventory' },
  { patterns: ['app', 'application', 'service'], cardType: 'app_status' },
  { patterns: ['upgrade', 'version', 'kubernetes version'], cardType: 'upgrade_status' },
  { patterns: ['capacity', 'quota', 'limit'], cardType: 'resource_capacity' },
  { patterns: ['security', 'privileged', 'root', 'host'], cardType: 'security_issues' },
]

// Card behaviors that can be enabled/disabled
export const CARD_BEHAVIORS: Record<string, CardBehavior[]> = {
  cluster_health: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Automatically refresh every 30 seconds', default: true },
    { key: 'showUnhealthyFirst', label: 'Prioritize unhealthy', description: 'Show unhealthy clusters at the top', default: true },
    { key: 'alertOnChange', label: 'Alert on status change', description: 'Show notification when cluster health changes', default: false },
  ],
  event_stream: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Poll for new events every 10 seconds', default: true },
    { key: 'warningsOnly', label: 'Warnings only', description: 'Only show warning and error events', default: false },
    { key: 'groupByCluster', label: 'Group by cluster', description: 'Group events by their source cluster', default: false },
    { key: 'soundOnWarning', label: 'Sound on warning', description: 'Play sound for new warning events', default: false },
  ],
  pod_issues: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Check for new issues every 30 seconds', default: true },
    { key: 'showRestartCount', label: 'Show restart count', description: 'Display container restart counts', default: true },
    { key: 'includeCompleted', label: 'Include completed', description: 'Show completed/succeeded pods', default: false },
    { key: 'alertOnNew', label: 'Alert on new issues', description: 'Notify when new pod issues appear', default: false },
  ],
  app_status: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Refresh app status periodically', default: true },
    { key: 'showAllReplicas', label: 'Show all replicas', description: 'Display individual replica status', default: false },
  ],
  resource_usage: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Update metrics every 30 seconds', default: true },
    { key: 'showPercentage', label: 'Show percentage', description: 'Display as percentage of capacity', default: true },
    { key: 'alertOnHigh', label: 'Alert on high usage', description: 'Notify when usage exceeds 80%', default: false },
  ],
  cluster_metrics: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Update metrics periodically', default: true },
    { key: 'showTrend', label: 'Show trend', description: 'Display trend indicators', default: true },
  ],
  deployment_status: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Check deployment status periodically', default: true },
    { key: 'showProgress', label: 'Show progress', description: 'Display rollout progress bar', default: true },
    { key: 'alertOnComplete', label: 'Alert on complete', description: 'Notify when deployment completes', default: false },
  ],
  security_issues: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Check for security issues periodically', default: true },
    { key: 'includeLowSeverity', label: 'Include low severity', description: 'Show informational security items', default: false },
    { key: 'alertOnCritical', label: 'Alert on critical', description: 'Notify on critical security issues', default: true },
  ],
  deployment_issues: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Check for deployment issues periodically', default: true },
    { key: 'showAllClusters', label: 'All clusters', description: 'Show issues from all clusters', default: true },
    { key: 'showProgress', label: 'Show progress', description: 'Display rollout progress for stuck deployments', default: true },
    { key: 'alertOnNew', label: 'Alert on new issues', description: 'Notify when new deployment issues appear', default: false },
    { key: 'paginate', label: 'Enable pagination', description: 'Paginate results instead of showing all', default: false },
  ],
  deployment_progress: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Update rollout progress periodically', default: true },
    { key: 'showPercentage', label: 'Show percentage', description: 'Display progress as percentage', default: true },
    { key: 'alertOnComplete', label: 'Alert on complete', description: 'Notify when rollout completes', default: false },
    { key: 'alertOnStalled', label: 'Alert on stalled', description: 'Notify when rollout is stuck', default: true },
  ],
  upgrade_status: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Check for version updates periodically', default: true },
    { key: 'showOnlyUpgradeable', label: 'Show upgradeable only', description: 'Only show clusters with available upgrades', default: false },
    { key: 'hideUnreachable', label: 'Hide offline', description: 'Hide clusters that cannot be contacted', default: false },
    { key: 'alertOnNewUpgrade', label: 'Alert on new upgrade', description: 'Notify when a new upgrade becomes available', default: false },
  ],
  // GPU Cards
  gpu_status: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Update GPU status periodically', default: true },
    { key: 'showUtilization', label: 'Show utilization', description: 'Display GPU utilization metrics', default: true },
    { key: 'alertOnIdle', label: 'Alert on idle', description: 'Notify when GPUs are idle for extended periods', default: false },
  ],
  gpu_inventory: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Update GPU inventory periodically', default: true },
    { key: 'groupByType', label: 'Group by type', description: 'Group GPUs by model/type', default: true },
    { key: 'showCapacity', label: 'Show capacity', description: 'Display total vs available capacity', default: true },
  ],
  gpu_overview: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Update overview periodically', default: true },
    { key: 'showTrends', label: 'Show trends', description: 'Display utilization trends', default: true },
  ],
  // Helm/Operator Cards
  helm_release_status: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Check release status periodically', default: true },
    { key: 'showFailedOnly', label: 'Show failed only', description: 'Only display failed releases', default: false },
    { key: 'alertOnFailure', label: 'Alert on failure', description: 'Notify when release fails', default: false },
  ],
  helm_history: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Refresh history periodically', default: false },
    { key: 'showAllRevisions', label: 'Show all revisions', description: 'Display complete revision history', default: false },
  ],
  helm_values_diff: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Check for value changes periodically', default: false },
    { key: 'highlightDiffs', label: 'Highlight differences', description: 'Visually highlight changed values', default: true },
  ],
  chart_versions: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Check for new chart versions', default: true },
    { key: 'alertOnNew', label: 'Alert on new version', description: 'Notify when new chart versions are available', default: false },
  ],
  operator_status: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Check operator status periodically', default: true },
    { key: 'showDegraded', label: 'Prioritize degraded', description: 'Show degraded operators first', default: true },
    { key: 'alertOnDegraded', label: 'Alert on degraded', description: 'Notify when operator becomes degraded', default: false },
  ],
  operator_subscriptions: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Check subscriptions periodically', default: true },
    { key: 'showUpgradeable', label: 'Show upgradeable', description: 'Highlight operators with available updates', default: true },
  ],
  // GitOps Cards
  argocd_applications: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Poll for application status', default: true },
    { key: 'showOutOfSync', label: 'Prioritize out-of-sync', description: 'Show out-of-sync applications first', default: true },
    { key: 'alertOnSync', label: 'Alert on sync issues', description: 'Notify when applications go out of sync', default: false },
  ],
  argocd_health: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Check ArgoCD health periodically', default: true },
    { key: 'alertOnUnhealthy', label: 'Alert on unhealthy', description: 'Notify when ArgoCD becomes unhealthy', default: false },
  ],
  argocd_sync_status: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Check sync status periodically', default: true },
    { key: 'showHistory', label: 'Show history', description: 'Display recent sync history', default: true },
    { key: 'showOutOfSync', label: 'Prioritize out-of-sync', description: 'Show out-of-sync apps first', default: true },
    { key: 'alertOnOutOfSync', label: 'Alert on out-of-sync', description: 'Notify when apps go out of sync', default: false },
  ],
  kustomization_status: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Check Flux kustomizations periodically', default: true },
    { key: 'showFailed', label: 'Prioritize failed', description: 'Show failed kustomizations first', default: true },
    { key: 'alertOnFailure', label: 'Alert on failure', description: 'Notify when reconciliation fails', default: false },
  ],
  gitops_drift: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Check for drift periodically', default: true },
    { key: 'showAllResources', label: 'Show all resources', description: 'Display all drifted resources', default: false },
    { key: 'alertOnDrift', label: 'Alert on drift', description: 'Notify when drift is detected', default: true },
  ],
  // Namespace Cards
  namespace_overview: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Refresh namespace stats periodically', default: true },
    { key: 'showQuotas', label: 'Show quotas', description: 'Display resource quota usage', default: true },
  ],
  namespace_events: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Poll for new events', default: true },
    { key: 'warningsOnly', label: 'Warnings only', description: 'Only show warning events', default: false },
  ],
  namespace_quotas: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Update quota usage periodically', default: true },
    { key: 'alertOnLimit', label: 'Alert near limit', description: 'Notify when approaching quota limits', default: false },
  ],
  namespace_rbac: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Refresh RBAC bindings periodically', default: false },
    { key: 'showServiceAccounts', label: 'Show service accounts', description: 'Include service account bindings', default: true },
  ],
  // Other Cards
  resource_capacity: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Update capacity metrics periodically', default: true },
    { key: 'showTrend', label: 'Show trend', description: 'Display capacity trend over time', default: false },
    { key: 'alertOnLow', label: 'Alert on low capacity', description: 'Notify when capacity is running low', default: false },
  ],
  top_pods: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Update pod rankings periodically', default: true },
    { key: 'sortByCPU', label: 'Sort by CPU', description: 'Rank pods by CPU usage', default: true },
    { key: 'sortByMemory', label: 'Sort by memory', description: 'Rank pods by memory usage', default: false },
  ],
  cluster_network: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Update network info periodically', default: true },
    { key: 'showPolicies', label: 'Show network policies', description: 'Display active network policies', default: true },
  ],
  cluster_comparison: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Refresh comparison periodically', default: true },
    { key: 'highlightDiffs', label: 'Highlight differences', description: 'Visually highlight differences', default: true },
  ],
  cluster_costs: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Update cost data periodically', default: true },
    { key: 'showBreakdown', label: 'Show breakdown', description: 'Display cost breakdown by resource', default: true },
    { key: 'alertOnSpike', label: 'Alert on spike', description: 'Notify on unusual cost increases', default: false },
  ],
  cluster_focus: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Update focus view periodically', default: true },
    { key: 'showAllMetrics', label: 'Show all metrics', description: 'Display comprehensive metrics', default: false },
  ],
  crd_health: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Check CRD health periodically', default: true },
    { key: 'showAllCRDs', label: 'Show all CRDs', description: 'Display all custom resources', default: false },
    { key: 'alertOnIssue', label: 'Alert on issues', description: 'Notify when CRD issues detected', default: false },
  ],
  overlay_comparison: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Refresh comparison periodically', default: false },
    { key: 'showDiffs', label: 'Show differences', description: 'Highlight overlay differences', default: true },
  ],
  user_management: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Refresh user list periodically', default: false },
    { key: 'showInactive', label: 'Show inactive', description: 'Display inactive users', default: false },
  ],
  // GPU Workloads
  gpu_workloads: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Update GPU workloads periodically', default: true },
    { key: 'showUtilization', label: 'Show utilization', description: 'Display per-workload GPU utilization', default: true },
    { key: 'groupByNamespace', label: 'Group by namespace', description: 'Group workloads by namespace', default: false },
  ],
  // Live data trend cards
  events_timeline: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Poll for new events continuously', default: true },
    { key: 'showWarningsOnly', label: 'Warnings only', description: 'Only show warning and error events', default: false },
    { key: 'highlightRecent', label: 'Highlight recent', description: 'Highlight events from last 5 minutes', default: true },
  ],
  pod_health_trend: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Update pod health trend periodically', default: true },
    { key: 'showRestarts', label: 'Show restarts', description: 'Include restart counts in trend', default: true },
    { key: 'alertOnDegradation', label: 'Alert on degradation', description: 'Notify when pod health degrades', default: false },
  ],
  resource_trend: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Update resource trends periodically', default: true },
    { key: 'showCPU', label: 'Show CPU', description: 'Display CPU usage trend', default: true },
    { key: 'showMemory', label: 'Show memory', description: 'Display memory usage trend', default: true },
    { key: 'alertOnSpike', label: 'Alert on spike', description: 'Notify on unusual resource spikes', default: false },
  ],
  gpu_utilization: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Update GPU utilization periodically', default: true },
    { key: 'showPerGPU', label: 'Show per-GPU', description: 'Display utilization per GPU device', default: false },
    { key: 'alertOnLow', label: 'Alert on low utilization', description: 'Notify when GPUs are underutilized', default: false },
  ],
  gpu_usage_trend: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Update GPU usage trend periodically', default: true },
    { key: 'showMemory', label: 'Show memory', description: 'Display GPU memory usage trend', default: true },
    { key: 'showCompute', label: 'Show compute', description: 'Display GPU compute utilization trend', default: true },
  ],
  cluster_resource_tree: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Refresh resource tree periodically', default: true },
    { key: 'expandAll', label: 'Expand all', description: 'Auto-expand all tree nodes', default: false },
    { key: 'showCounts', label: 'Show counts', description: 'Display resource counts per node', default: true },
  ],
  // Dashboard-specific cards
  storage_overview: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Update storage metrics periodically', default: true },
    { key: 'showCapacity', label: 'Show capacity', description: 'Display storage capacity usage', default: true },
    { key: 'alertOnFull', label: 'Alert on full', description: 'Notify when storage nears capacity', default: false },
  ],
  pvc_status: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Update PVC status periodically', default: true },
    { key: 'showPending', label: 'Show pending', description: 'Display pending PVCs', default: true },
    { key: 'alertOnPending', label: 'Alert on pending', description: 'Notify when PVCs are stuck pending', default: false },
  ],
  network_overview: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Update network metrics periodically', default: true },
    { key: 'showBandwidth', label: 'Show bandwidth', description: 'Display bandwidth usage', default: true },
    { key: 'showLatency', label: 'Show latency', description: 'Display network latency metrics', default: false },
  ],
  service_status: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Update service status periodically', default: true },
    { key: 'showEndpoints', label: 'Show endpoints', description: 'Display service endpoints', default: true },
    { key: 'alertOnNoEndpoints', label: 'Alert on no endpoints', description: 'Notify when services have no endpoints', default: false },
  ],
  compute_overview: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Update compute metrics periodically', default: true },
    { key: 'showNodes', label: 'Show nodes', description: 'Display node-level metrics', default: true },
    { key: 'alertOnPressure', label: 'Alert on pressure', description: 'Notify when nodes are under pressure', default: false },
  ],
  // Cluster cards
  cluster_locations: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Update cluster locations periodically', default: true },
    { key: 'showRegions', label: 'Show regions', description: 'Display cluster regions on map', default: true },
    { key: 'showStatus', label: 'Show status', description: 'Display cluster health on map', default: true },
  ],
  // Namespace cards
  namespace_monitor: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Update namespace metrics periodically', default: true },
    { key: 'showResources', label: 'Show resources', description: 'Display resource usage per namespace', default: true },
    { key: 'alertOnQuota', label: 'Alert on quota', description: 'Notify when approaching quota limits', default: false },
  ],
  // AI mission cards
  console_ai_issues: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Scan for issues periodically', default: true },
    { key: 'includeWarnings', label: 'Include warnings', description: 'Include warning-level issues', default: true },
    { key: 'alertOnCritical', label: 'Alert on critical', description: 'Notify on critical issues found', default: false },
  ],
  console_ai_kubeconfig_audit: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Audit kubeconfig periodically', default: false },
    { key: 'showExpired', label: 'Show expired', description: 'Highlight expired contexts', default: true },
    { key: 'showUnused', label: 'Show unused', description: 'Display unused contexts', default: false },
  ],
  console_ai_health_check: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Run health checks periodically', default: true },
    { key: 'deepScan', label: 'Deep scan', description: 'Perform comprehensive health analysis', default: false },
    { key: 'alertOnUnhealthy', label: 'Alert on unhealthy', description: 'Notify when clusters are unhealthy', default: false },
  ],
  // Alerting cards
  active_alerts: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Poll for new alerts periodically', default: true },
    { key: 'criticalOnly', label: 'Critical only', description: 'Only show critical/firing alerts', default: false },
    { key: 'groupByCluster', label: 'Group by cluster', description: 'Group alerts by source cluster', default: false },
    { key: 'soundOnAlert', label: 'Sound on alert', description: 'Play sound for new critical alerts', default: false },
  ],
  alert_rules: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Refresh alert rules periodically', default: false },
    { key: 'showDisabled', label: 'Show disabled', description: 'Display disabled alert rules', default: false },
    { key: 'groupBySource', label: 'Group by source', description: 'Group rules by alert source', default: true },
  ],
  // Cost management cards
  opencost_overview: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Update cost data periodically', default: true },
    { key: 'showTrend', label: 'Show trend', description: 'Display cost trend over time', default: true },
    { key: 'alertOnBudget', label: 'Alert on budget', description: 'Notify when approaching budget limits', default: false },
  ],
  kubecost_overview: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Update cost data periodically', default: true },
    { key: 'showBreakdown', label: 'Show breakdown', description: 'Display cost breakdown by namespace', default: true },
    { key: 'alertOnSpike', label: 'Alert on spike', description: 'Notify on unusual cost increases', default: false },
  ],
  // Policy management cards
  opa_policies: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Check policy status periodically', default: true },
    { key: 'showViolations', label: 'Show violations', description: 'Display policy violations', default: true },
    { key: 'alertOnViolation', label: 'Alert on violation', description: 'Notify on new policy violations', default: false },
  ],
  kyverno_policies: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Check policy status periodically', default: true },
    { key: 'showViolations', label: 'Show violations', description: 'Display policy violations', default: true },
    { key: 'showAuditOnly', label: 'Show audit only', description: 'Include audit-mode policies', default: true },
  ],
  // Compliance tool cards
  falco_alerts: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Poll for new Falco alerts', default: true },
    { key: 'criticalOnly', label: 'Critical only', description: 'Only show high-priority alerts', default: false },
    { key: 'alertOnNew', label: 'Alert on new', description: 'Notify on new security alerts', default: false },
  ],
  trivy_scan: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Refresh scan results periodically', default: true },
    { key: 'criticalOnly', label: 'Critical only', description: 'Only show critical vulnerabilities', default: false },
    { key: 'showFixed', label: 'Show fixed', description: 'Include vulnerabilities with fixes available', default: true },
  ],
  kubescape_scan: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Refresh scan results periodically', default: true },
    { key: 'showFailedOnly', label: 'Show failed only', description: 'Only show failed controls', default: false },
    { key: 'groupByFramework', label: 'Group by framework', description: 'Group results by compliance framework', default: true },
  ],
  policy_violations: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Check for violations periodically', default: true },
    { key: 'showResolved', label: 'Show resolved', description: 'Include resolved violations', default: false },
    { key: 'alertOnNew', label: 'Alert on new', description: 'Notify on new violations', default: false },
  ],
  compliance_score: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Update compliance score periodically', default: true },
    { key: 'showTrend', label: 'Show trend', description: 'Display score trend over time', default: true },
    { key: 'alertOnDrop', label: 'Alert on drop', description: 'Notify when compliance score drops', default: false },
  ],
  // Data compliance tool cards
  vault_secrets: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Check vault secrets periodically', default: true },
    { key: 'showExpiring', label: 'Show expiring', description: 'Highlight secrets nearing expiration', default: true },
    { key: 'alertOnExpiry', label: 'Alert on expiry', description: 'Notify when secrets are expiring', default: false },
  ],
  external_secrets: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Check sync status periodically', default: true },
    { key: 'showFailed', label: 'Show failed', description: 'Highlight failed secret syncs', default: true },
    { key: 'alertOnFailure', label: 'Alert on failure', description: 'Notify on sync failures', default: false },
  ],
  cert_manager: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Check certificate status periodically', default: true },
    { key: 'showExpiring', label: 'Show expiring', description: 'Highlight expiring certificates', default: true },
    { key: 'alertOnExpiry', label: 'Alert on expiry', description: 'Notify when certificates are expiring', default: true },
  ],
  // Workload detection cards
  prow_jobs: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Poll for job updates', default: true },
    { key: 'showFailedOnly', label: 'Show failed only', description: 'Only display failed jobs', default: false },
    { key: 'alertOnFailure', label: 'Alert on failure', description: 'Notify when jobs fail', default: false },
  ],
  prow_status: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Update Prow status periodically', default: true },
    { key: 'showQueue', label: 'Show queue', description: 'Display job queue status', default: true },
  ],
  prow_history: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Refresh job history periodically', default: false },
    { key: 'showAllRuns', label: 'Show all runs', description: 'Display complete job history', default: false },
    { key: 'groupByJob', label: 'Group by job', description: 'Group history by job name', default: true },
  ],
  llm_inference: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Update inference metrics periodically', default: true },
    { key: 'showLatency', label: 'Show latency', description: 'Display inference latency metrics', default: true },
    { key: 'showThroughput', label: 'Show throughput', description: 'Display tokens per second', default: true },
  ],
  llm_models: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Update model status periodically', default: true },
    { key: 'showMemory', label: 'Show memory', description: 'Display model memory usage', default: true },
    { key: 'alertOnError', label: 'Alert on error', description: 'Notify when models have errors', default: false },
  ],
  ml_jobs: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Poll for ML job updates', default: true },
    { key: 'showRunning', label: 'Show running', description: 'Prioritize running jobs', default: true },
    { key: 'alertOnComplete', label: 'Alert on complete', description: 'Notify when jobs complete', default: false },
  ],
  ml_notebooks: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Update notebook status periodically', default: true },
    { key: 'showIdle', label: 'Show idle', description: 'Display idle notebooks', default: false },
    { key: 'alertOnIdle', label: 'Alert on idle', description: 'Notify when notebooks are idle for too long', default: false },
  ],
  // MCS (Multi-Cluster Service) cards
  service_exports: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Update service exports periodically', default: true },
    { key: 'showConflicts', label: 'Show conflicts', description: 'Highlight export conflicts', default: true },
    { key: 'alertOnConflict', label: 'Alert on conflict', description: 'Notify when export conflicts detected', default: false },
  ],
  service_imports: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Update service imports periodically', default: true },
    { key: 'showUnresolved', label: 'Show unresolved', description: 'Highlight unresolved imports', default: true },
    { key: 'alertOnUnresolved', label: 'Alert on unresolved', description: 'Notify when imports cannot be resolved', default: false },
  ],
  // Gateway API cards
  gateway_status: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Update gateway status periodically', default: true },
    { key: 'showRoutes', label: 'Show routes', description: 'Display attached routes', default: true },
    { key: 'alertOnUnhealthy', label: 'Alert on unhealthy', description: 'Notify when gateways are unhealthy', default: false },
  ],
  // Service Topology card
  service_topology: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Update topology periodically', default: true },
    { key: 'showConnections', label: 'Show connections', description: 'Display service connections', default: true },
    { key: 'animateTraffic', label: 'Animate traffic', description: 'Animate traffic flow between services', default: false },
  ],
  // Workload Deployment card
  workload_deployment: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Update workload status periodically', default: true },
    { key: 'showProgress', label: 'Show progress', description: 'Display deployment progress', default: true },
    { key: 'alertOnStalled', label: 'Alert on stalled', description: 'Notify when deployments are stalled', default: false },
  ],
  default: [
    { key: 'autoRefresh', label: 'Auto-refresh', description: 'Automatically refresh this card', default: true },
    { key: 'showDetails', label: 'Show details', description: 'Display detailed information', default: true },
    { key: 'alertOnChange', label: 'Alert on change', description: 'Notify when significant changes occur', default: false },
  ],
}

export const CARD_CONFIG_FIELDS: Record<string, CardConfigField[]> = {
  cluster_health: [],
  event_stream: [
    { key: 'cluster', label: 'Cluster', type: 'cluster' },
    { key: 'namespace', label: 'Namespace', type: 'text' },
    { key: 'limit', label: 'Max Events', type: 'number' },
  ],
  warning_events: [
    { key: 'cluster', label: 'Cluster', type: 'cluster' },
    { key: 'namespace', label: 'Namespace', type: 'text' },
    { key: 'limit', label: 'Items per page', type: 'number' },
  ],
  pod_issues: [
    { key: 'cluster', label: 'Cluster', type: 'cluster' },
    { key: 'namespace', label: 'Namespace', type: 'text' },
  ],
  app_status: [
    { key: 'appName', label: 'App Name', type: 'text' },
    { key: 'namespace', label: 'Namespace', type: 'text' },
  ],
  resource_usage: [
    { key: 'cluster', label: 'Cluster', type: 'cluster' },
  ],
  cluster_metrics: [
    { key: 'cluster', label: 'Cluster', type: 'cluster' },
    { key: 'metric', label: 'Metric', type: 'select' },
  ],
  deployment_status: [
    { key: 'cluster', label: 'Cluster', type: 'cluster' },
    { key: 'namespace', label: 'Namespace', type: 'text' },
  ],
  security_issues: [
    { key: 'cluster', label: 'Cluster', type: 'cluster' },
    { key: 'namespace', label: 'Namespace', type: 'text' },
  ],
  deployment_issues: [
    { key: 'cluster', label: 'Cluster', type: 'cluster' },
    { key: 'namespace', label: 'Namespace', type: 'text' },
    { key: 'limit', label: 'Items per page', type: 'number' },
  ],
  upgrade_status: [
    { key: 'cluster', label: 'Cluster', type: 'cluster' },
  ],
  // Default fields for cards not specifically listed above
  default: [
    { key: 'cluster', label: 'Filter by Cluster', type: 'cluster' },
    { key: 'namespace', label: 'Filter by Namespace', type: 'text' },
    { key: 'maxItems', label: 'Max Items to Display', type: 'number' },
  ],
}
