/**
 * Operator Subscriptions Card Configuration (legacy name)
 */
import type { UnifiedCardConfig } from '../../lib/unified/types'

export const operatorSubscriptionsConfig: UnifiedCardConfig = {
  type: 'operator_subscriptions',
  title: 'Operator Subscriptions',
  category: 'operators',
  description: 'OLM Operator Subscriptions',
  icon: 'RefreshCw',
  iconColor: 'text-violet-400',
  defaultWidth: 6,
  defaultHeight: 3,
  dataSource: { type: 'hook', hook: 'useOperatorSubscriptions' },
  filters: [
    { field: 'search', type: 'text', placeholder: 'Search subscriptions...', searchFields: ['name', 'namespace', 'channel'], storageKey: 'operator-subs' },
  ],
  content: {
    type: 'list',
    pageSize: 10,
    columns: [
      { field: 'name', header: 'Name', primary: true, render: 'truncate' },
      { field: 'namespace', header: 'Namespace', render: 'namespace-badge', width: 100 },
      { field: 'channel', header: 'Channel', render: 'text', width: 80 },
      { field: 'installPlanApproval', header: 'Approval', render: 'status-badge', width: 90 },
    ],
  },
  emptyState: { icon: 'RefreshCw', title: 'No Subscriptions', message: 'No Operator Subscriptions found', variant: 'info' },
  loadingState: { type: 'list', rows: 5, showSearch: true },
  isDemoData: false,
  isLive: true,
}
export default operatorSubscriptionsConfig
