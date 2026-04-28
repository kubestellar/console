/**
 * OpenFeature Status Card Configuration
 *
 * OpenFeature (CNCF Incubating) is the open standard for feature flags,
 * providing a vendor-neutral SDK surface that sits in front of any flag
 * backend. This card surfaces active providers (flagd, LaunchDarkly, ...),
 * feature-flag definitions grouped by type (boolean/string/number/json),
 * and aggregate evaluation metrics.
 *
 * No 'operations' category exists in the CardCategory union — using
 * 'workloads' as the closest match for "runtime flag-delivery workload".
 */
import type { UnifiedCardConfig } from '../../lib/unified/types'

export const openfeatureStatusConfig: UnifiedCardConfig = {
  type: 'openfeature_status',
  title: 'OpenFeature',
  category: 'workloads',
  description:
    'OpenFeature feature flags: provider status (flagd, LaunchDarkly, ...), flag definitions by type, and evaluation metrics.',
  icon: 'Flag',
  iconColor: 'text-purple-400',
  defaultWidth: 6,
  defaultHeight: 4,
  dataSource: { type: 'hook', hook: 'useCachedOpenfeature' },
  content: {
    type: 'list',
    pageSize: 8,
    columns: [
      { field: 'key', header: 'Flag Key', primary: true, render: 'truncate' },
      { field: 'type', header: 'Type', width: 80, render: 'status-badge' },
      { field: 'enabled', header: 'State', width: 80, render: 'status-badge' },
      { field: 'provider', header: 'Provider', width: 120 },
      { field: 'evaluations', header: 'Evaluations', width: 120 },
    ],
  },
  emptyState: {
    icon: 'Flag',
    title: 'OpenFeature not detected',
    message: 'No OpenFeature provider reachable from the connected clusters.',
    variant: 'info',
  },
  loadingState: {
    type: 'list',
    rows: 5,
  },
  // Scaffolding: renders live if /api/openfeature/status is wired up,
  // otherwise falls back to demo data via the useCache demo path.
  isDemoData: true,
  isLive: false,
}

export default openfeatureStatusConfig
