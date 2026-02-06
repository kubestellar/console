/**
 * Widget Registry
 *
 * Defines which cards and stat blocks are compatible with desktop widget export.
 * Each entry maps to an API endpoint and specifies export configuration.
 */

export interface WidgetCardDefinition {
  cardType: string
  displayName: string
  description: string
  apiEndpoints: string[]
  requiredConfig?: string[]
  supportsTheme: boolean
  minRefreshInterval: number // milliseconds
  defaultSize: { width: number; height: number }
  category: 'cluster' | 'workload' | 'gpu' | 'security' | 'monitoring'
}

export interface WidgetStatDefinition {
  statId: string
  displayName: string
  apiEndpoint: string
  dataPath: string // JSON path to extract value
  format: 'number' | 'percentage' | 'bytes' | 'duration'
  icon?: string
  color: string
  size: { width: number; height: number }
}

export interface WidgetTemplateDefinition {
  templateId: string
  displayName: string
  description: string
  cards: string[] // Card types included
  stats?: string[] // Stat blocks included
  layout: 'grid' | 'row' | 'column' | 'dashboard'
  gridCols?: number
  size: { width: number; height: number }
  category: 'overview' | 'gpu' | 'pods' | 'security' | 'custom'
}

// Cards that support widget export
export const WIDGET_CARDS: Record<string, WidgetCardDefinition> = {
  cluster_health: {
    cardType: 'cluster_health',
    displayName: 'Cluster Health',
    description: 'Shows cluster health status with healthy/unhealthy counts',
    apiEndpoints: ['/api/mcp/clusters'],
    supportsTheme: true,
    minRefreshInterval: 30000,
    defaultSize: { width: 200, height: 150 },
    category: 'cluster',
  },
  pod_issues: {
    cardType: 'pod_issues',
    displayName: 'Pod Issues',
    description: 'Displays pods with issues like CrashLoopBackOff, OOMKilled',
    apiEndpoints: ['/api/mcp/pod-issues'],
    supportsTheme: true,
    minRefreshInterval: 30000,
    defaultSize: { width: 250, height: 200 },
    category: 'workload',
  },
  gpu_overview: {
    cardType: 'gpu_overview',
    displayName: 'GPU Overview',
    description: 'GPU utilization and allocation across clusters',
    apiEndpoints: ['/api/mcp/gpu-nodes'],
    supportsTheme: true,
    minRefreshInterval: 60000,
    defaultSize: { width: 200, height: 180 },
    category: 'gpu',
  },
  cluster_metrics: {
    cardType: 'cluster_metrics',
    displayName: 'Cluster Metrics',
    description: 'CPU, memory, and pod metrics over time',
    apiEndpoints: ['/api/mcp/clusters'],
    supportsTheme: true,
    minRefreshInterval: 30000,
    defaultSize: { width: 300, height: 200 },
    category: 'monitoring',
  },
  workload_status: {
    cardType: 'workload_status',
    displayName: 'Workload Status',
    description: 'Deployment and workload health status',
    apiEndpoints: ['/api/mcp/workloads'],
    supportsTheme: true,
    minRefreshInterval: 30000,
    defaultSize: { width: 250, height: 180 },
    category: 'workload',
  },
  security_issues: {
    cardType: 'security_issues',
    displayName: 'Security Issues',
    description: 'Security vulnerabilities and policy violations',
    apiEndpoints: ['/api/mcp/security'],
    supportsTheme: true,
    minRefreshInterval: 60000,
    defaultSize: { width: 250, height: 200 },
    category: 'security',
  },
  app_status: {
    cardType: 'app_status',
    displayName: 'Application Status',
    description: 'Application deployment status across clusters',
    apiEndpoints: ['/api/mcp/workloads'],
    supportsTheme: true,
    minRefreshInterval: 30000,
    defaultSize: { width: 220, height: 160 },
    category: 'workload',
  },
  top_pods: {
    cardType: 'top_pods',
    displayName: 'Top Pods',
    description: 'Resource-intensive pods by CPU/memory',
    apiEndpoints: ['/api/mcp/pods'],
    supportsTheme: true,
    minRefreshInterval: 30000,
    defaultSize: { width: 250, height: 200 },
    category: 'workload',
  },
  // AI/Console cards
  console_ai_offline_detection: {
    cardType: 'console_ai_offline_detection',
    displayName: 'AI Node Offline Detection',
    description: 'Detects offline nodes and unavailable GPUs',
    apiEndpoints: ['/nodes', '/api/mcp/gpu-nodes'],
    supportsTheme: true,
    minRefreshInterval: 30000,
    defaultSize: { width: 280, height: 220 },
    category: 'monitoring',
  },
  console_ai_health_check: {
    cardType: 'console_ai_health_check',
    displayName: 'AI Health Check',
    description: 'AI-powered cluster health analysis',
    apiEndpoints: ['/api/mcp/clusters', '/api/mcp/pod-issues'],
    supportsTheme: true,
    minRefreshInterval: 60000,
    defaultSize: { width: 280, height: 220 },
    category: 'monitoring',
  },
  // Namespace cards
  namespace_overview: {
    cardType: 'namespace_overview',
    displayName: 'Namespace Overview',
    description: 'Summary of resources within a namespace',
    apiEndpoints: ['/api/mcp/namespaces'],
    supportsTheme: true,
    minRefreshInterval: 30000,
    defaultSize: { width: 250, height: 180 },
    category: 'workload',
  },
  // Events cards
  event_summary: {
    cardType: 'event_summary',
    displayName: 'Event Summary',
    description: 'Aggregated event counts by type',
    apiEndpoints: ['/api/mcp/events'],
    supportsTheme: true,
    minRefreshInterval: 30000,
    defaultSize: { width: 220, height: 160 },
    category: 'monitoring',
  },
  warning_events: {
    cardType: 'warning_events',
    displayName: 'Warning Events',
    description: 'Warning-level events that need attention',
    apiEndpoints: ['/api/mcp/events'],
    supportsTheme: true,
    minRefreshInterval: 30000,
    defaultSize: { width: 250, height: 200 },
    category: 'monitoring',
  },
  // Storage cards
  storage_overview: {
    cardType: 'storage_overview',
    displayName: 'Storage Overview',
    description: 'Persistent volume and storage class overview',
    apiEndpoints: ['/api/mcp/storage'],
    supportsTheme: true,
    minRefreshInterval: 60000,
    defaultSize: { width: 250, height: 180 },
    category: 'cluster',
  },
  pvc_status: {
    cardType: 'pvc_status',
    displayName: 'PVC Status',
    description: 'Status of Persistent Volume Claims',
    apiEndpoints: ['/api/mcp/pvcs'],
    supportsTheme: true,
    minRefreshInterval: 60000,
    defaultSize: { width: 250, height: 180 },
    category: 'cluster',
  },
  // Network cards
  network_overview: {
    cardType: 'network_overview',
    displayName: 'Network Overview',
    description: 'Network policies and services summary',
    apiEndpoints: ['/api/mcp/network'],
    supportsTheme: true,
    minRefreshInterval: 60000,
    defaultSize: { width: 250, height: 180 },
    category: 'cluster',
  },
  service_status: {
    cardType: 'service_status',
    displayName: 'Service Status',
    description: 'Kubernetes services and endpoints',
    apiEndpoints: ['/api/mcp/services'],
    supportsTheme: true,
    minRefreshInterval: 30000,
    defaultSize: { width: 250, height: 180 },
    category: 'cluster',
  },
  // Operator cards
  operator_status: {
    cardType: 'operator_status',
    displayName: 'Operator Status',
    description: 'Status of installed Kubernetes operators',
    apiEndpoints: ['/api/mcp/operators'],
    supportsTheme: true,
    minRefreshInterval: 60000,
    defaultSize: { width: 250, height: 180 },
    category: 'workload',
  },
  // Cost cards
  opencost_overview: {
    cardType: 'opencost_overview',
    displayName: 'OpenCost Overview',
    description: 'Cost allocation data from OpenCost',
    apiEndpoints: ['/api/mcp/costs'],
    supportsTheme: true,
    minRefreshInterval: 300000,
    defaultSize: { width: 280, height: 200 },
    category: 'monitoring',
  },
  // Alerting cards
  active_alerts: {
    cardType: 'active_alerts',
    displayName: 'Active Alerts',
    description: 'Currently firing alerts',
    apiEndpoints: ['/api/alerts'],
    supportsTheme: true,
    minRefreshInterval: 30000,
    defaultSize: { width: 250, height: 200 },
    category: 'monitoring',
  },
  // GitOps cards
  helm_releases: {
    cardType: 'helm_releases',
    displayName: 'Helm Releases',
    description: 'Status of deployed Helm releases',
    apiEndpoints: ['/api/mcp/helm'],
    supportsTheme: true,
    minRefreshInterval: 60000,
    defaultSize: { width: 250, height: 180 },
    category: 'workload',
  },
  // Provider health
  provider_health: {
    cardType: 'provider_health',
    displayName: 'Provider Health',
    description: 'AI and cloud infrastructure provider status',
    apiEndpoints: ['/api/providers/health'],
    supportsTheme: true,
    minRefreshInterval: 60000,
    defaultSize: { width: 280, height: 200 },
    category: 'monitoring',
  },
}

// Stat blocks that can be exported as mini widgets
export const WIDGET_STATS: Record<string, WidgetStatDefinition> = {
  total_clusters: {
    statId: 'total_clusters',
    displayName: 'Clusters',
    apiEndpoint: '/api/mcp/clusters',
    dataPath: 'clusters.length',
    format: 'number',
    icon: 'Server',
    color: '#9333ea', // purple
    size: { width: 80, height: 60 },
  },
  total_pods: {
    statId: 'total_pods',
    displayName: 'Pods',
    apiEndpoint: '/api/mcp/pods',
    dataPath: 'pods.length',
    format: 'number',
    icon: 'Box',
    color: '#3b82f6', // blue
    size: { width: 80, height: 60 },
  },
  total_gpus: {
    statId: 'total_gpus',
    displayName: 'GPUs',
    apiEndpoint: '/api/mcp/gpu-nodes',
    dataPath: 'nodes.reduce((s,n) => s + n.gpuCount, 0)',
    format: 'number',
    icon: 'Cpu',
    color: '#22c55e', // green
    size: { width: 80, height: 60 },
  },
  cpu_usage: {
    statId: 'cpu_usage',
    displayName: 'CPU',
    apiEndpoint: '/api/mcp/clusters',
    dataPath: 'clusters.reduce((s,c) => s + c.cpuUsage, 0) / clusters.length',
    format: 'percentage',
    icon: 'Activity',
    color: '#f59e0b', // amber
    size: { width: 80, height: 60 },
  },
  memory_usage: {
    statId: 'memory_usage',
    displayName: 'Memory',
    apiEndpoint: '/api/mcp/clusters',
    dataPath: 'clusters.reduce((s,c) => s + c.memoryUsage, 0) / clusters.length',
    format: 'percentage',
    icon: 'HardDrive',
    color: '#06b6d4', // cyan
    size: { width: 80, height: 60 },
  },
  unhealthy_pods: {
    statId: 'unhealthy_pods',
    displayName: 'Issues',
    apiEndpoint: '/api/mcp/pod-issues',
    dataPath: 'issues.length',
    format: 'number',
    icon: 'AlertTriangle',
    color: '#ef4444', // red
    size: { width: 80, height: 60 },
  },
  active_alerts: {
    statId: 'active_alerts',
    displayName: 'Alerts',
    apiEndpoint: '/api/alerts',
    dataPath: 'alerts.filter(a => a.active).length',
    format: 'number',
    icon: 'Bell',
    color: '#f97316', // orange
    size: { width: 80, height: 60 },
  },
}

// Pre-built widget templates combining multiple cards/stats
export const WIDGET_TEMPLATES: Record<string, WidgetTemplateDefinition> = {
  cluster_overview: {
    templateId: 'cluster_overview',
    displayName: 'Cluster Overview',
    description: 'Complete cluster health dashboard with key metrics',
    cards: ['cluster_health', 'pod_issues', 'gpu_overview'],
    stats: ['total_clusters', 'total_pods', 'total_gpus', 'unhealthy_pods'],
    layout: 'dashboard',
    size: { width: 400, height: 300 },
    category: 'overview',
  },
  gpu_dashboard: {
    templateId: 'gpu_dashboard',
    displayName: 'GPU Dashboard',
    description: 'GPU utilization and allocation monitoring',
    cards: ['gpu_overview'],
    stats: ['total_gpus', 'cpu_usage', 'memory_usage'],
    layout: 'column',
    size: { width: 300, height: 350 },
    category: 'gpu',
  },
  pod_monitor: {
    templateId: 'pod_monitor',
    displayName: 'Pod Monitor',
    description: 'Pod health and issue tracking',
    cards: ['pod_issues', 'top_pods'],
    stats: ['total_pods', 'unhealthy_pods'],
    layout: 'grid',
    gridCols: 2,
    size: { width: 400, height: 350 },
    category: 'pods',
  },
  security_view: {
    templateId: 'security_view',
    displayName: 'Security View',
    description: 'Security issues and compliance status',
    cards: ['security_issues'],
    stats: ['active_alerts'],
    layout: 'column',
    size: { width: 300, height: 280 },
    category: 'security',
  },
  stat_bar: {
    templateId: 'stat_bar',
    displayName: 'Stats Bar',
    description: 'Compact horizontal bar with all key stats',
    cards: [],
    stats: ['total_clusters', 'total_pods', 'total_gpus', 'cpu_usage', 'memory_usage', 'unhealthy_pods'],
    layout: 'row',
    size: { width: 500, height: 70 },
    category: 'overview',
  },
  mini_dashboard: {
    templateId: 'mini_dashboard',
    displayName: 'Mini Dashboard',
    description: 'Compact 2x2 grid of key stats',
    cards: [],
    stats: ['total_clusters', 'total_pods', 'total_gpus', 'unhealthy_pods'],
    layout: 'grid',
    gridCols: 2,
    size: { width: 180, height: 150 },
    category: 'overview',
  },
}

// Cards that cannot be exported (interactive or require WebSocket)
export const NON_EXPORTABLE_CARDS = new Set([
  'event_stream',
  'kubectl_terminal',
  'log_viewer',
  'shell_terminal',
  'arcade',
  'snake_game',
])

// Check if a card type supports widget export
export function isCardExportable(cardType: string): boolean {
  return cardType in WIDGET_CARDS && !NON_EXPORTABLE_CARDS.has(cardType)
}

// Get all exportable cards by category
export function getExportableCardsByCategory(): Record<string, WidgetCardDefinition[]> {
  const result: Record<string, WidgetCardDefinition[]> = {}

  for (const card of Object.values(WIDGET_CARDS)) {
    if (!result[card.category]) {
      result[card.category] = []
    }
    result[card.category].push(card)
  }

  return result
}

// Get all templates by category
export function getTemplatesByCategory(): Record<string, WidgetTemplateDefinition[]> {
  const result: Record<string, WidgetTemplateDefinition[]> = {}

  for (const template of Object.values(WIDGET_TEMPLATES)) {
    if (!result[template.category]) {
      result[template.category] = []
    }
    result[template.category].push(template)
  }

  return result
}
