/**
 * Compliance Trestle (OSCAL) Card Configuration
 */
import type { UnifiedCardConfig } from '../../lib/unified/types'

export const trestleScanConfig: UnifiedCardConfig = {
  type: 'trestle_scan',
  title: 'Compliance Trestle (OSCAL)',
  category: 'security',
  description: 'OSCAL compliance assessment via Compliance Trestle (CNCF Sandbox)',
  icon: 'Shield',
  iconColor: 'text-teal-400',
  defaultWidth: 6,
  defaultHeight: 3,
  dataSource: { type: 'hook', hook: 'useTrestle' },
  content: {
    type: 'stats-grid',
    stats: [
      { field: 'overallScore', label: 'Score', color: 'teal', format: 'percentage' },
      { field: 'passedControls', label: 'Passed', color: 'green' },
      { field: 'failedControls', label: 'Failed', color: 'red' },
      { field: 'otherControls', label: 'Other', color: 'gray' },
    ],
  },
  emptyState: { icon: 'Shield', title: 'No Assessments', message: 'No OSCAL assessment data', variant: 'info' },
  loadingState: { type: 'stats', count: 4 },
  isDemoData: true,
  isLive: false,
}
export default trestleScanConfig
