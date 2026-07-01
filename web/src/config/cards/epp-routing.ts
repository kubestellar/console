import type { UnifiedCardConfig } from '../../lib/unified/types'

export const eppRoutingConfig: UnifiedCardConfig = {
  type: 'epp_routing',
  title: 'EPP Routing',
  category: 'ai-ml',
  description: 'Endpoint Picker Policy routing configuration, metrics, and request distribution',
  projects: ['kubestellar'],
  icon: 'Network',
  iconColor: 'text-cyan-400',
  defaultWidth: 6,
  defaultHeight: 4,
  dataSource: { type: 'hook', hook: 'useEPPRoutingData' },
  content: { type: 'custom', component: 'EPPRouting' },
  emptyState: { icon: 'Network', title: 'No Routing', message: 'No EPP routing configuration detected', variant: 'info' },
  loadingState: { type: 'custom' },
  isDemoData: false,
  isLive: true,
}
export default eppRoutingConfig
