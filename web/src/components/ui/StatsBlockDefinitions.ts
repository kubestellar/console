/**
 * Stat block definitions for all dashboard types
 * This file contains only data definitions with no heavy dependencies
 */

/**
 * Configuration for a single stat block
 */
export interface StatBlockConfig {
  id: string
  name: string
  icon: string
  visible: boolean
  color: string
}

/**
 * All available stat block definitions for each dashboard type
 */
export type DashboardStatsType =
  | 'clusters'
  | 'workloads'
  | 'pods'
  | 'gitops'
  | 'storage'
  | 'network'
  | 'security'
  | 'compliance'
  | 'data-compliance'
  | 'compute'
  | 'events'
  | 'cost'
  | 'alerts'
  | 'dashboard'
  | 'operators'
  | 'deploy'

/**
 * Default stat blocks for the Clusters dashboard
 */
export const CLUSTERS_STAT_BLOCKS: StatBlockConfig[] = [
  { id: 'clusters', name: 'Clusters', icon: 'Server', visible: true, color: 'purple' },
  { id: 'healthy', name: 'Healthy', icon: 'CheckCircle2', visible: true, color: 'green' },
  { id: 'unhealthy', name: 'Unhealthy', icon: 'XCircle', visible: true, color: 'orange' },
  { id: 'unreachable', name: 'Offline', icon: 'WifiOff', visible: true, color: 'yellow' },
  { id: 'nodes', name: 'Nodes', icon: 'Box', visible: true, color: 'cyan' },
  { id: 'cpus', name: 'CPUs', icon: 'Cpu', visible: true, color: 'blue' },
  { id: 'memory', name: 'Memory', icon: 'MemoryStick', visible: true, color: 'green' },
  { id: 'storage', name: 'Storage', icon: 'HardDrive', visible: true, color: 'purple' },
  { id: 'gpus', name: 'GPUs', icon: 'Zap', visible: true, color: 'yellow' },
  { id: 'tpus', name: 'TPUs', icon: 'Sparkles', visible: false, color: 'cyan' },
  { id: 'aius', name: 'AIUs', icon: 'Cpu', visible: false, color: 'blue' },
  { id: 'xpus', name: 'XPUs', icon: 'Zap', visible: false, color: 'green' },
  { id: 'pods', name: 'Pods', icon: 'Layers', visible: true, color: 'purple' },
]

/**
 * Default stat blocks for the Workloads dashboard
 */
export const WORKLOADS_STAT_BLOCKS: StatBlockConfig[] = [
  { id: 'namespaces', name: 'Namespaces', icon: 'FolderOpen', visible: true, color: 'purple' },
  { id: 'critical', name: 'Critical', icon: 'AlertCircle', visible: true, color: 'red' },
  { id: 'warning', name: 'Warning', icon: 'AlertTriangle', visible: true, color: 'yellow' },
  { id: 'healthy', name: 'Healthy', icon: 'CheckCircle2', visible: true, color: 'green' },
  { id: 'deployments', name: 'Deployments', icon: 'Layers', visible: true, color: 'blue' },
  { id: 'pod_issues', name: 'Pod Issues', icon: 'AlertOctagon', visible: true, color: 'orange' },
  { id: 'deployment_issues', name: 'Deploy Issues', icon: 'XCircle', visible: true, color: 'red' },
]

/**
 * Default stat blocks for the Pods dashboard
 */
export const PODS_STAT_BLOCKS: StatBlockConfig[] = [
  { id: 'total_pods', name: 'Total Pods', icon: 'Box', visible: true, color: 'purple' },
  { id: 'healthy', name: 'Healthy', icon: 'CheckCircle2', visible: true, color: 'green' },
  { id: 'issues', name: 'Issues', icon: 'AlertCircle', visible: true, color: 'red' },
  { id: 'pending', name: 'Pending', icon: 'Clock', visible: true, color: 'yellow' },
  { id: 'restarts', name: 'High Restarts', icon: 'RotateCcw', visible: true, color: 'orange' },
  { id: 'clusters', name: 'Clusters', icon: 'Server', visible: true, color: 'cyan' },
]

/**
 * Default stat blocks for the GitOps dashboard
 */
export const GITOPS_STAT_BLOCKS: StatBlockConfig[] = [
  { id: 'total', name: 'Total', icon: 'Package', visible: true, color: 'purple' },
  { id: 'helm', name: 'Helm', icon: 'Ship', visible: true, color: 'blue' },
  { id: 'kustomize', name: 'Kustomize', icon: 'Layers', visible: true, color: 'cyan' },
  { id: 'operators', name: 'Operators', icon: 'Settings', visible: true, color: 'purple' },
  { id: 'deployed', name: 'Deployed', icon: 'CheckCircle2', visible: true, color: 'green' },
  { id: 'failed', name: 'Failed', icon: 'XCircle', visible: true, color: 'red' },
  { id: 'pending', name: 'Pending', icon: 'Clock', visible: true, color: 'blue' },
  { id: 'other', name: 'Other', icon: 'MoreHorizontal', visible: true, color: 'gray' },
]

/**
 * Default stat blocks for the Storage dashboard
 */
export const STORAGE_STAT_BLOCKS: StatBlockConfig[] = [
  { id: 'ephemeral', name: 'Ephemeral', icon: 'HardDrive', visible: true, color: 'purple' },
  { id: 'pvcs', name: 'PVCs', icon: 'Database', visible: true, color: 'blue' },
  { id: 'bound', name: 'Bound', icon: 'CheckCircle2', visible: true, color: 'green' },
  { id: 'pending', name: 'Pending', icon: 'Clock', visible: true, color: 'yellow' },
  { id: 'storage_classes', name: 'Storage Classes', icon: 'Layers', visible: true, color: 'cyan' },
]

/**
 * Default stat blocks for the Network dashboard
 */
export const NETWORK_STAT_BLOCKS: StatBlockConfig[] = [
  { id: 'services', name: 'Services', icon: 'Workflow', visible: true, color: 'blue' },
  { id: 'loadbalancers', name: 'LoadBalancers', icon: 'Globe', visible: true, color: 'green' },
  { id: 'nodeport', name: 'NodePort', icon: 'Network', visible: true, color: 'yellow' },
  { id: 'clusterip', name: 'ClusterIP', icon: 'Box', visible: true, color: 'cyan' },
  { id: 'ingresses', name: 'Ingresses', icon: 'ArrowRightLeft', visible: true, color: 'purple' },
  { id: 'endpoints', name: 'Endpoints', icon: 'CircleDot', visible: true, color: 'gray' },
]

/**
 * Default stat blocks for the Security dashboard
 */
export const SECURITY_STAT_BLOCKS: StatBlockConfig[] = [
  { id: 'issues', name: 'Issues', icon: 'ShieldAlert', visible: true, color: 'purple' },
  { id: 'critical', name: 'Critical', icon: 'AlertCircle', visible: true, color: 'red' },
  { id: 'high', name: 'High', icon: 'AlertTriangle', visible: true, color: 'red' },
  { id: 'medium', name: 'Medium', icon: 'AlertTriangle', visible: true, color: 'yellow' },
  { id: 'low', name: 'Low', icon: 'Info', visible: true, color: 'blue' },
  { id: 'privileged', name: 'Privileged', icon: 'ShieldOff', visible: true, color: 'red' },
  { id: 'root', name: 'Running as Root', icon: 'User', visible: true, color: 'orange' },
]

/**
 * Default stat blocks for the Compliance dashboard
 */
export const COMPLIANCE_STAT_BLOCKS: StatBlockConfig[] = [
  // Overall compliance
  { id: 'score', name: 'Score', icon: 'Percent', visible: true, color: 'purple' },
  { id: 'total_checks', name: 'Total Checks', icon: 'ClipboardList', visible: true, color: 'blue' },
  { id: 'checks_passing', name: 'Passing', icon: 'CheckCircle2', visible: true, color: 'green' },
  { id: 'checks_failing', name: 'Failing', icon: 'XCircle', visible: true, color: 'red' },

  // Framework compliance scores
  { id: 'cis_score', name: 'CIS', icon: 'ShieldCheck', visible: true, color: 'cyan' },
  { id: 'nsa_score', name: 'NSA', icon: 'ShieldCheck', visible: true, color: 'blue' },
  { id: 'pci_score', name: 'PCI DSS', icon: 'ShieldCheck', visible: true, color: 'purple' },

  // Policy enforcement
  { id: 'gatekeeper_violations', name: 'Gatekeeper', icon: 'ShieldAlert', visible: true, color: 'orange' },
  { id: 'kyverno_violations', name: 'Kyverno', icon: 'ShieldAlert', visible: true, color: 'yellow' },
  { id: 'kubescape_score', name: 'Kubescape', icon: 'Shield', visible: true, color: 'green' },

  // Vulnerability scanning
  { id: 'critical_vulns', name: 'Critical CVEs', icon: 'AlertCircle', visible: true, color: 'red' },
  { id: 'high_vulns', name: 'High CVEs', icon: 'AlertTriangle', visible: true, color: 'orange' },
]

/**
 * Default stat blocks for the Data Compliance dashboard
 */
export const DATA_COMPLIANCE_STAT_BLOCKS: StatBlockConfig[] = [
  // Encryption
  { id: 'encryption_score', name: 'Encryption', icon: 'ShieldCheck', visible: true, color: 'green' },
  { id: 'encrypted_secrets', name: 'Encrypted', icon: 'Lock', visible: true, color: 'blue' },
  { id: 'unencrypted_secrets', name: 'Unencrypted', icon: 'Unlock', visible: true, color: 'red' },

  // Data residency & access
  { id: 'regions_compliant', name: 'Regions', icon: 'Globe', visible: true, color: 'cyan' },
  { id: 'rbac_policies', name: 'RBAC Policies', icon: 'Shield', visible: true, color: 'purple' },
  { id: 'excessive_permissions', name: 'Excessive', icon: 'AlertTriangle', visible: true, color: 'orange' },

  // Sensitive data
  { id: 'pii_detected', name: 'PII Detected', icon: 'User', visible: true, color: 'yellow' },
  { id: 'pii_protected', name: 'PII Protected', icon: 'UserCheck', visible: true, color: 'green' },

  // Audit
  { id: 'audit_enabled', name: 'Audit', icon: 'FileText', visible: true, color: 'purple' },
  { id: 'retention_days', name: 'Retention', icon: 'Calendar', visible: true, color: 'blue' },

  // Framework scores
  { id: 'gdpr_score', name: 'GDPR', icon: 'Globe', visible: true, color: 'blue' },
  { id: 'hipaa_score', name: 'HIPAA', icon: 'Heart', visible: true, color: 'red' },
  { id: 'pci_score', name: 'PCI-DSS', icon: 'CreditCard', visible: true, color: 'orange' },
  { id: 'soc2_score', name: 'SOC 2', icon: 'ShieldCheck', visible: true, color: 'cyan' },
]

/**
 * Default stat blocks for the Compute dashboard
 */
export const COMPUTE_STAT_BLOCKS: StatBlockConfig[] = [
  { id: 'nodes', name: 'Nodes', icon: 'Server', visible: true, color: 'purple' },
  { id: 'cpus', name: 'CPUs', icon: 'Cpu', visible: true, color: 'blue' },
  { id: 'memory', name: 'Memory', icon: 'MemoryStick', visible: true, color: 'green' },
  { id: 'gpus', name: 'GPUs', icon: 'Zap', visible: true, color: 'yellow' },
  { id: 'tpus', name: 'TPUs', icon: 'Sparkles', visible: true, color: 'orange' },
  { id: 'pods', name: 'Pods', icon: 'Layers', visible: true, color: 'cyan' },
  { id: 'cpu_util', name: 'CPU Util', icon: 'Activity', visible: true, color: 'blue' },
  { id: 'memory_util', name: 'Memory Util', icon: 'Activity', visible: true, color: 'green' },
]

/**
 * Default stat blocks for the Events dashboard
 */
export const EVENTS_STAT_BLOCKS: StatBlockConfig[] = [
  { id: 'total', name: 'Total Events', icon: 'Activity', visible: true, color: 'purple' },
  { id: 'warnings', name: 'Warnings', icon: 'AlertTriangle', visible: true, color: 'yellow' },
  { id: 'errors', name: 'Errors', icon: 'XCircle', visible: true, color: 'red' },
  { id: 'normal', name: 'Normal', icon: 'Info', visible: true, color: 'blue' },
  { id: 'recent', name: 'Recent (1h)', icon: 'Clock', visible: true, color: 'cyan' },
]

/**
 * Default stat blocks for the Cost dashboard
 */
export const COST_STAT_BLOCKS: StatBlockConfig[] = [
  { id: 'total_cost', name: 'Total Cost', icon: 'DollarSign', visible: true, color: 'purple' },
  { id: 'cpu_cost', name: 'CPU', icon: 'Cpu', visible: true, color: 'blue' },
  { id: 'memory_cost', name: 'Memory', icon: 'MemoryStick', visible: true, color: 'green' },
  { id: 'storage_cost', name: 'Storage', icon: 'HardDrive', visible: true, color: 'cyan' },
  { id: 'network_cost', name: 'Network', icon: 'Network', visible: true, color: 'yellow' },
  { id: 'gpu_cost', name: 'GPU', icon: 'Zap', visible: true, color: 'orange' },
]

/**
 * Default stat blocks for the Alerts dashboard
 */
export const ALERTS_STAT_BLOCKS: StatBlockConfig[] = [
  { id: 'firing', name: 'Firing', icon: 'AlertCircle', visible: true, color: 'red' },
  { id: 'pending', name: 'Pending', icon: 'Clock', visible: true, color: 'yellow' },
  { id: 'resolved', name: 'Resolved', icon: 'CheckCircle2', visible: true, color: 'green' },
  { id: 'rules_enabled', name: 'Rules Enabled', icon: 'Shield', visible: true, color: 'blue' },
  { id: 'rules_disabled', name: 'Rules Disabled', icon: 'ShieldOff', visible: true, color: 'gray' },
]

/**
 * Default stat blocks for the main Dashboard
 */
export const DASHBOARD_STAT_BLOCKS: StatBlockConfig[] = [
  { id: 'clusters', name: 'Clusters', icon: 'Server', visible: true, color: 'purple' },
  { id: 'healthy', name: 'Healthy', icon: 'CheckCircle2', visible: true, color: 'green' },
  { id: 'pods', name: 'Pods', icon: 'Layers', visible: true, color: 'blue' },
  { id: 'nodes', name: 'Nodes', icon: 'Box', visible: true, color: 'cyan' },
  { id: 'namespaces', name: 'Namespaces', icon: 'FolderTree', visible: true, color: 'purple' },
  { id: 'errors', name: 'Errors', icon: 'XCircle', visible: true, color: 'red' },
]

/**
 * Default stat blocks for the Operators dashboard
 */
export const OPERATORS_STAT_BLOCKS: StatBlockConfig[] = [
  { id: 'operators', name: 'Total', icon: 'Settings', visible: true, color: 'purple' },
  { id: 'installed', name: 'Installed', icon: 'CheckCircle2', visible: true, color: 'green' },
  { id: 'installing', name: 'Installing', icon: 'RefreshCw', visible: true, color: 'blue' },
  { id: 'failing', name: 'Failing', icon: 'XCircle', visible: true, color: 'red' },
  { id: 'upgrades', name: 'Upgrades', icon: 'ArrowUpCircle', visible: true, color: 'orange' },
  { id: 'subscriptions', name: 'Subscriptions', icon: 'Newspaper', visible: true, color: 'indigo' },
  { id: 'crds', name: 'CRDs', icon: 'FileCode', visible: true, color: 'cyan' },
  { id: 'clusters', name: 'Clusters', icon: 'Server', visible: true, color: 'blue' },
]

/**
 * Default stat blocks for the Deploy dashboard
 */
export const DEPLOY_STAT_BLOCKS: StatBlockConfig[] = [
  { id: 'deployments', name: 'Deployments', icon: 'Ship', visible: true, color: 'blue' },
  { id: 'healthy', name: 'Healthy', icon: 'CheckCircle2', visible: true, color: 'green' },
  { id: 'progressing', name: 'Progressing', icon: 'Clock', visible: true, color: 'cyan' },
  { id: 'failed', name: 'Failed', icon: 'XCircle', visible: true, color: 'red' },
  { id: 'helm', name: 'Helm Releases', icon: 'Package', visible: true, color: 'purple' },
  { id: 'argocd', name: 'ArgoCD Apps', icon: 'Workflow', visible: true, color: 'orange' },
  { id: 'namespaces', name: 'Namespaces', icon: 'FolderOpen', visible: true, color: 'cyan' },
  { id: 'clusters', name: 'Clusters', icon: 'Server', visible: true, color: 'purple' },
]

/**
 * Get all stat blocks across all dashboard types
 */
export const ALL_STAT_BLOCKS: StatBlockConfig[] = (() => {
  const allBlocks = [
    ...CLUSTERS_STAT_BLOCKS,
    ...WORKLOADS_STAT_BLOCKS,
    ...PODS_STAT_BLOCKS,
    ...GITOPS_STAT_BLOCKS,
    ...STORAGE_STAT_BLOCKS,
    ...NETWORK_STAT_BLOCKS,
    ...SECURITY_STAT_BLOCKS,
    ...COMPLIANCE_STAT_BLOCKS,
    ...DATA_COMPLIANCE_STAT_BLOCKS,
    ...COMPUTE_STAT_BLOCKS,
    ...EVENTS_STAT_BLOCKS,
    ...COST_STAT_BLOCKS,
    ...ALERTS_STAT_BLOCKS,
    ...DASHBOARD_STAT_BLOCKS,
    ...OPERATORS_STAT_BLOCKS,
    ...DEPLOY_STAT_BLOCKS,
  ]

  // Deduplicate by ID
  const uniqueBlocks = new Map<string, StatBlockConfig>()
  for (const block of allBlocks) {
    if (!uniqueBlocks.has(block.id)) {
      uniqueBlocks.set(block.id, block)
    }
  }

  return Array.from(uniqueBlocks.values())
})()

/**
 * Get default stat blocks for a specific dashboard type
 */
export function getDefaultStatBlocks(dashboardType: DashboardStatsType): StatBlockConfig[] {
  switch (dashboardType) {
    case 'clusters':
      return CLUSTERS_STAT_BLOCKS
    case 'workloads':
      return WORKLOADS_STAT_BLOCKS
    case 'pods':
      return PODS_STAT_BLOCKS
    case 'gitops':
      return GITOPS_STAT_BLOCKS
    case 'storage':
      return STORAGE_STAT_BLOCKS
    case 'network':
      return NETWORK_STAT_BLOCKS
    case 'security':
      return SECURITY_STAT_BLOCKS
    case 'compliance':
      return COMPLIANCE_STAT_BLOCKS
    case 'data-compliance':
      return DATA_COMPLIANCE_STAT_BLOCKS
    case 'compute':
      return COMPUTE_STAT_BLOCKS
    case 'events':
      return EVENTS_STAT_BLOCKS
    case 'cost':
      return COST_STAT_BLOCKS
    case 'alerts':
      return ALERTS_STAT_BLOCKS
    case 'dashboard':
      return DASHBOARD_STAT_BLOCKS
    case 'operators':
      return OPERATORS_STAT_BLOCKS
    case 'deploy':
      return DEPLOY_STAT_BLOCKS
    default:
      return []
  }
}

/**
 * Get the storage key for a specific dashboard type
 */
export function getStatsStorageKey(dashboardType: DashboardStatsType): string {
  return `${dashboardType}-stats-config`
}
