import type { UnifiedCardConfig } from '../../lib/unified/types'

export const kvcacheMonitorConfig: UnifiedCardConfig = {
  type: 'kvcache_monitor',
  title: 'KV Cache Monitor',
  category: 'ai-ml',
  description: 'KV cache utilization and eviction metrics for LLM inference optimization',
  projects: ['kubestellar'],
  icon: 'Database',
  iconColor: 'text-amber-400',
  defaultWidth: 6,
  defaultHeight: 4,
  dataSource: { type: 'hook', hook: 'useKVCacheMonitor' },
  content: { type: 'custom', component: 'KVCacheMonitor' },
  emptyState: { icon: 'Database', title: 'No Cache Data', message: 'No KV cache metrics available', variant: 'info' },
  loadingState: { type: 'custom' },
  isDemoData: false,
  isLive: true,
}
export default kvcacheMonitorConfig
