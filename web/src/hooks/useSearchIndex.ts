import { useMemo } from 'react'
import { CARD_TITLES, CARD_DESCRIPTIONS } from '../components/cards/CardWrapper'
import { ALL_STAT_BLOCKS, type DashboardStatsType } from '../components/ui/StatsBlockDefinitions'
import { useClusters } from './mcp/clusters'
import { useDeployments, usePods } from './mcp/workloads'
import { useServices } from './mcp/networking'
import { useNodes } from './mcp/compute'
import { useHelmReleases } from './mcp/helm'
import { useMissions } from './useMissions'
import { useDashboards } from './useDashboards'

export type SearchCategory =
  | 'page'
  | 'card'
  | 'stat'
  | 'setting'
  | 'cluster'
  | 'namespace'
  | 'deployment'
  | 'pod'
  | 'service'
  | 'mission'
  | 'dashboard'
  | 'helm'
  | 'node'

export interface SearchItem {
  id: string
  name: string
  description?: string
  category: SearchCategory
  href?: string
  keywords?: string[]
  meta?: string
}

// Category display order (priority in results)
export const CATEGORY_ORDER: SearchCategory[] = [
  'page',
  'cluster',
  'mission',
  'deployment',
  'pod',
  'service',
  'namespace',
  'node',
  'helm',
  'dashboard',
  'card',
  'stat',
  'setting',
]

const MAX_PER_CATEGORY = 5
const MAX_TOTAL = 40

// --- Static items (computed once at module level) ---

const PAGE_ITEMS: SearchItem[] = [
  { id: 'page-dashboard', name: 'Dashboard', description: 'Main dashboard with overview cards', category: 'page', href: '/', keywords: ['home', 'overview', 'main'] },
  { id: 'page-clusters', name: 'Clusters', description: 'Manage Kubernetes clusters', category: 'page', href: '/clusters', keywords: ['kubernetes', 'k8s'] },
  { id: 'page-workloads', name: 'Workloads', description: 'View deployments, pods, and workloads', category: 'page', href: '/workloads', keywords: ['deployment', 'pod', 'replica'] },
  { id: 'page-compute', name: 'Compute', description: 'Nodes, CPUs, GPUs, and compute resources', category: 'page', href: '/compute', keywords: ['node', 'cpu', 'gpu', 'tpu'] },
  { id: 'page-storage', name: 'Storage', description: 'Persistent volumes and storage classes', category: 'page', href: '/storage', keywords: ['pvc', 'volume', 'disk'] },
  { id: 'page-network', name: 'Network', description: 'Services, ingress, and network policies', category: 'page', href: '/network', keywords: ['service', 'ingress', 'loadbalancer'] },
  { id: 'page-events', name: 'Events', description: 'Kubernetes cluster events', category: 'page', href: '/events', keywords: ['warning', 'error', 'log'] },
  { id: 'page-security', name: 'Security', description: 'RBAC, roles, and security policies', category: 'page', href: '/security', keywords: ['rbac', 'role', 'policy'] },
  { id: 'page-security-posture', name: 'Security Posture', description: 'Compliance scans and vulnerability reports', category: 'page', href: '/security-posture', keywords: ['compliance', 'scan', 'vulnerability', 'trivy', 'kubescape'] },
  { id: 'page-data-compliance', name: 'Data Compliance', description: 'Secrets, certificates, and data compliance', category: 'page', href: '/data-compliance', keywords: ['vault', 'cert', 'secret', 'gdpr', 'hipaa'] },
  { id: 'page-gitops', name: 'GitOps', description: 'Helm, Kustomize, ArgoCD, and drift detection', category: 'page', href: '/gitops', keywords: ['helm', 'argocd', 'kustomize', 'drift'] },
  { id: 'page-alerts', name: 'Alerts', description: 'Active alerts and alert rules', category: 'page', href: '/alerts', keywords: ['prometheus', 'firing', 'alertmanager'] },
  { id: 'page-arcade', name: 'Arcade', description: 'Games and fun activities', category: 'page', href: '/arcade', keywords: ['game', 'play', 'fun'] },
  { id: 'page-deploy', name: 'Deploy', description: 'Deploy workloads to clusters', category: 'page', href: '/deploy', keywords: ['rollout', 'release'] },
  { id: 'page-history', name: 'Card History', description: 'View history of card changes', category: 'page', href: '/history', keywords: ['changelog', 'audit'] },
  { id: 'page-namespaces', name: 'Namespaces', description: 'Manage Kubernetes namespaces', category: 'page', href: '/namespaces', keywords: ['ns'] },
  { id: 'page-users', name: 'User Management', description: 'Manage console users and roles', category: 'page', href: '/users', keywords: ['user', 'admin', 'permission'] },
  { id: 'page-settings', name: 'Settings', description: 'Console settings and configuration', category: 'page', href: '/settings', keywords: ['config', 'preference'] },
  { id: 'page-nodes', name: 'Nodes', description: 'Kubernetes node management', category: 'page', href: '/nodes', keywords: ['worker', 'master', 'control-plane'] },
  { id: 'page-pods', name: 'Pods', description: 'View all pods across clusters', category: 'page', href: '/pods', keywords: ['container'] },
  { id: 'page-services', name: 'Services', description: 'Kubernetes services overview', category: 'page', href: '/services', keywords: ['clusterip', 'loadbalancer', 'nodeport'] },
  { id: 'page-operators', name: 'Operators', description: 'Installed Kubernetes operators', category: 'page', href: '/operators', keywords: ['olm', 'subscription'] },
  { id: 'page-helm', name: 'Helm Releases', description: 'Deployed Helm charts and releases', category: 'page', href: '/helm', keywords: ['chart', 'release'] },
  { id: 'page-logs', name: 'Logs', description: 'Container and pod logs', category: 'page', href: '/logs', keywords: ['stdout', 'stderr', 'container'] },
  { id: 'page-cost', name: 'Cost', description: 'Infrastructure cost analysis', category: 'page', href: '/cost', keywords: ['opencost', 'kubecost', 'billing'] },
  { id: 'page-gpu-reservations', name: 'GPU Reservations', description: 'GPU resource reservations', category: 'page', href: '/gpu-reservations', keywords: ['nvidia', 'cuda', 'gpu'] },
  { id: 'page-cluster-compare', name: 'Cluster Comparison', description: 'Compare clusters side by side', category: 'page', href: '/compute/compare', keywords: ['diff', 'compare'] },
]

// Build card items from CARD_TITLES
// href uses #addCard:<type> so SearchDropdown can detect card actions
// and add the card to the dashboard instead of just navigating
const CARD_ITEMS: SearchItem[] = Object.entries(CARD_TITLES).map(([id, title]) => ({
  id: `card-${id}`,
  name: title,
  description: CARD_DESCRIPTIONS[id],
  category: 'card' as const,
  href: `#addCard:${id}`,
  keywords: [id, id.replace(/_/g, ' ')],
}))

// Build stat items from ALL_STAT_BLOCKS (deduplicate by name)
const STAT_DASHBOARD_MAP: Record<string, DashboardStatsType> = {}
const seenStatNames = new Set<string>()

// Map dashboard types to their routes
const DASHBOARD_ROUTES: Record<DashboardStatsType, string> = {
  clusters: '/clusters',
  workloads: '/workloads',
  pods: '/pods',
  gitops: '/gitops',
  storage: '/storage',
  network: '/network',
  security: '/security',
  compliance: '/security-posture',
  'data-compliance': '/data-compliance',
  compute: '/compute',
  events: '/events',
  cost: '/cost',
  alerts: '/alerts',
  dashboard: '/',
  operators: '/operators',
  deploy: '/deploy',
}

const STAT_ITEMS: SearchItem[] = ALL_STAT_BLOCKS.filter(block => {
  const key = block.name.toLowerCase()
  if (seenStatNames.has(key)) return false
  seenStatNames.add(key)
  return true
}).map(block => {
  const dashboard = STAT_DASHBOARD_MAP[block.id] || 'dashboard'
  return {
    id: `stat-${block.id}`,
    name: block.name,
    description: `Stat block on ${dashboard} dashboard`,
    category: 'stat' as const,
    href: DASHBOARD_ROUTES[dashboard] || '/',
    keywords: [block.id, block.icon.toLowerCase()],
  }
})

const SETTING_ITEMS: SearchItem[] = [
  { id: 'setting-ai', name: 'AI Settings', description: 'Configure AI mode: AI, Local, or Demo', category: 'setting', href: '/settings', keywords: ['mode', 'demo', 'local', 'ai'] },
  { id: 'setting-profile', name: 'Profile', description: 'Email and Slack ID configuration', category: 'setting', href: '/settings', keywords: ['email', 'slack'] },
  { id: 'setting-agent', name: 'Local Agent', description: 'Agent connection status and health', category: 'setting', href: '/settings', keywords: ['agent', 'kc-agent', 'connection'] },
  { id: 'setting-github', name: 'GitHub Integration', description: 'GitHub token and integration settings', category: 'setting', href: '/settings', keywords: ['github', 'token', 'git'] },
  { id: 'setting-updates', name: 'System Updates', description: 'Check for console updates', category: 'setting', href: '/settings', keywords: ['update', 'version'] },
  { id: 'setting-apikeys', name: 'API Keys', description: 'Manage Claude, OpenAI, and Gemini API keys', category: 'setting', href: '/settings', keywords: ['claude', 'openai', 'gemini', 'anthropic', 'key'] },
  { id: 'setting-tokens', name: 'Token Usage', description: 'LLM token usage tracking and limits', category: 'setting', href: '/settings', keywords: ['usage', 'llm', 'token', 'cost'] },
  { id: 'setting-theme', name: 'Theme', description: 'Light, dark, and system theme selection', category: 'setting', href: '/settings', keywords: ['dark', 'light', 'appearance'] },
  { id: 'setting-accessibility', name: 'Accessibility', description: 'Color blind mode, reduce motion, high contrast', category: 'setting', href: '/settings', keywords: ['a11y', 'colorblind', 'motion', 'contrast'] },
  { id: 'setting-permissions', name: 'Permissions', description: 'Permission validation and access control', category: 'setting', href: '/settings', keywords: ['permission', 'access', 'rbac'] },
]

// All static items combined
const STATIC_ITEMS: SearchItem[] = [
  ...PAGE_ITEMS,
  ...CARD_ITEMS,
  ...STAT_ITEMS,
  ...SETTING_ITEMS,
]

// --- Matching ---

function matchesQuery(item: SearchItem, query: string): boolean {
  const q = query.toLowerCase()
  if (item.name.toLowerCase().includes(q)) return true
  if (item.description?.toLowerCase().includes(q)) return true
  if (item.meta?.toLowerCase().includes(q)) return true
  if (item.keywords?.some(k => k.toLowerCase().includes(q))) return true
  return false
}

// --- Hook ---

export function useSearchIndex(query: string) {
  const { clusters } = useClusters()
  const { deployments } = useDeployments()
  const { pods } = usePods(undefined, undefined, 'name', 50)
  const { services } = useServices()
  const { nodes } = useNodes()
  const { releases } = useHelmReleases()
  const { missions } = useMissions()
  const { dashboards } = useDashboards()

  // Build dynamic items
  const dynamicItems = useMemo(() => {
    const items: SearchItem[] = []

    // Clusters
    for (const c of clusters) {
      items.push({
        id: `cluster-${c.name}`,
        name: c.name,
        description: c.context !== c.name ? `Context: ${c.context}` : undefined,
        category: 'cluster',
        href: `/clusters?name=${encodeURIComponent(c.name)}`,
        keywords: [c.context, c.server || ''].filter(Boolean),
        meta: c.healthy ? 'healthy' : 'unhealthy',
      })
    }

    // Deployments
    for (const d of deployments) {
      items.push({
        id: `deployment-${d.cluster}-${d.namespace}-${d.name}`,
        name: d.name,
        description: `${d.namespace} namespace`,
        category: 'deployment',
        href: `/workloads?deployment=${encodeURIComponent(d.name)}`,
        keywords: [d.image || ''].filter(Boolean),
        meta: [d.cluster, d.namespace, d.status].filter(Boolean).join(' '),
      })
    }

    // Pods
    for (const p of pods) {
      items.push({
        id: `pod-${p.cluster}-${p.namespace}-${p.name}`,
        name: p.name,
        description: `${p.namespace} namespace`,
        category: 'pod',
        href: `/workloads?pod=${encodeURIComponent(p.name)}`,
        meta: [p.cluster, p.namespace, p.status].filter(Boolean).join(' '),
      })
    }

    // Services
    for (const s of services) {
      items.push({
        id: `service-${s.cluster}-${s.namespace}-${s.name}`,
        name: s.name,
        description: `${s.type} in ${s.namespace}`,
        category: 'service',
        href: `/network?service=${encodeURIComponent(s.name)}`,
        meta: [s.cluster, s.namespace, s.type].filter(Boolean).join(' '),
      })
    }

    // Namespaces — derived from pods, deployments, and services
    const nsSet = new Set<string>()
    for (const d of deployments) if (d.namespace) nsSet.add(d.namespace)
    for (const p of pods) if (p.namespace) nsSet.add(p.namespace)
    for (const s of services) if (s.namespace) nsSet.add(s.namespace)
    for (const ns of Array.from(nsSet).sort()) {
      items.push({
        id: `namespace-${ns}`,
        name: ns,
        category: 'namespace',
        href: `/namespaces?ns=${encodeURIComponent(ns)}`,
      })
    }

    // Nodes
    for (const n of nodes) {
      items.push({
        id: `node-${n.cluster}-${n.name}`,
        name: n.name,
        description: n.roles.join(', ') || 'worker',
        category: 'node',
        href: `/compute?node=${encodeURIComponent(n.name)}`,
        meta: [n.cluster, n.status, ...n.roles].filter(Boolean).join(' '),
      })
    }

    // Helm releases
    for (const h of releases) {
      items.push({
        id: `helm-${h.cluster}-${h.namespace}-${h.name}`,
        name: h.name,
        description: `Chart: ${h.chart}`,
        category: 'helm',
        href: `/helm?release=${encodeURIComponent(h.name)}`,
        keywords: [h.chart, h.app_version].filter(Boolean),
        meta: [h.cluster, h.namespace, h.status].filter(Boolean).join(' '),
      })
    }

    // Missions
    for (const m of missions) {
      items.push({
        id: `mission-${m.id}`,
        name: m.title,
        description: m.description,
        category: 'mission',
        href: `#mission:${m.id}`,
        keywords: [m.type, m.status, m.cluster || ''].filter(Boolean),
        meta: `${m.type} ${m.status}`,
      })
    }

    // Custom dashboards
    for (const d of dashboards) {
      if (d.is_default) continue
      items.push({
        id: `dashboard-${d.id}`,
        name: d.name,
        description: 'Custom dashboard',
        category: 'dashboard',
        href: `/custom-dashboard/${d.id}`,
      })
    }

    return items
  }, [clusters, deployments, pods, services, nodes, releases, missions, dashboards])

  // Filter and group results
  const { results, totalCount } = useMemo(() => {
    if (!query.trim()) {
      return { results: new Map<SearchCategory, SearchItem[]>(), totalCount: 0 }
    }

    const allItems = [...STATIC_ITEMS, ...dynamicItems]
    const matched = allItems.filter(item => matchesQuery(item, query))

    // Group by category
    const grouped = new Map<SearchCategory, SearchItem[]>()
    for (const item of matched) {
      const list = grouped.get(item.category)
      if (list) {
        list.push(item)
      } else {
        grouped.set(item.category, [item])
      }
    }

    // Order by CATEGORY_ORDER and cap per category
    const ordered = new Map<SearchCategory, SearchItem[]>()
    let total = 0
    for (const cat of CATEGORY_ORDER) {
      const items = grouped.get(cat)
      if (!items || items.length === 0) continue
      if (total >= MAX_TOTAL) break
      const remaining = MAX_TOTAL - total
      const capped = items.slice(0, Math.min(MAX_PER_CATEGORY, remaining))
      ordered.set(cat, capped)
      total += capped.length
    }

    return { results: ordered, totalCount: matched.length }
  }, [query, dynamicItems])

  return { results, totalCount }
}
