/**
 * Kube Bert Card Configuration
 */
import type { UnifiedCardConfig } from '../../lib/unified/types'

export const kubeBertConfig: UnifiedCardConfig = {
  type: 'kube_bert',
  title: 'Kube Bert',
  category: 'games',
  description: 'Q*bert-style pyramid hopper — change every tile while dodging enemies',
  icon: 'Pyramid',
  iconColor: 'text-yellow-400',
  defaultWidth: 6,
  defaultHeight: 4,
  dataSource: { type: 'static' },
  content: { type: 'custom', component: 'KubeBert' },
  emptyState: { icon: 'Pyramid', title: 'Kube Bert', message: 'Press to start', variant: 'info' },
  loadingState: { type: 'custom' },
  isDemoData: false,
  isLive: false,
}
export default kubeBertConfig
