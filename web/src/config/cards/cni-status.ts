/**
 * CNI Status Card Configuration
 *
 * The Container Network Interface (CNI) plugin provides pod networking inside
 * a Kubernetes cluster. This card surfaces the active plugin (Cilium, Calico,
 * Flannel, etc.), per-node CNI readiness, pod network CIDR, and NetworkPolicy
 * coverage across services.
 */
import type { UnifiedCardConfig } from '../../lib/unified/types'

export const cniStatusConfig: UnifiedCardConfig = {
  type: 'cni_status',
  title: 'CNI',
  category: 'network',
  description:
    'Container Network Interface plugin status: active plugin, per-node CNI readiness, pod network CIDR, and NetworkPolicy coverage.',
  icon: 'Network',
  iconColor: 'text-cyan-400',
  defaultWidth: 6,
  defaultHeight: 4,
  dataSource: { type: 'hook', hook: 'useCachedCni' },
  content: {
    type: 'list',
    pageSize: 8,
    columns: [
      { field: 'node', header: 'Node', primary: true, render: 'truncate' },
      { field: 'state', header: 'State', width: 100, render: 'status-badge' },
      { field: 'plugin', header: 'Plugin', width: 120 },
      { field: 'pluginVersion', header: 'Version', width: 100 },
      { field: 'podCidr', header: 'Pod CIDR', width: 140 },
      { field: 'cluster', header: 'Cluster', width: 120, render: 'cluster-badge' },
    ],
  },
  emptyState: {
    icon: 'Network',
    title: 'CNI plugin not detected',
    message: 'No CNI metadata reachable from the connected clusters.',
    variant: 'info',
  },
  loadingState: {
    type: 'list',
    rows: 5,
  },
  // Scaffolding: renders live if /api/cni/status is wired up, otherwise
  // falls back to demo data via the useCache demo path.
  isDemoData: true,
  isLive: false,
}

export default cniStatusConfig
