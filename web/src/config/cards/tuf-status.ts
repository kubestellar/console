/**
 * TUF (The Update Framework) Status Card Configuration
 *
 * TUF is a CNCF graduated secure software update framework. This card
 * surfaces the four top-level role metadata files — root, targets,
 * snapshot, timestamp — with their versions, expiration times, and
 * signing status so operators can spot expired or unsigned roles
 * before a client refuses to trust the repository.
 */

import type { UnifiedCardConfig } from '../../lib/unified/types'

export const tufStatusConfig: UnifiedCardConfig = {
  type: 'tuf_status',
  title: 'TUF',
  category: 'security',
  description:
    'TUF repository role metadata — root, targets, snapshot, timestamp — versions, expirations, and signing status.',
  icon: 'ShieldCheck',
  iconColor: 'text-cyan-400',
  defaultWidth: 6,
  defaultHeight: 4,
  dataSource: { type: 'hook', hook: 'useCachedTuf' },
  content: {
    type: 'list',
    pageSize: 4,
    columns: [
      { field: 'name', header: 'Role', primary: true, width: 120 },
      { field: 'version', header: 'Version', width: 90 },
      { field: 'expiresAt', header: 'Expires', render: 'truncate' },
      { field: 'threshold', header: 'Threshold', width: 100 },
      { field: 'keyCount', header: 'Keys', width: 80 },
      { field: 'status', header: 'Status', width: 110, render: 'status-badge' },
    ],
  },
  emptyState: {
    icon: 'ShieldCheck',
    title: 'TUF not detected',
    message: 'No TUF repository metadata reachable from the connected clusters.',
    variant: 'info',
  },
  loadingState: {
    type: 'list',
    rows: 4,
  },
  // Scaffolding: renders live if /api/tuf/status is wired up, otherwise
  // falls back to demo data via the useCache demo path.
  isDemoData: true,
  isLive: false,
}

export default tufStatusConfig
