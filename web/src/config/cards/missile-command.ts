/**
 * Missile Command Card Configuration
 */
import type { UnifiedCardConfig } from '../../lib/unified/types'

export const missileCommandConfig: UnifiedCardConfig = {
  type: 'missile_command',
  title: 'Missile Command',
  category: 'games',
  description: 'Defend your Kubernetes clusters from incoming missiles',
  icon: 'Crosshair',
  iconColor: 'text-red-400',
  defaultWidth: 6,
  defaultHeight: 4,
  dataSource: { type: 'static' },
  content: { type: 'custom', component: 'MissileCommand' },
  emptyState: { icon: 'Crosshair', title: 'Missile Command', message: 'Click to start', variant: 'info' },
  loadingState: { type: 'custom' },
  isDemoData: false,
  isLive: false,
}

export default missileCommandConfig
