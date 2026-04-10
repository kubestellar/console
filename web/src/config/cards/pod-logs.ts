/**
 * Pod Logs Card Configuration
 *
 * Renders container logs via a custom component (PodLogs.tsx) that wires
 * cluster/namespace/pod/container selectors to the `/api/mcp/pods/logs`
 * endpoint through the `usePodLogs` hook.
 */

import type { UnifiedCardConfig } from '../../lib/unified/types'

export const podLogsConfig: UnifiedCardConfig = {
  type: 'pod_logs',
  title: 'Pod Logs',
  category: 'events',
  description: 'Tail container logs for any pod across your clusters',

  // Appearance
  icon: 'ScrollText',
  iconColor: 'text-cyan-400',
  defaultWidth: 12,
  defaultHeight: 4,

  // Data source — the custom component owns its own data fetching via
  // `usePodLogs`, so we register the hook here for parity with the rest of
  // the unified card system.
  dataSource: {
    type: 'hook',
    hook: 'usePodLogs',
  },

  // Content — custom React component (PodLogs.tsx).
  content: {
    type: 'custom',
    component: 'PodLogs',
  },

  // Empty state
  emptyState: {
    icon: 'ScrollText',
    title: 'No log output',
    message: 'Select a cluster, namespace, and pod to view logs',
    variant: 'info',
  },

  // Loading state
  loadingState: { type: 'custom' },

  // Metadata
  isDemoData: false,
  isLive: true,
}

export default podLogsConfig
