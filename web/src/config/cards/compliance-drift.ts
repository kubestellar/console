/**
 * Compliance Drift Card Configuration
 */
import type { UnifiedCardConfig } from '../../lib/unified/types'

export const complianceDriftConfig: UnifiedCardConfig = {
  type: 'compliance_drift',
  title: 'Compliance Drift',
  category: 'security',
  description: 'Clusters deviating from fleet compliance baseline',
  icon: 'TrendingDown',
  iconColor: 'text-yellow-400',
  defaultWidth: 6,
  defaultHeight: 3,
  dataSource: { type: 'hook', hook: 'useComplianceDrift' },
  content: { type: 'custom' },
  emptyState: { icon: 'CheckCircle2', title: 'All Clear', message: 'All clusters within baseline', variant: 'success' },
  loadingState: { type: 'list', count: 3 },
  isDemoData: false,
  isLive: true,
}
export default complianceDriftConfig
