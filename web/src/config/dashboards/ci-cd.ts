/**
 * CI/CD Dashboard Configuration
 */
import type { UnifiedDashboardConfig } from '../../lib/unified/types'

export const ciCdDashboardConfig: UnifiedDashboardConfig = {
  id: 'ci-cd',
  name: 'CI/CD',
  subtitle: 'Continuous integration and deployment pipelines',
  route: '/ci-cd',
  statsType: 'ci-cd',
  cards: [
    { id: 'github-ci-monitor-1', cardType: 'github_ci_monitor', position: { w: 6, h: 4 } },
    { id: 'github-activity-1', cardType: 'github_activity', position: { w: 6, h: 4 } },
    { id: 'prow-status-1', cardType: 'prow_status', position: { w: 6, h: 3 } },
    { id: 'prow-jobs-1', cardType: 'prow_jobs', position: { w: 6, h: 3 } },
    { id: 'prow-ci-monitor-1', cardType: 'prow_ci_monitor', position: { w: 6, h: 3 } },
    { id: 'prow-history-1', cardType: 'prow_history', position: { w: 6, h: 3 } },
  ],
  features: {
    dragDrop: true,
    addCard: true,
    autoRefresh: true,
    autoRefreshInterval: 60000,
  },
  storageKey: 'ci-cd-dashboard-cards',
}

export default ciCdDashboardConfig
