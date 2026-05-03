/**
 * Stat block definitions for all dashboard types.
 *
 * Every stat block whose id appears on more than one dashboard MUST come
 * from STAT_BLOCK_REGISTRY. That way a block like "clusters" renders with
 * the same icon, name, and color everywhere it appears. Dashboards used to
 * re-declare blocks inline, which drifted (clusters was Server/purple on
 * some dashboards, Server/cyan on Pods, Server/blue on Operators). The
 * registry eliminates that drift.
 *
 * If a block is unique to one dashboard, it can stay as an inline literal
 * in that dashboard's array.
 */

/**
 * Display mode for a stat block visualization
 */
export type StatDisplayMode =
  | 'numeric'
  | 'sparkline'
  | 'gauge'
  | 'ring-3'
  | 'mini-bar'
  | 'trend'
  | 'stacked-bar'
  | 'heatmap'
  | 'horseshoe'

/**
 * Configuration for a single stat block
 */
export interface StatBlockConfig {
  id: string
  name: string
  icon: string
  visible: boolean
  color: string
  /** Visualization mode — defaults to 'numeric' if absent (backward-compatible) */
  displayMode?: StatDisplayMode
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
  | 'ai-agents'
  | 'cluster-admin'
  | 'insights'
  | 'multi-tenancy'
  | 'ci-cd'
  | 'karmada-ops'
  | 'drasi'
  | 'acmm'

/**
 * Canonical definition for a stat block.
 * The registry stores everything except `visible`, which is chosen per
 * dashboard (a block can be hidden by default on one dashboard and visible
 * on another).
 */
type CanonicalBlock = Omit<StatBlockConfig, 'visible'>

/**
 * Central registry of stat blocks shared across dashboards.
 * Adding a block here once guarantees it renders the same on every
 * dashboard that uses it. A block unique to a single dashboard can stay
 * as an inline literal in that dashboard's array instead of living here.
 */
export const STAT_BLOCK_REGISTRY = {
  // ── Cluster / fleet ──────────────────────────────────────────────
  clusters:   { id: 'clusters',   name: 'Clusters',   icon: 'Server',       color: 'purple' },
  healthy:    { id: 'healthy',    name: 'Healthy',    icon: 'CheckCircle2', color: 'green' },
  unhealthy:  { id: 'unhealthy',  name: 'Unhealthy',  icon: 'XCircle',      color: 'red' },
  unreachable:{ id: 'unreachable',name: 'Offline',    icon: 'WifiOff',      color: 'yellow' },
  degraded:   { id: 'degraded',   name: 'Degraded',   icon: 'AlertTriangle',color: 'orange' },
  offline:    { id: 'offline',    name: 'Offline',    icon: 'WifiOff',      color: 'red' },

  // ── Compute ──────────────────────────────────────────────────────
  nodes:      { id: 'nodes',      name: 'Nodes',      icon: 'Box',          color: 'cyan' },
  cpus:       { id: 'cpus',       name: 'CPUs',       icon: 'Cpu',          color: 'blue' },
  memory:     { id: 'memory',     name: 'Memory',     icon: 'MemoryStick',  color: 'green' },
  storage:    { id: 'storage',    name: 'Storage',    icon: 'HardDrive',    color: 'purple' },
  gpus:       { id: 'gpus',       name: 'GPUs',       icon: 'Zap',          color: 'yellow' },
  tpus:       { id: 'tpus',       name: 'TPUs',       icon: 'Sparkles',     color: 'cyan' },
  aius:       { id: 'aius',       name: 'AIUs',       icon: 'Cpu',          color: 'blue' },
  xpus:       { id: 'xpus',       name: 'XPUs',       icon: 'Zap',          color: 'green' },

  // ── Workloads ────────────────────────────────────────────────────
  pods:         { id: 'pods',         name: 'Pods',         icon: 'Layers',       color: 'blue' },
  deployments:  { id: 'deployments',  name: 'Deployments',  icon: 'Layers',       color: 'blue' },
  namespaces:   { id: 'namespaces',   name: 'Namespaces',   icon: 'FolderTree',   color: 'purple' },

  // ── Issues / alerts ──────────────────────────────────────────────
  pod_issues: { id: 'pod_issues', name: 'Pod Issues', icon: 'AlertOctagon', color: 'red' },
  warnings:   { id: 'warnings',   name: 'Warnings',   icon: 'AlertTriangle',color: 'yellow' },
  errors:     { id: 'errors',     name: 'Errors',     icon: 'XCircle',      color: 'red' },
  critical:   { id: 'critical',   name: 'Critical',   icon: 'AlertCircle',  color: 'red' },
  pending:    { id: 'pending',    name: 'Pending',    icon: 'Clock',        color: 'yellow' },

  // ── GitOps / Deploy ──────────────────────────────────────────────
  helm:         { id: 'helm',         name: 'Helm Releases', icon: 'Package',     color: 'purple' },
  operators:    { id: 'operators',    name: 'Operators',     icon: 'Settings',    color: 'purple' },

  // ── Compliance ───────────────────────────────────────────────────
  pci_score:  { id: 'pci_score',  name: 'PCI DSS',    icon: 'ShieldCheck',  color: 'purple' },
} as const satisfies Record<string, CanonicalBlock>

/** Known registry ids. */
export type StatBlockId = keyof typeof STAT_BLOCK_REGISTRY

/**
 * Build a StatBlockConfig from the registry, picking visibility per
 * dashboard (defaults to true). Use this instead of repeating
 * `{ id, name, icon, color, visible }` literals — the whole point of
 * the registry is that id/name/icon/color are canonical across
 * dashboards.
 */
export function block(id: StatBlockId, visible = true): StatBlockConfig {
  const canonical = STAT_BLOCK_REGISTRY[id]
  return { ...canonical, visible }
}

/**
 * Default stat blocks for the Clusters dashboard
 */
export const CLUSTERS_STAT_BLOCKS: StatBlockConfig[] = [
  block('clusters'),
  block('healthy'),
  block('unhealthy'),
  block('unreachable'),
  block('nodes'),
  block('cpus'),
  block('memory'),
  block('storage'),
  block('gpus'),
  block('tpus', false),
  block('aius', false),
  block('xpus', false),
  block('pods'),
]

/**
 * Default stat blocks for the Workloads dashboard
 */
export const WORKLOADS_STAT_BLOCKS: StatBlockConfig[] = [
  block('namespaces'),
  block('critical'),
  { id: 'warning', name: 'Warning', icon: 'AlertTriangle', visible: true, color: 'yellow' },
  block('healthy'),
  block('deployments'),
  block('pod_issues'),
  { id: 'deployment_issues', name: 'Deploy Issues', icon: 'XCircle', visible: true, color: 'red' },
]

/**
 * Default stat blocks for the Pods dashboard
 */
export const PODS_STAT_BLOCKS: StatBlockConfig[] = [
  { id: 'total_pods', name: 'Total Pods', icon: 'Box', visible: true, color: 'purple' },
  block('healthy'),
  { id: 'issues', name: 'Issues', icon: 'AlertCircle', visible: true, color: 'red' },
  block('pending'),
  { id: 'restarts', name: 'High Restarts', icon: 'RotateCcw', visible: true, color: 'orange' },
  block('clusters'),
]

/**
 * Default stat blocks for the GitOps dashboard
 */
export const GITOPS_STAT_BLOCKS: StatBlockConfig[] = [
  { id: 'total', name: 'Total', icon: 'Package', visible: true, color: 'purple' },
  block('helm'),
  { id: 'kustomize', name: 'Kustomize', icon: 'Layers', visible: true, color: 'cyan' },
  block('operators'),
  { id: 'deployed', name: 'Deployed', icon: 'CheckCircle2', visible: true, color: 'green' },
  { id: 'failed', name: 'Failed', icon: 'XCircle', visible: true, color: 'red' },
  block('pending'),
  { id: 'other', name: 'Other', icon: 'MoreHorizontal', visible: true, color: 'gray' },
]

/**
 * Default stat blocks for the Storage dashboard
 */
export const STORAGE_STAT_BLOCKS: StatBlockConfig[] = [
  { id: 'ephemeral', name: 'Ephemeral', icon: 'HardDrive', visible: true, color: 'purple' },
  { id: 'pvcs', name: 'PVCs', icon: 'Database', visible: true, color: 'blue' },
  { id: 'bound', name: 'Bound', icon: 'CheckCircle2', visible: true, color: 'green' },
  block('pending'),
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
 * Default stat blocks for the Security dashboard.
 * `issues` here is deliberately NOT from the registry — Security's
 * "issues" means security findings (ShieldAlert), which is a different
 * semantic from Pods' generic "issues" (AlertCircle).
 */
export const SECURITY_STAT_BLOCKS: StatBlockConfig[] = [
  { id: 'issues', name: 'Issues', icon: 'ShieldAlert', visible: true, color: 'purple' },
  block('critical'),
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
  block('pci_score'),

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

  // Framework scores — pci_score reuses the registry canonical; other
  // framework scores are unique to this dashboard so they stay inline.
  { id: 'gdpr_score', name: 'GDPR', icon: 'Globe', visible: true, color: 'blue' },
  { id: 'hipaa_score', name: 'HIPAA', icon: 'Heart', visible: true, color: 'red' },
  block('pci_score'),
  { id: 'soc2_score', name: 'SOC 2', icon: 'ShieldCheck', visible: true, color: 'cyan' },
]

/**
 * Default stat blocks for the Compute dashboard
 */
export const COMPUTE_STAT_BLOCKS: StatBlockConfig[] = [
  block('nodes'),
  block('cpus'),
  block('memory'),
  block('gpus'),
  block('tpus'),
  block('pods'),
  { id: 'cpu_util', name: 'CPU Util', icon: 'Activity', visible: true, color: 'blue' },
  { id: 'memory_util', name: 'Memory Util', icon: 'Activity', visible: true, color: 'green' },
]

/**
 * Default stat blocks for the Events dashboard
 */
export const EVENTS_STAT_BLOCKS: StatBlockConfig[] = [
  { id: 'total', name: 'Total Events', icon: 'Activity', visible: true, color: 'purple' },
  block('warnings'),
  block('errors'),
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
  block('pending'),
  { id: 'resolved', name: 'Resolved', icon: 'CheckCircle2', visible: true, color: 'green' },
  { id: 'rules_enabled', name: 'Rules Enabled', icon: 'Shield', visible: true, color: 'blue' },
  { id: 'rules_disabled', name: 'Rules Disabled', icon: 'ShieldOff', visible: true, color: 'gray' },
]

/**
 * Default stat blocks for the main Dashboard
 */
export const DASHBOARD_STAT_BLOCKS: StatBlockConfig[] = [
  block('clusters'),
  block('healthy'),
  block('pods'),
  block('nodes'),
  block('namespaces'),
  block('errors'),
]

/**
 * Default stat blocks for the Operators dashboard
 */
export const OPERATORS_STAT_BLOCKS: StatBlockConfig[] = [
  block('operators'),
  { id: 'installed', name: 'Installed', icon: 'CheckCircle2', visible: true, color: 'green' },
  { id: 'installing', name: 'Installing', icon: 'RefreshCw', visible: true, color: 'blue' },
  { id: 'failing', name: 'Failing', icon: 'XCircle', visible: true, color: 'red' },
  { id: 'upgrades', name: 'Upgrades', icon: 'ArrowUpCircle', visible: true, color: 'orange' },
  { id: 'subscriptions', name: 'Subscriptions', icon: 'Newspaper', visible: true, color: 'blue' },
  { id: 'crds', name: 'CRDs', icon: 'FileCode', visible: true, color: 'cyan' },
  block('clusters'),
]

/**
 * Default stat blocks for the Deploy dashboard
 */
export const DEPLOY_STAT_BLOCKS: StatBlockConfig[] = [
  block('deployments'),
  block('healthy'),
  { id: 'progressing', name: 'Progressing', icon: 'Clock', visible: true, color: 'cyan' },
  { id: 'failed', name: 'Failed', icon: 'XCircle', visible: true, color: 'red' },
  block('helm'),
  { id: 'argocd', name: 'ArgoCD Apps', icon: 'Workflow', visible: true, color: 'orange' },
  block('namespaces'),
  block('clusters'),
]

/**
 * Default stat blocks for the Kagenti AI Agents dashboard
 */
export const KAGENTI_STAT_BLOCKS: StatBlockConfig[] = [
  { id: 'agents', name: 'Agents', icon: 'Bot', visible: true, color: 'purple' },
  { id: 'ready_agents', name: 'Ready', icon: 'CheckCircle2', visible: true, color: 'green' },
  { id: 'active_builds', name: 'Building', icon: 'Hammer', visible: true, color: 'blue' },
  { id: 'tools', name: 'MCP Tools', icon: 'Wrench', visible: true, color: 'cyan' },
  { id: 'clusters_with_kagenti', name: 'Clusters', icon: 'Server', visible: true, color: 'purple' },
]

/**
 * Default stat blocks for the Cluster Admin dashboard
 */
export const CLUSTER_ADMIN_STAT_BLOCKS: StatBlockConfig[] = [
  block('clusters'),
  block('healthy'),
  block('degraded'),
  block('offline'),
  block('nodes'),
  block('warnings'),
  block('pod_issues'),
  { id: 'alerts_firing', name: 'Alerts', icon: 'Bell', visible: true, color: 'orange' },
]

/**
 * Default stat blocks for the Multi-Tenancy dashboard
 */
export const MULTI_TENANCY_STAT_BLOCKS: StatBlockConfig[] = [
  { id: 'tenants', name: 'Tenants', icon: 'Users', visible: true, color: 'purple' },
  { id: 'isolation_score', name: 'Isolation', icon: 'Shield', visible: true, color: 'green', displayMode: 'gauge' },
  { id: 'control_planes', name: 'Control Planes', icon: 'Layers', visible: true, color: 'blue' },
  { id: 'vms', name: 'VMs', icon: 'Monitor', visible: true, color: 'orange' },
  { id: 'udn_networks', name: 'UDN Networks', icon: 'Network', visible: true, color: 'cyan' },
  { id: 'components', name: 'Components', icon: 'CheckCircle2', visible: true, color: 'green', displayMode: 'ring-3' },
]

/**
 * Default stat blocks for the ACMM dashboard
 */
export const ACMM_STAT_BLOCKS: StatBlockConfig[] = [
  { id: 'acmm_level', name: 'Maturity Level', icon: 'BarChart3', visible: true, color: 'purple', displayMode: 'ring-3' },
  { id: 'acmm_detected', name: 'Criteria Met', icon: 'CheckCircle2', visible: true, color: 'green', displayMode: 'gauge' },
  { id: 'acmm_next_level', name: 'Next Level', icon: 'TrendingUp', visible: true, color: 'cyan', displayMode: 'ring-3' },
  { id: 'acmm_by_source', name: 'Best Source', icon: 'Layers', visible: true, color: 'blue', displayMode: 'mini-bar' },
]

/**
 * Default stat blocks for the CI/CD dashboard
 */
export const CICD_STAT_BLOCKS: StatBlockConfig[] = [
  { id: 'cicd_pass_rate', name: 'Pass Rate', icon: 'Percent', visible: true, color: 'green', displayMode: 'ring-3' },
  { id: 'cicd_open_prs', name: 'Active PR Runs', icon: 'ClipboardList', visible: true, color: 'blue', displayMode: 'sparkline' },
  { id: 'cicd_failed_24h', name: 'Failed (24h)', icon: 'XCircle', visible: true, color: 'red' },
  { id: 'cicd_runs_today', name: 'Runs Today', icon: 'Clock', visible: true, color: 'cyan' },
  { id: 'cicd_streak', name: 'Nightly Streak', icon: 'Activity', visible: true, color: 'purple', displayMode: 'sparkline' },
  { id: 'cicd_total_workflows', name: 'Total Workflows', icon: 'Workflow', visible: true, color: 'yellow' },
]

/**
 * Default stat blocks for the Drasi dashboard
 */
export const DRASI_STAT_BLOCKS: StatBlockConfig[] = [
  { id: 'sources', name: 'Sources', icon: 'Database', visible: true, color: 'blue' },
  { id: 'queries', name: 'Queries', icon: 'Search', visible: true, color: 'cyan' },
  { id: 'reactions', name: 'Reactions', icon: 'Radio', visible: true, color: 'green' },
]

/**
 * Default stat blocks for the AI Agents dashboard
 */
export const AI_AGENTS_STAT_BLOCKS: StatBlockConfig[] = [
  { id: 'agents', name: 'Agents', icon: 'Bot', visible: true, color: 'purple' },
  { id: 'tools', name: 'MCP Tools', icon: 'Wrench', visible: true, color: 'cyan' },
  { id: 'builds', name: 'Builds', icon: 'Hammer', visible: true, color: 'blue' },
  block('clusters'),
  { id: 'spiffe', name: 'SPIFFE', icon: 'ShieldCheck', visible: true, color: 'orange' },
]

/**
 * Default stat blocks for the Insights dashboard
 */
export const INSIGHTS_STAT_BLOCKS: StatBlockConfig[] = [
  block('clusters'),
  { id: 'insights', name: 'Insights', icon: 'Lightbulb', visible: true, color: 'blue' },
  block('critical'),
  block('warnings'),
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
    ...KAGENTI_STAT_BLOCKS,
    ...CLUSTER_ADMIN_STAT_BLOCKS,
    ...MULTI_TENANCY_STAT_BLOCKS,
    ...CICD_STAT_BLOCKS,
    ...DRASI_STAT_BLOCKS,
    ...ACMM_STAT_BLOCKS,
    ...AI_AGENTS_STAT_BLOCKS,
    ...INSIGHTS_STAT_BLOCKS,
  ]

  // Deduplicate by ID
  const uniqueBlocks = new Map<string, StatBlockConfig>()
  for (const b of allBlocks) {
    if (!uniqueBlocks.has(b.id)) {
      uniqueBlocks.set(b.id, b)
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
    case 'ai-agents':
      return AI_AGENTS_STAT_BLOCKS
    case 'cluster-admin':
      return CLUSTER_ADMIN_STAT_BLOCKS
    case 'insights':
      return INSIGHTS_STAT_BLOCKS
    case 'multi-tenancy':
      return MULTI_TENANCY_STAT_BLOCKS
    case 'ci-cd':
      return CICD_STAT_BLOCKS
    case 'drasi':
      return DRASI_STAT_BLOCKS
    case 'acmm':
      return ACMM_STAT_BLOCKS
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

/**
 * Default display modes for specific stat blocks to showcase visualization options.
 * Key format: "dashboardType:blockId"
 */
export const STAT_DISPLAY_MODE_DEFAULTS: Record<string, StatDisplayMode> = {
  // Compliance — scores are percentages, perfect for gauges
  'compliance:score': 'gauge',
  'compliance:cis_score': 'gauge',
  'compliance:nsa_score': 'gauge',

  // Compute — utilization percentages fit rings
  'compute:cpu_util': 'ring-3',
  'compute:memory_util': 'ring-3',

  // Data compliance — horseshoe for scores
  'data-compliance:encryption_score': 'horseshoe',
  'data-compliance:gdpr_score': 'horseshoe',

  // Clusters — trend for healthy/pods, numeric for status counts
  'clusters:healthy': 'sparkline',
  'clusters:pods': 'sparkline',
  'clusters:unhealthy': 'numeric',
  'clusters:unreachable': 'numeric',

  // Workloads — trend delta for issues
  'workloads:critical': 'trend',
  'workloads:warning': 'trend',

  // Security — heatmap for severity
  'security:critical': 'heatmap',
  'security:high': 'heatmap',

  // Alerts — trend for firing
  'alerts:firing': 'trend',

  // Pods — trend over time
  'pods:total_pods': 'sparkline',

  // CI/CD — pass rate as ring, streak as sparkline, failed as heatmap
  'ci-cd:cicd_pass_rate': 'ring-3',
  'ci-cd:cicd_streak': 'sparkline',
  'ci-cd:cicd_failed_24h': 'heatmap',

  // Multi-tenancy — isolation score as gauge, components as ring, tenants as sparkline
  'multi-tenancy:isolation_score': 'gauge',
  'multi-tenancy:components': 'ring-3',
  'multi-tenancy:tenants': 'sparkline',
}

/**
 * Get the default display mode for a specific stat block on a specific dashboard.
 * Returns undefined if no non-numeric default is defined (falls back to 'numeric').
 */
export function getDefaultDisplayMode(
  dashboardType: DashboardStatsType,
  blockId: string,
): StatDisplayMode | undefined {
  return STAT_DISPLAY_MODE_DEFAULTS[`${dashboardType}:${blockId}`]
}
