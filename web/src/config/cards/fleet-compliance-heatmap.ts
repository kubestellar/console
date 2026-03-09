/**
 * Fleet Compliance Heatmap Card Configuration
 */
import type { UnifiedCardConfig } from '../../lib/unified/types'

export const fleetComplianceHeatmapConfig: UnifiedCardConfig = {
  type: 'fleet_compliance_heatmap',
  title: 'Fleet Compliance Heatmap',
  category: 'security',
  description: 'Cross-cluster compliance posture heatmap across all tools',
  icon: 'Grid3X3',
  iconColor: 'text-blue-400',
  defaultWidth: 12,
  defaultHeight: 4,
  dataSource: { type: 'hook', hook: 'useFleetComplianceHeatmap' },
  content: { type: 'custom' },
  emptyState: { icon: 'Grid3X3', title: 'No Data', message: 'No compliance tools detected', variant: 'info' },
  loadingState: { type: 'table', count: 4 },
  isDemoData: false,
  isLive: true,
}
export default fleetComplianceHeatmapConfig
