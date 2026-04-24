/**
 * Backstage Status Card Configuration
 *
 * Backstage is a CNCF incubating developer portal platform. This card
 * surfaces the Backstage app replica count, the catalog entity inventory
 * (Components, APIs, Systems, Domains, Resources, Users, Groups), the
 * status of installed plugins, and the scaffolder templates registered
 * with the instance so platform teams can monitor portal health at a
 * glance.
 */

import type { UnifiedCardConfig } from '../../lib/unified/types'

export const backstageStatusConfig: UnifiedCardConfig = {
  type: 'backstage_status',
  title: 'Backstage',
  category: 'workloads',
  description:
    'Backstage developer portal: replicas, catalog entities (Components/APIs/Systems/Domains/Resources/Users/Groups), plugin status, scaffolder templates, and last catalog sync.',
  icon: 'Package',
  iconColor: 'text-cyan-400',
  defaultWidth: 6,
  defaultHeight: 4,
  dataSource: { type: 'hook', hook: 'useCachedBackstage' },
  content: {
    type: 'list',
    pageSize: 5,
    columns: [
      { field: 'name', header: 'Plugin', primary: true, width: 240 },
      { field: 'version', header: 'Version', width: 90 },
      { field: 'status', header: 'Status', width: 110, render: 'status-badge' },
    ],
  },
  emptyState: {
    icon: 'Package',
    title: 'Backstage not detected',
    message:
      'No Backstage deployment reachable. Install Backstage to surface developer portal inventory here.',
    variant: 'info',
  },
  loadingState: {
    type: 'list',
    rows: 5,
  },
  // Scaffolding: renders live if /api/backstage/status is wired up,
  // otherwise falls back to demo data via the useCache demo path.
  isDemoData: true,
  isLive: false,
}

export default backstageStatusConfig
