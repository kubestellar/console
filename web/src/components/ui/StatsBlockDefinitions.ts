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
  { id: 'passing', name: 'Passing', icon: 'CheckCircle2', visible: true, color: 'green' },
  { id: 'failing', name: 'Failing', icon: 'XCircle', visible: true, color: 'red' },

  // Compliance frameworks
  { id: 'soc2', name: 'SOC 2', icon: 'ShieldCheck', visible: true, color: 'cyan' },
  { id: 'hipaa', name: 'HIPAA', icon: 'ShieldCheck', visible: true, color: 'blue' },
  { id: 'pci_dss', name: 'PCI DSS', icon: 'ShieldCheck', visible: true, color: 'purple' },
  { id: 'nist', name: 'NIST', icon: 'ShieldCheck', visible: true, color: 'gray' },
  { id: 'cis', name: 'CIS', icon: 'ShieldCheck', visible: true, color: 'cyan' },

  // Issues
  { id: 'critical_issues', name: 'Critical', icon: 'AlertCircle', visible: true, color: 'red' },
  { id: 'high_issues', name: 'High', icon: 'AlertTriangle', visible: true, color: 'orange' },
  { id: 'medium_issues', name: 'Medium', icon: 'AlertTriangle', visible: true, color: 'yellow' },
]

/**
 * Default stat blocks for the Data Compliance dashboard
 */
export const DATA_COMPLIANCE_STAT_BLOCKS: StatBlockConfig[] = [
  // Overall status
  { id: 'total_data_stores', name: 'Data Stores', icon: 'Database', visible: true, color: 'purple' },
  { id: 'compliant', name: 'Compliant', icon: 'CheckCircle2', visible: true, color: 'green' },
  { id: 'non_compliant', name: 'Non-Compliant', icon: 'XCircle', visible: true, color: 'red' },
  { id: 'under_review', name: 'Under Review', icon: 'Clock', visible: true, color: 'yellow' },

  // Data protection
  { id: 'encrypted_at_rest', name: 'Encrypted at Rest', icon: 'ShieldCheck', visible: true, color: 'green' },
  { id: 'encrypted_in_transit', name: 'Encrypted in Transit', icon: 'ShieldCheck', visible: true, color: 'blue' },
  { id: 'backup_enabled', name: 'Backup Enabled', icon: 'Database', visible: true, color: 'cyan' },
  { id: 'audit_logging', name: 'Audit Logging', icon: 'FileText', visible: true, color: 'purple' },

  // Data sovereignty
  { id: 'gdpr_compliant', name: 'GDPR Compliant', icon: 'Globe', visible: true, color: 'blue' },
  { id: 'ccpa_compliant', name: 'CCPA Compliant', icon: 'Shield', visible: true, color: 'cyan' },
  { id: 'data_residency_issues', name: 'Residency Issues', icon: 'AlertTriangle', visible: true, color: 'orange' },

  // Sensitive data
  { id: 'pii_detected', name: 'PII Detected', icon: 'User', visible: true, color: 'yellow' },
  { id: 'phi_detected', name: 'PHI Detected', icon: 'Heart', visible: true, color: 'red' },
  { id: 'pci_detected', name: 'PCI Data Detected', icon: 'CreditCard', visible: true, color: 'orange' },
]

/**
 * Default stat blocks for the Compute dashboard
 */
export const COMPUTE_STAT_BLOCKS: StatBlockConfig[] = [
  { id: 'cpu_usage', name: 'CPU Usage', icon: 'Cpu', visible: true, color: 'blue' },
  { id: 'memory_usage', name: 'Memory Usage', icon: 'MemoryStick', visible: true, color: 'green' },
  { id: 'storage_usage', name: 'Storage Usage', icon: 'HardDrive', visible: true, color: 'purple' },
  { id: 'gpu_usage', name: 'GPU Usage', icon: 'Zap', visible: true, color: 'yellow' },
  { id: 'network_io', name: 'Network I/O', icon: 'Network', visible: true, color: 'cyan' },
  { id: 'disk_io', name: 'Disk I/O', icon: 'HardDrive', visible: true, color: 'orange' },
]

/**
 * Default stat blocks for the Events dashboard
 */
export const EVENTS_STAT_BLOCKS: StatBlockConfig[] = [
  { id: 'total', name: 'Total Events', icon: 'Activity', visible: true, color: 'purple' },
  { id: 'warnings', name: 'Warnings', icon: 'AlertTriangle', visible: true, color: 'yellow' },
  { id: 'errors', name: 'Errors', icon: 'XCircle', visible: true, color: 'red' },
  { id: 'info', name: 'Info', icon: 'Info', visible: true, color: 'blue' },
]

/**
 * Default stat blocks for the Cost dashboard
 */
export const COST_STAT_BLOCKS: StatBlockConfig[] = [
  { id: 'total_cost', name: 'Total Cost', icon: 'DollarSign', visible: true, color: 'purple' },
  { id: 'compute_cost', name: 'Compute', icon: 'Cpu', visible: true, color: 'blue' },
  { id: 'storage_cost', name: 'Storage', icon: 'HardDrive', visible: true, color: 'cyan' },
  { id: 'network_cost', name: 'Network', icon: 'Network', visible: true, color: 'green' },
  { id: 'cost_trend', name: 'Trend', icon: 'TrendingUp', visible: true, color: 'yellow' },
]

/**
 * Default stat blocks for the Alerts dashboard
 */
export const ALERTS_STAT_BLOCKS: StatBlockConfig[] = [
  { id: 'total_alerts', name: 'Total Alerts', icon: 'AlertCircle', visible: true, color: 'purple' },
  { id: 'critical', name: 'Critical', icon: 'AlertOctagon', visible: true, color: 'red' },
  { id: 'warning', name: 'Warning', icon: 'AlertTriangle', visible: true, color: 'yellow' },
  { id: 'info', name: 'Info', icon: 'Info', visible: true, color: 'blue' },
]

/**
 * Default stat blocks for the main Dashboard
 */
export const DASHBOARD_STAT_BLOCKS: StatBlockConfig[] = [
  { id: 'clusters', name: 'Clusters', icon: 'Server', visible: true, color: 'purple' },
  { id: 'nodes', name: 'Nodes', icon: 'Box', visible: true, color: 'cyan' },
  { id: 'pods', name: 'Pods', icon: 'Layers', visible: true, color: 'blue' },
  { id: 'alerts', name: 'Alerts', icon: 'AlertCircle', visible: true, color: 'red' },
  { id: 'cpu', name: 'CPU', icon: 'Cpu', visible: true, color: 'green' },
  { id: 'memory', name: 'Memory', icon: 'MemoryStick', visible: true, color: 'purple' },
]

/**
 * Default stat blocks for the Operators dashboard
 */
export const OPERATORS_STAT_BLOCKS: StatBlockConfig[] = [
  { id: 'total', name: 'Total Operators', icon: 'Settings', visible: true, color: 'purple' },
  { id: 'running', name: 'Running', icon: 'CheckCircle2', visible: true, color: 'green' },
  { id: 'pending', name: 'Pending', icon: 'Clock', visible: true, color: 'yellow' },
  { id: 'failed', name: 'Failed', icon: 'XCircle', visible: true, color: 'red' },
  { id: 'succeeded', name: 'Succeeded', icon: 'CheckCircle2', visible: true, color: 'blue' },
  { id: 'installed', name: 'Installed', icon: 'Package', visible: true, color: 'cyan' },
  { id: 'creating', name: 'Creating', icon: 'Loader', visible: true, color: 'blue' },
  { id: 'deleting', name: 'Deleting', icon: 'Trash2', visible: true, color: 'orange' },
  { id: 'upgrading', name: 'Upgrading', icon: 'ArrowUp', visible: true, color: 'cyan' },
  { id: 'unknown', name: 'Unknown', icon: 'HelpCircle', visible: true, color: 'gray' },
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
