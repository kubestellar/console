/**
 * Shared navigation icon mapping — single source of truth for sidebar and page heading icons.
 *
 * Both the sidebar configuration (useSidebarConfig) and individual dashboard pages
 * reference this mapping to ensure consistent iconography across the UI.
 */

/** Maps a navigation item ID (or route path without leading slash) to a Lucide icon name. */
export const NAVIGATION_ICONS: Record<string, string> = {
  // Primary navigation
  'dashboard': 'LayoutDashboard',
  'clusters': 'Server',
  'cluster-admin': 'ShieldAlert',
  'compliance': 'ClipboardCheck',
  'enterprise': 'Building2',
  'deploy': 'Rocket',
  'insights': 'Lightbulb',
  'ai-ml': 'Sparkles',
  'ai-agents': 'Bot',
  'acmm': 'BarChart3',
  'ci-cd': 'GitMerge',
  'multi-tenancy': 'Users',
  'alerts': 'Bell',
  'arcade': 'Gamepad2',

  // Discoverable dashboards
  'compute': 'Monitor',
  'cost': 'DollarSign',
  'data-compliance': 'Database',
  'deployments': 'Layers',
  'events': 'Activity',
  'gitops': 'GitBranch',
  'gpu-reservations': 'Cpu',
  'karmada-ops': 'Globe',
  'helm': 'Package',
  'llm-d-benchmarks': 'TrendingUp',
  'logs': 'FileText',
  'network': 'Globe',
  'nodes': 'CircuitBoard',
  'operators': 'Cog',
  'pods': 'Hexagon',
  'security': 'Shield',
  'security-posture': 'ShieldCheck',
  'services': 'Network',
  'storage': 'HardDrive',
  'workloads': 'Box',

  // Secondary navigation
  'marketplace': 'Store',
  'history': 'History',
  'namespaces': 'Folder',
  'users': 'Users',
  'settings': 'Settings',
}

/**
 * Get the canonical icon name for a navigation item.
 * Falls back to 'LayoutDashboard' if the ID is not found.
 */
export function getNavigationIcon(id: string): string {
  return NAVIGATION_ICONS[id] || 'LayoutDashboard'
}
