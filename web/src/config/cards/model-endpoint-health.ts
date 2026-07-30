import type { UnifiedCardConfig } from '../../lib/unified/types'

export const modelEndpointHealthConfig: UnifiedCardConfig = {
  type: 'model_endpoint_health',
  title: 'Model Endpoint Health',
  category: 'ai-ml',
  description: 'LLM model serving endpoint health, replica counts, and GPU allocation',
  projects: ['kubestellar'],
  icon: 'Cpu',
  iconColor: 'text-purple-400',
  defaultWidth: 6,
  defaultHeight: 3,
  dataSource: { type: 'hook', hook: 'useCachedModelEndpointHealth' },
  content: { type: 'custom', component: 'ModelEndpointHealthCard' },
  emptyState: { icon: 'Cpu', title: 'No Endpoints', message: 'No model serving endpoints detected', variant: 'info' },
  loadingState: { type: 'custom' },
  isDemoData: false,
  isLive: true,
}
export default modelEndpointHealthConfig
