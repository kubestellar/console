/**
 * OpenTelemetry Status Card Configuration
 *
 * Displays OpenTelemetry (CNCF incubating) Collector instances, pipeline
 * health, and telemetry throughput (spans / metrics / logs) across
 * connected clusters.
 */

import type { UnifiedCardConfig } from '../../lib/unified/types'

export const otelStatusConfig: UnifiedCardConfig = {
  type: 'otel_status',
  title: 'OpenTelemetry',
  category: 'live-trends',
  description:
    'OpenTelemetry Collectors: pipeline health, receivers & exporters, dropped telemetry, and export errors.',

  // Appearance
  icon: 'Telescope',
  iconColor: 'text-purple-400',
  defaultWidth: 6,
  defaultHeight: 4,

  // Data source
  dataSource: {
    type: 'hook',
    hook: 'useCachedOtel',
  },

  // Content — list visualization with collector rows
  content: {
    type: 'list',
    pageSize: 5,
    columns: [
      { field: 'name', header: 'Collector', primary: true, render: 'truncate' },
      { field: 'cluster', header: 'Cluster', width: 120, render: 'truncate' },
      { field: 'state', header: 'State', width: 90, render: 'status-badge' },
      { field: 'mode', header: 'Mode', width: 110 },
      { field: 'exportErrors', header: 'Errors', width: 90 },
    ],
  },

  emptyState: {
    icon: 'Telescope',
    title: 'OpenTelemetry not detected',
    message: 'No OpenTelemetry Collector pods found on connected clusters.',
    variant: 'info',
  },

  loadingState: {
    type: 'list',
    rows: 4,
  },

  isDemoData: false,
  isLive: true,
}

export default otelStatusConfig
