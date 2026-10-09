import type { StatBlockConfig, DashboardStatsType } from './StatsBlockDefinitions'
import {
  CLUSTERS_STAT_BLOCKS,
  WORKLOADS_STAT_BLOCKS,
  PODS_STAT_BLOCKS,
  GITOPS_STAT_BLOCKS,
  STORAGE_STAT_BLOCKS,
  NETWORK_STAT_BLOCKS,
  SECURITY_STAT_BLOCKS,
  COMPLIANCE_STAT_BLOCKS,
  DATA_COMPLIANCE_STAT_BLOCKS,
  COMPUTE_STAT_BLOCKS,
  EVENTS_STAT_BLOCKS,
  COST_STAT_BLOCKS,
  ALERTS_STAT_BLOCKS,
  DASHBOARD_STAT_BLOCKS,
  OPERATORS_STAT_BLOCKS } from './StatsBlockDefinitions'

// Color classes for rendering
export const colorClasses: Record<string, string> = {
  purple: 'text-purple-400',
  green: 'text-green-400',
  orange: 'text-orange-400',
  yellow: 'text-yellow-400',
  cyan: 'text-cyan-400',
  blue: 'text-blue-400',
  red: 'text-red-400',
  gray: 'text-muted-foreground',
  indigo: 'text-blue-400',
  teal: 'text-cyan-400' }

// Icon emoji mapping for the config modal
export const iconEmojis: Record<string, string> = {
  Server: '🖥️',
  CheckCircle2: '✅',
  XCircle: '❌',
  WifiOff: '📡',
  Box: '📦',
  Cpu: '🔲',
  MemoryStick: '💾',
  HardDrive: '💽',
  Zap: '⚡',
  Layers: '🗂️',
  FolderOpen: '📁',
  AlertCircle: '🔴',
  AlertTriangle: '⚠️',
  AlertOctagon: '🛑',
  Package: '📦',
  Ship: '🚢',
  Settings: '⚙️',
  Clock: '🕐',
  MoreHorizontal: '⋯',
  Database: '🗄️',
  Workflow: '🔄',
  Globe: '🌐',
  Network: '🔗',
  ArrowRightLeft: '↔️',
  CircleDot: '⊙',
  ShieldAlert: '🛡️',
  ShieldOff: '⛔',
  User: '👤',
  Info: '💡',
  Percent: '💯',
  ClipboardList: '📋',
  Sparkles: '✨',
  Activity: '📈',
  List: '📜',
  DollarSign: '💵',
  Newspaper: '📰',
  RefreshCw: '🔄',
  ArrowUpCircle: '⬆️',
  FileCode: '📄',
  RotateCcw: '🔄',
  FolderTree: '🌲',
  Shield: '🛡️' }

/**
 * Dashboard categories with display names and icons
 */
export const DASHBOARD_CATEGORIES: { type: DashboardStatsType; name: string; icon: string }[] = [
  { type: 'clusters', name: 'Clusters', icon: '🖥️' },
  { type: 'workloads', name: 'Workloads', icon: '📦' },
  { type: 'pods', name: 'Pods', icon: '🗂️' },
  { type: 'compute', name: 'Compute', icon: '🔲' },
  { type: 'gitops', name: 'GitOps', icon: '🚢' },
  { type: 'storage', name: 'Storage', icon: '💽' },
  { type: 'network', name: 'Network', icon: '🌐' },
  { type: 'security', name: 'Security', icon: '🛡️' },
  { type: 'compliance', name: 'Compliance', icon: '🔒' },
  { type: 'data-compliance', name: 'Data Compliance', icon: '📋' },
  { type: 'events', name: 'Events', icon: '📜' },
  { type: 'cost', name: 'Cost', icon: '💵' },
  { type: 'alerts', name: 'Alerts', icon: '🔴' },
  { type: 'operators', name: 'Operators', icon: '⚙️' },
  { type: 'dashboard', name: 'Main Dashboard', icon: '📊' },
  { type: 'ci-cd', name: 'CI/CD', icon: '🔄' },
]

/**
 * Get stat blocks for a specific dashboard type
 */
export function getStatBlocksForDashboard(dashboardType: DashboardStatsType): StatBlockConfig[] {
  switch (dashboardType) {
    case 'clusters': return CLUSTERS_STAT_BLOCKS
    case 'workloads': return WORKLOADS_STAT_BLOCKS
    case 'pods': return PODS_STAT_BLOCKS
    case 'gitops': return GITOPS_STAT_BLOCKS
    case 'storage': return STORAGE_STAT_BLOCKS
    case 'network': return NETWORK_STAT_BLOCKS
    case 'security': return SECURITY_STAT_BLOCKS
    case 'compliance': return COMPLIANCE_STAT_BLOCKS
    case 'data-compliance': return DATA_COMPLIANCE_STAT_BLOCKS
    case 'compute': return COMPUTE_STAT_BLOCKS
    case 'events': return EVENTS_STAT_BLOCKS
    case 'cost': return COST_STAT_BLOCKS
    case 'alerts': return ALERTS_STAT_BLOCKS
    case 'dashboard': return DASHBOARD_STAT_BLOCKS
    case 'operators': return OPERATORS_STAT_BLOCKS
    case 'ci-cd': return GITOPS_STAT_BLOCKS
    default: return []
  }
}
