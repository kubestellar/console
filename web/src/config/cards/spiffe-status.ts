/**
 * SPIFFE Status Card Configuration
 *
 * SPIFFE (Secure Production Identity Framework For Everyone) is a CNCF
 * graduated identity standard — typically deployed alongside SPIRE (the
 * reference runtime). This card surfaces the active trust domain, SVID
 * counts (x509 and JWT), federated trust domains, and registration entries.
 */
import type { UnifiedCardConfig } from '../../lib/unified/types'

export const spiffeStatusConfig: UnifiedCardConfig = {
  type: 'spiffe_status',
  title: 'SPIFFE',
  category: 'security',
  description:
    'SPIFFE/SPIRE workload identity: trust domain, SVID counts (x509/JWT), federated domains, and registration entries.',
  icon: 'Fingerprint',
  iconColor: 'text-cyan-400',
  defaultWidth: 6,
  defaultHeight: 4,
  dataSource: { type: 'hook', hook: 'useCachedSpiffe' },
  content: {
    type: 'list',
    pageSize: 8,
    columns: [
      { field: 'spiffeId', header: 'SPIFFE ID', primary: true, render: 'truncate' },
      { field: 'selector', header: 'Selector', width: 180, render: 'truncate' },
      { field: 'svidType', header: 'SVID', width: 80, render: 'status-badge' },
      { field: 'ttlSeconds', header: 'TTL', width: 80 },
      { field: 'cluster', header: 'Cluster', width: 120, render: 'cluster-badge' },
    ],
  },
  emptyState: {
    icon: 'Fingerprint',
    title: 'SPIFFE/SPIRE not detected',
    message: 'No SPIRE server reachable from the connected clusters.',
    variant: 'info',
  },
  loadingState: {
    type: 'list',
    rows: 5,
  },
  // Scaffolding: renders live if /api/spiffe/status is wired up, otherwise
  // falls back to demo data via the useCache demo path.
  isDemoData: true,
  isLive: false,
}

export default spiffeStatusConfig
