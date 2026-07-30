import type { UnifiedCardConfig } from '../../lib/unified/types'

export const eppHealthConfig: UnifiedCardConfig = {
  type: 'epp_health',
  title: 'EPP Health',
  category: 'ai-ml',
  description: 'Endpoint Picker Policy health and replica status across clusters',
  projects: ['kubestellar'],
  icon: 'Activity',
  iconColor: 'text-blue-400',
  defaultWidth: 6,
  defaultHeight: 3,
  dataSource: { type: 'hook', hook: 'useCachedEPPStatus' },
  content: { type: 'custom', component: 'EPPHealthCard' },
  emptyState: { icon: 'Activity', title: 'No EPPs', message: 'No Endpoint Picker Policies detected', variant: 'info' },
  loadingState: { type: 'custom' },
  isDemoData: false,
  isLive: true,
}
export default eppHealthConfig
