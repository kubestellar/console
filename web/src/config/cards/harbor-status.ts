/**
 * Harbor Registry Status Card Configuration
 *
 * Displays Harbor registry projects, repositories, and vulnerability scan results.
 */

import type { UnifiedCardConfig } from '../../lib/unified/types'

export const harborStatusConfig: UnifiedCardConfig = {
  type: 'harbor_status',
  title: 'Harbor Registry',
  category: 'storage',
  description: 'Harbor registry projects, repositories, and vulnerability scan results',

  // Appearance
  icon: 'Package',
  iconColor: 'text-blue-400',
  defaultWidth: 6,
  defaultHeight: 3,

  // Data source
  dataSource: {
    type: 'hook',
    hook: 'useHarborStatus',
  },

  // Filters
  filters: [
    {
      field: 'search',
      type: 'text',
      placeholder: 'Search projects or repositories…',
      searchFields: ['name'],
      storageKey: 'harbor-status',
    },
  ],

  // Content — status visualization
  content: {
    type: 'status-grid',
    columns: 4,
    items: [
      {
        id: 'projects',
        label: 'Projects',
        valueSource: { type: 'field', path: 'projects.length' },
        icon: 'FolderOpen',
        color: 'blue',
      },
      {
        id: 'repositories',
        label: 'Repositories',
        valueSource: { type: 'field', path: 'repositories.length' },
        icon: 'Layers',
        color: 'purple',
      },
      {
        id: 'scans',
        label: 'Scans',
        valueSource: { type: 'field', path: 'projects' }, // Sum will be handled by UI
        icon: 'Shield',
        color: 'cyan',
      },
      {
        id: 'vulnerabilities',
        label: 'Vulnerabilities',
        valueSource: { type: 'field', path: 'projects' }, // Sum will be handled by UI
        icon: 'AlertTriangle',
        color: 'orange',
      },
    ],
  },

  // Empty state
  emptyState: {
    icon: 'Package',
    title: 'Harbor not detected',
    message: 'No Harbor registry pods found. Deploy Harbor to enable container image management.',
    variant: 'info',
  },

  // Loading state
  loadingState: {
    type: 'list',
    rows: 4,
    showSearch: true,
  },

  // Metadata
  isDemoData: true,
  isLive: false,
}

export default harborStatusConfig
