/**
 * Vitess Status Card Configuration
 *
 * Vitess is a CNCF graduated project — cloud-native, horizontally-scalable
 * database clustering for MySQL. This card surfaces the shape operators
 * care about: keyspaces, shards, tablets (PRIMARY/REPLICA/RDONLY), and
 * replication lag.
 */

import type { UnifiedCardConfig } from '../../lib/unified/types'

export const vitessStatusConfig: UnifiedCardConfig = {
  type: 'vitess_status',
  title: 'Vitess',
  category: 'storage',
  description:
    'Vitess distributed MySQL: keyspaces, shards, tablets (PRIMARY/REPLICA/RDONLY), and replication lag.',

  // Appearance
  icon: 'Database',
  iconColor: 'text-cyan-400',
  defaultWidth: 6,
  defaultHeight: 4,

  // Data source
  dataSource: {
    type: 'hook',
    hook: 'useCachedVitess',
  },

  // Content — list visualization with per-keyspace rows
  content: {
    type: 'list',
    pageSize: 8,
    columns: [
      { field: 'name', header: 'Keyspace', primary: true, render: 'truncate' },
      { field: 'shards', header: 'Shards', width: 100 },
      { field: 'tabletCount', header: 'Tablets', width: 100 },
      { field: 'sharded', header: 'Sharded', width: 100, render: 'status-badge' },
    ],
  },

  emptyState: {
    icon: 'Database',
    title: 'Vitess not detected',
    message: 'No Vitess tablets found on connected clusters.',
    variant: 'info',
  },

  loadingState: {
    type: 'list',
    rows: 5,
  },

  // Scaffolding: renders live if /api/vitess/status is wired up, otherwise
  // falls back to demo data via the useCache demo path.
  isDemoData: true,
  isLive: false,
}

export default vitessStatusConfig
