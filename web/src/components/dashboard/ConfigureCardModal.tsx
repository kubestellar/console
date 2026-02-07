import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Sparkles, Loader2, Settings, ToggleLeft } from 'lucide-react'
import { useClusters } from '../../hooks/useMCP'
import { useTokenUsage } from '../../hooks/useTokenUsage'
import { cn } from '../../lib/cn'
import { BaseModal } from '../../lib/modals'

interface Card {
  id: string
  card_type: string
  config: Record<string, unknown>
  title?: string
}

interface ConfigureCardModalProps {
  isOpen: boolean
  card: Card | null
  onClose: () => void
  onSave: (cardId: string, config: Record<string, unknown>, title?: string) => void
  onCreateCard?: (cardType: string, config: Record<string, unknown>, title?: string) => void
}

// Card type detection patterns
const CARD_TYPE_PATTERNS: Array<{ patterns: string[]; cardType: string; defaultConfig?: Record<string, unknown> }> = [
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
const CARD_BEHAVIORS: Record<string, Array<{ key: string; label: string; description: string; default: boolean }>> = {
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

const CARD_CONFIG_FIELDS: Record<string, Array<{ key: string; label: string; type: 'text' | 'select' | 'number' | 'cluster' | 'namespace' }>> = {
  cluster_health: [],
  event_stream: [
    { key: 'cluster', label: 'Cluster', type: 'cluster' },
    { key: 'namespace', label: 'Namespace', type: 'text' },
    { key: 'limit', label: 'Max Events', type: 'number' },
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

export function ConfigureCardModal({ isOpen, card, onClose, onSave, onCreateCard }: ConfigureCardModalProps) {
  const { t } = useTranslation()
  const [config, setConfig] = useState<Record<string, unknown>>({})
  const [behaviors, setBehaviors] = useState<Record<string, boolean>>({})
  const [title, setTitle] = useState('')
  const [nlPrompt, setNlPrompt] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [activeTab, setActiveTab] = useState<'settings' | 'behaviors' | 'ai'>('settings')
  const [aiChanges, setAiChanges] = useState<string[]>([])
  const [aiError, setAiError] = useState<string | null>(null)
  const { clusters } = useClusters()
  const { addTokens } = useTokenUsage()

  useEffect(() => {
    if (card) {
      setConfig(card.config || {})
      setTitle(card.title || '')
      // Initialize behaviors from config or defaults (use default behaviors for unknown card types)
      const cardBehaviors = CARD_BEHAVIORS[card.card_type] || CARD_BEHAVIORS.default || []
      const initialBehaviors: Record<string, boolean> = {}
      cardBehaviors.forEach((b) => {
        initialBehaviors[b.key] = (card.config?.[b.key] as boolean) ?? b.default
      })
      setBehaviors(initialBehaviors)
    }
  }, [card])

  if (!card) return null

  const fields = CARD_CONFIG_FIELDS[card.card_type] || CARD_CONFIG_FIELDS.default || []
  const cardBehaviors = CARD_BEHAVIORS[card.card_type] || CARD_BEHAVIORS.default || []

  const handleSave = () => {
    const finalConfig = { ...config, ...behaviors }
    onSave(card.id, finalConfig, title || undefined)
  }

  const updateConfig = (key: string, value: unknown) => {
    setConfig((prev) => ({ ...prev, [key]: value }))
  }

  const toggleBehavior = (key: string) => {
    setBehaviors((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  // Detect what card type the user is asking for
  const detectCardType = (prompt: string): string | null => {
    const lowerPrompt = prompt.toLowerCase()

    for (const { patterns, cardType } of CARD_TYPE_PATTERNS) {
      for (const pattern of patterns) {
        if (lowerPrompt.includes(pattern)) {
          return cardType
        }
      }
    }
    return null
  }

  // Extract configuration from prompt
  const extractConfigFromPrompt = (prompt: string): { config: Record<string, unknown>; behaviors: Record<string, boolean>; title?: string } => {
    const lowerPrompt = prompt.toLowerCase()
    const newConfig: Record<string, unknown> = {}
    const newBehaviors: Record<string, boolean> = {}
    let extractedTitle: string | undefined

    // Cluster extraction
    const clusterMatch = prompt.match(/(?:from|in|for|on|cluster[:\s]+)([a-z0-9-_]+)(?:\s+cluster)?/i)
    if (clusterMatch && clusterMatch[1]) {
      const clusterName = clusterMatch[1]
      const matchedCluster = clusters.find(c =>
        c.name.toLowerCase().includes(clusterName.toLowerCase()) ||
        clusterName.toLowerCase().includes(c.name.toLowerCase())
      )
      if (matchedCluster) {
        newConfig.cluster = matchedCluster.name
      } else {
        // Still set it even if not found - might be valid
        newConfig.cluster = clusterName
      }
    }

    // Namespace extraction
    const namespaceMatch = prompt.match(/(?:namespace[:\s]+|ns[:\s]+|in\s+)([a-z0-9-_]+)/i)
    if (namespaceMatch && namespaceMatch[1] && !['the', 'a', 'an', 'from', 'cluster'].includes(namespaceMatch[1].toLowerCase())) {
      newConfig.namespace = namespaceMatch[1]
    }

    // Limit extraction
    const limitMatch = prompt.match(/(?:show|display|limit|max|top)\s*(\d+)/i)
    if (limitMatch && limitMatch[1]) {
      newConfig.limit = parseInt(limitMatch[1])
    }

    // Behaviors based on keywords
    if (lowerPrompt.includes('warning') || lowerPrompt.includes('error')) {
      newBehaviors.warningsOnly = true
    }
    if (lowerPrompt.includes('alert') || lowerPrompt.includes('notify')) {
      newBehaviors.alertOnNew = true
      newBehaviors.alertOnCritical = true
    }
    if (lowerPrompt.includes('sound') && !lowerPrompt.includes('no sound')) {
      newBehaviors.soundOnWarning = true
    }
    if (lowerPrompt.includes('group') && lowerPrompt.includes('cluster')) {
      newBehaviors.groupByCluster = true
    }
    if (lowerPrompt.includes('unhealthy') && (lowerPrompt.includes('first') || lowerPrompt.includes('priority'))) {
      newBehaviors.showUnhealthyFirst = true
    }

    // Title extraction
    const titleMatch = prompt.match(/(?:title|name|call it|called)[:\s]+["']?([^"']+)["']?$/i)
    if (titleMatch && titleMatch[1]) {
      extractedTitle = titleMatch[1].trim()
    }

    return { config: newConfig, behaviors: newBehaviors, title: extractedTitle }
  }

  const handleNLSubmit = async () => {
    if (!nlPrompt.trim()) return
    setIsProcessing(true)
    setAiChanges([])
    setAiError(null)

    // Small delay for UX feedback
    await new Promise((resolve) => setTimeout(resolve, 800))

    const prompt = nlPrompt.trim()
    const detectedCardType = detectCardType(prompt)
    const { config: extractedConfig, behaviors: extractedBehaviors, title: extractedTitle } = extractConfigFromPrompt(prompt)

    // If detected a different card type than current, create a new card
    if (detectedCardType && detectedCardType !== card?.card_type && onCreateCard) {
      const newConfig = { ...extractedConfig, ...extractedBehaviors }
      const newTitle = extractedTitle || generateCardTitle(detectedCardType, extractedConfig)

      onCreateCard(detectedCardType, newConfig, newTitle)

      // Track token usage for AI card creation (estimate ~500 tokens for parsing + generation)
      addTokens(500 + Math.ceil(prompt.length / 4))

      setAiChanges([
        `Created new "${detectedCardType.replace(/_/g, ' ')}" card`,
        ...Object.entries(extractedConfig).map(([k, v]) => `• ${k}: ${v}`),
        ...Object.entries(extractedBehaviors).filter(([, v]) => v).map(([k]) => `• ${k} enabled`),
      ])

      setNlPrompt('')
      setIsProcessing(false)

      // Close modal after showing success briefly
      setTimeout(() => {
        onClose()
      }, 1500)
      return
    }

    // Otherwise, modify the current card
    const changes: string[] = []

    // Apply extracted config
    if (Object.keys(extractedConfig).length > 0) {
      setConfig((prev) => ({ ...prev, ...extractedConfig }))
      Object.entries(extractedConfig).forEach(([k, v]) => {
        changes.push(`Set ${k} to ${v}`)
      })
    }

    // Apply extracted behaviors
    if (Object.keys(extractedBehaviors).length > 0) {
      setBehaviors((prev) => ({ ...prev, ...extractedBehaviors }))
      Object.entries(extractedBehaviors).filter(([, v]) => v).forEach(([k]) => {
        changes.push(`Enabled ${k.replace(/([A-Z])/g, ' $1').toLowerCase()}`)
      })
    }

    // Apply title
    if (extractedTitle) {
      setTitle(extractedTitle)
      changes.push(`Set title to "${extractedTitle}"`)
    }

    if (changes.length === 0) {
      // Couldn't understand - suggest creating a new card
      setAiError(
        `I couldn't understand that request. Try describing what you want to see, like:\n` +
        `• "Show warning events from vllm-d cluster"\n` +
        `• "Show pods with issues in kube-system"\n` +
        `• "Track deployments in production"`
      )
    } else {
      // Track token usage for AI config modification (estimate ~300 tokens for parsing)
      addTokens(300 + Math.ceil(prompt.length / 4))
      setAiChanges(changes)
    }

    setNlPrompt('')
    setIsProcessing(false)
  }

  // Generate a descriptive title for a new card
  const generateCardTitle = (cardType: string, config: Record<string, unknown>): string => {
    const parts: string[] = []

    switch (cardType) {
      case 'event_stream':
        parts.push('Events')
        break
      case 'pod_issues':
        parts.push('Pod Issues')
        break
      case 'deployment_status':
        parts.push('Deployments')
        break
      case 'deployment_issues':
        parts.push('Deployment Issues')
        break
      case 'cluster_health':
        parts.push('Cluster Health')
        break
      case 'resource_usage':
        parts.push('Resource Usage')
        break
      case 'gpu_status':
        parts.push('GPU Status')
        break
      default:
        parts.push(cardType.replace(/_/g, ' '))
    }

    if (config.cluster) {
      const clusterName = String(config.cluster).split('/').pop()
      parts.push(`(${clusterName})`)
    }
    if (config.namespace) {
      parts.push(`- ${config.namespace}`)
    }

    return parts.join(' ')
  }

  const tabs = [
    { id: 'settings', label: 'Settings', icon: Settings },
    { id: 'behaviors', label: 'Behaviors', icon: ToggleLeft },
    { id: 'ai', label: 'AI Configure', icon: Sparkles },
  ]

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} size="md" closeOnBackdrop={false}>
      <BaseModal.Header
        title="Configure Card"
        description={`Customize "${card.title || card.card_type}"`}
        icon={Settings}
        onClose={onClose}
        showBack={false}
      />

      <BaseModal.Tabs
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab as 'settings' | 'behaviors' | 'ai')}
      />

      <BaseModal.Content className="max-h-[50vh]">
          {activeTab === 'settings' && (
            <div className="space-y-4">
              {/* Title field */}
              <div>
                <label className="block text-sm text-muted-foreground mb-1">Card Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Custom title (optional)"
                  className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground text-sm"
                />
              </div>

              {/* Dynamic config fields */}
              {fields.map((field) => (
                <div key={field.key}>
                  <label className="block text-sm text-muted-foreground mb-1">{field.label}</label>
                  {field.type === 'cluster' ? (
                    <select
                      value={(config[field.key] as string) || ''}
                      onChange={(e) => updateConfig(field.key, e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground text-sm"
                    >
                      <option value="">{t('cardConfig.allClusters')}</option>
                      {clusters.map((c) => (
                        <option key={c.name} value={c.name}>{c.name}</option>
                      ))}
                    </select>
                  ) : field.type === 'select' ? (
                    <select
                      value={(config[field.key] as string) || ''}
                      onChange={(e) => updateConfig(field.key, e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground text-sm"
                    >
                      <option value="">{t('cardConfig.default')}</option>
                      <option value="cpu">{t('cardConfig.cpuUsage')}</option>
                      <option value="memory">{t('cardConfig.memoryUsage')}</option>
                      <option value="pods">{t('cardConfig.podCount')}</option>
                    </select>
                  ) : field.type === 'number' ? (
                    <input
                      type="number"
                      value={(config[field.key] as number) || ''}
                      onChange={(e) => updateConfig(field.key, parseInt(e.target.value) || undefined)}
                      placeholder="Default"
                      className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground text-sm"
                    />
                  ) : (
                    <input
                      type="text"
                      value={(config[field.key] as string) || ''}
                      onChange={(e) => updateConfig(field.key, e.target.value || undefined)}
                      placeholder={`Enter ${field.label.toLowerCase()}`}
                      className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground text-sm"
                    />
                  )}
                </div>
              ))}

              {fields.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  This card type has no additional settings. Check the Behaviors tab.
                </p>
              )}
            </div>
          )}

          {activeTab === 'behaviors' && (
            <div className="space-y-3">
              {cardBehaviors.length > 0 ? (
                cardBehaviors.map((behavior) => (
                  <div
                    key={behavior.key}
                    className="flex items-start gap-3 p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors cursor-pointer"
                    onClick={() => toggleBehavior(behavior.key)}
                  >
                    <div className={cn(
                      'w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors',
                      behaviors[behavior.key]
                        ? 'bg-purple-500 border-purple-500'
                        : 'border-border'
                    )}>
                      {behaviors[behavior.key] && (
                        <svg className="w-3 h-3 text-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">{behavior.label}</p>
                      <p className="text-xs text-muted-foreground">{behavior.description}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  This card type has no configurable behaviors
                </p>
              )}
            </div>
          )}

          {activeTab === 'ai' && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-purple-500/10 border border-purple-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  <span className="text-sm font-medium text-purple-300">AI-Powered Configuration</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Describe how you want this card to behave in plain English. For example:
                  "Only show warning events and alert me when new ones appear" or
                  "Prioritize unhealthy clusters and refresh faster"
                </p>
              </div>

              {/* Applied changes feedback */}
              {aiChanges.length > 0 && (
                <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                  <div className="flex items-center gap-2 mb-2">
                    <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-sm font-medium text-green-300">Applied changes:</span>
                  </div>
                  <ul className="text-xs text-green-200 space-y-1">
                    {aiChanges.map((change, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <span className="text-green-400">•</span>
                        {change}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Error feedback */}
              {aiError && (
                <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span className="text-sm text-yellow-300">{aiError}</span>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm text-muted-foreground mb-1">
                  Describe your preferences
                </label>
                <textarea
                  value={nlPrompt}
                  onChange={(e) => {
                    setNlPrompt(e.target.value)
                    setAiError(null) // Clear error on new input
                  }}
                  placeholder="e.g., 'Show me only warning events from the vllm-d cluster and play a sound when new ones appear'"
                  className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground text-sm h-24 resize-none"
                  disabled={isProcessing}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && nlPrompt.trim()) {
                      e.preventDefault()
                      handleNLSubmit()
                    }
                  }}
                />
                <p className="text-xs text-muted-foreground mt-1">Press Enter to apply, Shift+Enter for new line</p>
              </div>

              <button
                onClick={handleNLSubmit}
                disabled={!nlPrompt.trim() || isProcessing}
                className={cn(
                  'w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-colors',
                  nlPrompt.trim() && !isProcessing
                    ? 'bg-purple-500 text-foreground hover:bg-purple-600'
                    : 'bg-secondary text-muted-foreground cursor-not-allowed'
                )}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Apply Configuration
                  </>
                )}
              </button>

              <div className="text-xs text-muted-foreground space-y-1">
                <p className="font-medium">Example prompts:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>"Show only warnings from the vllm-d cluster"</li>
                  <li>"Alert me when critical issues appear"</li>
                  <li>"Prioritize unhealthy clusters and enable sounds"</li>
                  <li>"Filter to namespace: production, show max 20 items"</li>
                  <li>"Group events by cluster and enable pagination"</li>
                  <li>"Title: Production Alerts"</li>
                </ul>
              </div>
            </div>
          )}
        </BaseModal.Content>

        <BaseModal.Footer showKeyboardHints>
          <div className="flex-1" />
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 rounded-lg bg-purple-500 text-foreground hover:bg-purple-600"
            >
              Save Changes
            </button>
          </div>
        </BaseModal.Footer>
    </BaseModal>
  )
}
