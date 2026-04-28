/**
 * Contour Status Card Configuration
 */
import type { UnifiedCardConfig } from '../../lib/unified/types'

export const contourStatusConfig: UnifiedCardConfig = {
  type: 'contour_status',
  title: 'Contour',
  category: 'network',
  description: 'Contour ingress proxy status, HTTPProxy resources, and Envoy fleet health.',
  icon: 'Shield',
  iconColor: 'text-cyan-400',
  defaultWidth: 6,
  defaultHeight: 4,
  dataSource: { type: 'hook', hook: 'useContourStatus' },
  content: {
    type: 'list',
    pageSize: 8,
    columns: [
      { field: 'name', header: 'Name', primary: true, render: 'truncate' },
      { field: 'namespace', header: 'Namespace', width: 120, render: 'namespace-badge' },
      { field: 'cluster', header: 'Cluster', width: 120, render: 'cluster-badge' },
      { field: 'fqdn', header: 'FQDN', width: 160, render: 'truncate' },
      { field: 'status', header: 'Status', width: 80, render: 'status-badge' },
    ],
  },
  emptyState: {
    icon: 'Shield',
    title: 'Contour not detected',
    message: 'No Contour HTTPProxy resources found on connected clusters.',
    variant: 'info',
  },
  loadingState: {
    type: 'list',
    rows: 5,
  },
  isDemoData: false,
  isLive: true,
}

export default contourStatusConfig
