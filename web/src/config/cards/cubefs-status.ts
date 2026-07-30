/**
 * CubeFS Status Card Configuration
 *
 * Displays CubeFS distributed file system health, volume status,
 * and node topology.
 */

import type { UnifiedCardConfig } from '../../lib/unified/types'

export const cubefsStatusConfig: UnifiedCardConfig = {
  type: 'cubefs_status',
  title: 'CubeFS',
  category: 'storage',
  description: 'CubeFS distributed file system health, volume status, and node topology',

  // Appearance
  icon: 'Database',
  iconColor: 'text-green-400',
  defaultWidth: 6,
  defaultHeight: 3,

  // Data source
  dataSource: {
    type: 'hook',
    hook: 'useCubefsStatus',
  },

  // Filters
  filters: [
    {
      field: 'search',
      type: 'text',
      placeholder: 'Search volumes or nodes…',
      searchFields: ['name', 'owner', 'address', 'role'],
      storageKey: 'cubefs-status',
    },
  ],

  // Content — status visualization
  content: {
    type: 'status-grid',
    columns: 4,
    items: [
      {
        id: 'volumes',
        label: 'Volumes',
        valueSource: { type: 'field', path: 'volumes.length' },
        icon: 'Database',
        color: 'blue',
      },
      {
        id: 'masters',
        label: 'Masters',
        valueSource: { type: 'field', path: 'nodes' },
        icon: 'Layers',
        color: 'purple',
      },
      {
        id: 'data-nodes',
        label: 'Data Nodes',
        valueSource: { type: 'field', path: 'nodes' },
        icon: 'Server',
        color: 'cyan',
      },
      {
        id: 'issues',
        label: 'Issues',
        valueSource: { type: 'field', path: 'issues' },
        icon: 'AlertTriangle',
        color: 'red',
      },
    ],
  },

  // Empty state
  emptyState: {
    icon: 'Database',
    title: 'CubeFS not detected',
    message: 'No CubeFS pods found. Deploy CubeFS to enable distributed file system storage.',
    variant: 'info',
  },

  // Loading state
  loadingState: {
    type: 'list',
    rows: 3,
    showSearch: true,
  },

  // Metadata
  isDemoData: true,
  isLive: false,
}

export default cubefsStatusConfig
