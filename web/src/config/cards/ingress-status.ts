/**
 * Ingress Status Card Configuration
 *
 * Displays Kubernetes Ingresses using the unified card system.
 */

import type { UnifiedCardConfig } from '../../lib/unified/types'

export const ingressStatusConfig: UnifiedCardConfig = {
  type: 'ingress_status',
  title: 'Ingress Status',
  category: 'network',
  description: 'Kubernetes Ingresses across clusters',

  // Appearance
  icon: 'Globe',
  iconColor: 'text-green-400',
  defaultWidth: 6,
  defaultHeight: 3,

  // Data source
  dataSource: {
    type: 'hook',
    hook: 'useIngresses',
  },

  // Filters
  filters: [
    {
      field: 'search',
      type: 'text',
      placeholder: 'Search ingresses...',
      searchFields: ['name', 'namespace', 'cluster', 'hosts'],
      storageKey: 'ingress-status',
    },
    {
      field: 'cluster',
      type: 'cluster-select',
      label: 'Cluster',
      storageKey: 'ingress-status-cluster',
    },
  ],

  // Content - List visualization
  content: {
    type: 'list',
    pageSize: 10,
    columns: [
      {
        field: 'cluster',
        header: 'Cluster',
        render: 'cluster-badge',
        width: 100,
      },
      {
        field: 'namespace',
        header: 'Namespace',
        render: 'namespace-badge',
        width: 100,
      },
      {
        field: 'name',
        header: 'Name',
        primary: true,
        render: 'truncate',
      },
      {
        field: 'hosts',
        header: 'Host',
        render: 'text',
        width: 150,
      },
      {
        field: 'class',
        header: 'Class',
        render: 'text',
        width: 80,
      },
    ],
  },

  // Empty state
  emptyState: {
    icon: 'Globe',
    title: 'No Ingresses',
    message: 'No Ingresses found in the selected clusters',
    variant: 'info',
  },

  // Loading state
  loadingState: {
    type: 'list',
    rows: 5,
    showSearch: true,
  },

  // Metadata
  // Note: `isDemoData` is intentionally omitted. The underlying
  // `useIngresses` hook reports `isDemoFallback` at fetch time and the
  // unified wrapper (`useUnifiedIngresses`) propagates it as `isDemoData`.
  // Hardcoding `isDemoData: true` here caused the Demo badge to appear on
  // live agent data — see Issue 9357.
  isLive: true,
}

export default ingressStatusConfig
