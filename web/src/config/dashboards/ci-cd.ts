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
    // Hero row: nightly release pulse + matrix heatmap
    { id: 'nightly-release-pulse-1', cardType: 'nightly_release_pulse', title: 'Nightly Release Pulse', position: { w: 6, h: 3 } },
    { id: 'workflow-matrix-1', cardType: 'workflow_matrix', title: 'Workflow Matrix', position: { w: 6, h: 5 } },
    // Live flow — full width
    { id: 'pipeline-flow-1', cardType: 'pipeline_flow', title: 'Live Runs', position: { w: 12, h: 5 } },
    // Issue Activity Chart — directly after Live Runs
    { id: 'issue-activity-chart-1', cardType: 'issue_activity_chart', title: 'Daily Issues & PRs', position: { w: 12, h: 5 } },
    // Failures + existing GitHub CI monitor
    { id: 'recent-failures-1', cardType: 'recent_failures', title: 'Recent Failures', position: { w: 6, h: 4 } },
    { id: 'github-ci-monitor-1', cardType: 'github_ci_monitor', title: 'GitHub CI Monitor', position: { w: 6, h: 4 } },
    // GitHub activity + Prow overview cards
    { id: 'github-activity-1', cardType: 'github_activity', title: 'GitHub Activity', position: { w: 5, h: 4 } },
    { id: 'prow-status-1', cardType: 'prow_status', title: 'Prow Status', position: { w: 4, h: 3 } },
    { id: 'prow-jobs-1', cardType: 'prow_jobs', title: 'Prow Jobs', position: { w: 5, h: 4 } },
    { id: 'prow-ci-monitor-1', cardType: 'prow_ci_monitor', title: 'Prow CI Monitor', position: { w: 6, h: 4 } },
    // Prow history
    { id: 'prow-history-1', cardType: 'prow_history', title: 'Prow History', position: { w: 4, h: 3 } },
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
