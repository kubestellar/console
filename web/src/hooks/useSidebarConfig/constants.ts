import { NAVIGATION_ICONS } from '../../lib/navigationIcons'
import { ROUTES } from '../../config/routes'

export const SIDEBAR_COLLAPSED_WIDTH_PX = 80
export const SIDEBAR_DEFAULT_WIDTH_PX = 256

export interface SidebarItem {
  id: string
  name: string
  icon: string
  href: string
  type: 'link' | 'section' | 'card'
  children?: SidebarItem[]
  cardType?: string
  isCustom?: boolean
  description?: string
  order: number
}

export interface SidebarConfig {
  primaryNav: SidebarItem[]
  secondaryNav: SidebarItem[]
  sections: SidebarItem[]
  showClusterStatus: boolean
  collapsed: boolean
  isMobileOpen: boolean
  removedBuiltinItemIds: string[]
  knownDefaultItemIds: string[]
  width?: number
}

export const DEFAULT_PRIMARY_NAV: SidebarItem[] = [
  { id: 'dashboard', name: 'Dashboard', icon: NAVIGATION_ICONS.dashboard, href: ROUTES.HOME, type: 'link', order: 0 },
  { id: 'clusters', name: 'My Clusters', icon: NAVIGATION_ICONS.clusters, href: ROUTES.CLUSTERS, type: 'link', order: 1 },
  { id: 'cluster-admin', name: 'Cluster Admin', icon: NAVIGATION_ICONS['cluster-admin'], href: ROUTES.CLUSTER_ADMIN, type: 'link', order: 2 },
  { id: 'compliance', name: 'Sec. Compliance', icon: NAVIGATION_ICONS.compliance, href: ROUTES.COMPLIANCE, type: 'link', order: 2.5 },
  { id: 'enterprise', name: 'Enterprise', icon: NAVIGATION_ICONS.enterprise, href: ROUTES.ENTERPRISE, type: 'link', order: 2.7 },
  { id: 'deploy', name: 'Deploy', icon: NAVIGATION_ICONS.deploy, href: ROUTES.DEPLOY, type: 'link', order: 3 },
  { id: 'insights', name: 'Insights', icon: NAVIGATION_ICONS.insights, href: ROUTES.INSIGHTS, type: 'link', order: 3.5 },
  { id: 'ai-ml', name: 'AI/ML', icon: NAVIGATION_ICONS['ai-ml'], href: ROUTES.AI_ML, type: 'link', order: 4 },
  { id: 'ai-agents', name: 'AI Agents', icon: NAVIGATION_ICONS['ai-agents'], href: ROUTES.AI_AGENTS, type: 'link', order: 5 },
  { id: 'acmm', name: 'ACMM', icon: NAVIGATION_ICONS.acmm, href: ROUTES.ACMM, type: 'link', order: 5.5 },
  { id: 'ci-cd', name: 'CI/CD', icon: NAVIGATION_ICONS['ci-cd'], href: ROUTES.CI_CD, type: 'link', order: 6 },
  { id: 'multi-tenancy', name: 'Multi-Tenancy', icon: NAVIGATION_ICONS['multi-tenancy'], href: ROUTES.MULTI_TENANCY, type: 'link', order: 6.5 },
  { id: 'alerts', name: 'Alerts', icon: NAVIGATION_ICONS.alerts, href: ROUTES.ALERTS, type: 'link', order: 7 },
  { id: 'arcade', name: 'Arcade', icon: NAVIGATION_ICONS.arcade, href: ROUTES.ARCADE, type: 'link', order: 8 },
]

export const DISCOVERABLE_DASHBOARDS: SidebarItem[] = [
  { id: 'quantum', name: 'Quantum Demo', icon: NAVIGATION_ICONS.quantum, href: ROUTES.QUANTUM, type: 'link', order: 0 },
  { id: 'compute', name: 'Compute', icon: NAVIGATION_ICONS.compute, href: ROUTES.COMPUTE, type: 'link', order: 1 },
  { id: 'cost', name: 'Cost', icon: NAVIGATION_ICONS.cost, href: ROUTES.COST, type: 'link', order: 2 },
  { id: 'data-compliance', name: 'Data Compliance', icon: NAVIGATION_ICONS['data-compliance'], href: ROUTES.DATA_COMPLIANCE, type: 'link', order: 3 },
  { id: 'deployments', name: 'Deployments', icon: NAVIGATION_ICONS.deployments, href: ROUTES.DEPLOYMENTS, type: 'link', order: 4 },
  { id: 'events', name: 'Events', icon: NAVIGATION_ICONS.events, href: ROUTES.EVENTS, type: 'link', order: 5 },
  { id: 'gitops', name: 'GitOps', icon: NAVIGATION_ICONS.gitops, href: ROUTES.GITOPS, type: 'link', order: 6 },
  { id: 'gpu-reservations', name: 'GPU Reservations', icon: NAVIGATION_ICONS['gpu-reservations'], href: ROUTES.GPU_RESERVATIONS, type: 'link', order: 7 },
  { id: 'karmada-ops', name: 'Karmada Ops', icon: NAVIGATION_ICONS['karmada-ops'], href: ROUTES.KARMADA_OPS, type: 'link', order: 8 },
  { id: 'helm', name: 'Helm', icon: NAVIGATION_ICONS.helm, href: ROUTES.HELM, type: 'link', order: 8 },
  { id: 'llm-d-benchmarks', name: 'llm-d Benchmarks', icon: NAVIGATION_ICONS['llm-d-benchmarks'], href: ROUTES.LLM_D_BENCHMARKS, type: 'link', order: 9 },
  { id: 'logs', name: 'Logs', icon: NAVIGATION_ICONS.logs, href: ROUTES.LOGS, type: 'link', order: 10 },
  { id: 'network', name: 'Network', icon: NAVIGATION_ICONS.network, href: ROUTES.NETWORK, type: 'link', order: 11 },
  { id: 'nodes', name: 'Nodes', icon: NAVIGATION_ICONS.nodes, href: ROUTES.NODES, type: 'link', order: 12 },
  { id: 'operators', name: 'Operators', icon: NAVIGATION_ICONS.operators, href: ROUTES.OPERATORS, type: 'link', order: 13 },
  { id: 'pods', name: 'Pods', icon: NAVIGATION_ICONS.pods, href: ROUTES.PODS, type: 'link', order: 14 },
  { id: 'security', name: 'Security', icon: NAVIGATION_ICONS.security, href: ROUTES.SECURITY, type: 'link', order: 15 },
  { id: 'security-posture', name: 'Security Posture', icon: NAVIGATION_ICONS['security-posture'], href: ROUTES.SECURITY_POSTURE, type: 'link', order: 16 },
  { id: 'services', name: 'Services', icon: NAVIGATION_ICONS.services, href: ROUTES.SERVICES, type: 'link', order: 17 },
  { id: 'storage', name: 'Storage', icon: NAVIGATION_ICONS.storage, href: ROUTES.STORAGE, type: 'link', order: 18 },
  { id: 'workloads', name: 'Workloads', icon: NAVIGATION_ICONS.workloads, href: ROUTES.WORKLOADS, type: 'link', order: 19 },
]

export const DEFAULT_SECONDARY_NAV: SidebarItem[] = [
  { id: 'marketplace', name: 'Marketplace', icon: NAVIGATION_ICONS.marketplace, href: ROUTES.MARKETPLACE, type: 'link', order: 0 },
  { id: 'history', name: 'Card History', icon: NAVIGATION_ICONS.history, href: ROUTES.HISTORY, type: 'link', order: 1 },
  { id: 'namespaces', name: 'Namespaces', icon: NAVIGATION_ICONS.namespaces, href: ROUTES.NAMESPACES, type: 'link', order: 2 },
  { id: 'users', name: 'User Management', icon: NAVIGATION_ICONS.users, href: ROUTES.USERS, type: 'link', order: 3 },
  { id: 'settings', name: 'Settings', icon: NAVIGATION_ICONS.settings, href: ROUTES.SETTINGS, type: 'link', order: 4 },
]

export const DEFAULT_NAV_ITEMS = [...DEFAULT_PRIMARY_NAV, ...DEFAULT_SECONDARY_NAV]
export const DEFAULT_NAV_ITEM_IDS = DEFAULT_NAV_ITEMS.map(item => item.id)
export const DEFAULT_NAV_ITEM_ID_SET = new Set(DEFAULT_NAV_ITEM_IDS)
export const DEFAULT_CONFIG: SidebarConfig = {
  primaryNav: DEFAULT_PRIMARY_NAV,
  secondaryNav: DEFAULT_SECONDARY_NAV,
  sections: [],
  showClusterStatus: true,
  collapsed: false,
  isMobileOpen: false,
  removedBuiltinItemIds: [],
  knownDefaultItemIds: DEFAULT_NAV_ITEM_IDS,
}
export const STORAGE_KEY = 'kubestellar-sidebar-config-v11'
export const OLD_STORAGE_KEY = 'kubestellar-sidebar-config-v10'
export const ENABLED_DASHBOARDS_STORAGE_KEY = `${STORAGE_KEY}-enabled-dashboards`
export const BUILTIN_NAV_ITEMS = [...DEFAULT_NAV_ITEMS, ...DISCOVERABLE_DASHBOARDS]
export const BUILTIN_NAV_ITEMS_BY_ID = new Map(BUILTIN_NAV_ITEMS.map(item => [item.id, item]))
export const BUILTIN_NAV_ITEMS_BY_HREF = new Map(BUILTIN_NAV_ITEMS.map(item => [item.href, item]))
export const BUILTIN_NAV_ITEM_IDS = new Set(BUILTIN_NAV_ITEMS.map(item => item.id))
export const DEPRECATED_ROUTES = ['/apps']
export const PROTECTED_SIDEBAR_IDS = ['dashboard', 'clusters', 'deploy']
export const AVAILABLE_ICONS = [
  'LayoutDashboard', 'Server', 'Box', 'Activity', 'Shield', 'GitBranch',
  'History', 'Settings', 'Plus', 'Zap', 'Database', 'Cloud', 'Lock',
  'Key', 'Users', 'Bell', 'AlertTriangle', 'CheckCircle', 'XCircle',
  'RefreshCw', 'Search', 'Filter', 'Layers', 'Globe', 'Terminal',
  'Code', 'Cpu', 'HardDrive', 'Wifi', 'Monitor', 'Folder', 'Gamepad2', 'Bot',
  'Sparkles', 'GitMerge', 'Rocket', 'ShieldCheck', 'ClipboardCheck', 'Lightbulb',
  'DollarSign', 'Package', 'FileText', 'CircuitBoard', 'Cog', 'Hexagon', 'Network',
]
