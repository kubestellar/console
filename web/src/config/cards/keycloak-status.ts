/**
 * Keycloak Identity & Access Management Card Configuration
 */
import type { UnifiedCardConfig } from '../../lib/unified/types'

export const keycloakStatusConfig: UnifiedCardConfig = {
  type: 'keycloak_status',
  title: 'Keycloak',
  category: 'security',
  description: 'Keycloak realm status, user sessions, and authentication flows.',
  icon: 'Shield',
  iconColor: 'text-orange-400',
  defaultWidth: 6,
  defaultHeight: 4,
  dataSource: { type: 'hook', hook: 'useKeycloakStatus' },
  filters: [
    { field: 'search', type: 'text', placeholder: 'Search realms...', searchFields: ['name', 'namespace'], storageKey: 'keycloak-status' },
  ],
  content: {
    type: 'list',
    pageSize: 10,
    columns: [
      { field: 'name', header: 'Realm', primary: true, render: 'truncate' },
      { field: 'namespace', header: 'Namespace', render: 'text', width: 120 },
      { field: 'activeSessions', header: 'Sessions', render: 'number', width: 80 },
      { field: 'status', header: 'Status', render: 'status-badge', width: 100 },
    ],
  },
  emptyState: { icon: 'Shield', title: 'No Realms', message: 'No Keycloak realms found', variant: 'info' },
  loadingState: { type: 'list', rows: 4 },
  isDemoData: false,
  isLive: true,
}
export default keycloakStatusConfig
