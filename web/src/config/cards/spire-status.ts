/**
 * SPIRE (SPIFFE Runtime Environment) Status Card Configuration
 *
 * SPIRE is the reference implementation of SPIFFE — a CNCF graduated
 * workload identity framework. This card surfaces SPIRE server pod
 * health, agent DaemonSet coverage, attested agent count, registration
 * entry count, and trust bundle age so operators can spot identity
 * plane problems before workloads start failing mTLS.
 */

import type { UnifiedCardConfig } from '../../lib/unified/types'

export const spireStatusConfig: UnifiedCardConfig = {
  type: 'spire_status',
  title: 'SPIRE',
  category: 'security',
  description:
    'SPIRE workload identity — server pod health, agent DaemonSet coverage, attested agents, registration entries, and trust bundle age.',
  icon: 'ShieldCheck',
  iconColor: 'text-cyan-400',
  defaultWidth: 6,
  defaultHeight: 4,
  dataSource: { type: 'hook', hook: 'useCachedSpire' },
  content: {
    type: 'list',
    pageSize: 4,
    columns: [
      { field: 'name', header: 'Pod', primary: true, width: 200 },
      { field: 'phase', header: 'Phase', width: 100 },
      { field: 'ready', header: 'Ready', width: 90 },
      { field: 'restarts', header: 'Restarts', width: 100 },
      { field: 'node', header: 'Node', render: 'truncate' },
    ],
  },
  emptyState: {
    icon: 'ShieldCheck',
    title: 'SPIRE not detected',
    message: 'No SPIRE server pods reachable from the connected clusters.',
    variant: 'info',
  },
  loadingState: {
    type: 'list',
    rows: 4,
  },
  // Scaffolding: renders live if /api/spire/status is wired up, otherwise
  // falls back to demo data via the useCache demo path.
  isDemoData: true,
  isLive: false,
}

export default spireStatusConfig
