import type { UnifiedCardConfig } from '../../lib/unified/types'

export const deploymentRolloutTrackerConfig: UnifiedCardConfig = {
  type: 'deployment_rollout_tracker',
  title: 'Deployment Rollout Tracker',
  category: 'insights',
  description: 'Tracks deployment rollout progress across clusters',
  icon: 'Rocket',
  iconColor: 'text-green-400',
  defaultWidth: 8,
  defaultHeight: 4,
  dataSource: { type: 'hook', hook: 'useMultiClusterInsights' },
  content: { type: 'custom' },
  emptyState: {
    icon: 'Rocket',
    title: 'No active rollouts detected',
    message: 'All deployments are at consistent versions',
    variant: 'neutral',
  },
  loadingState: { type: 'chart' },
  isDemoData: false,
  isLive: true,
}
