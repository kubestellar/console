/**
 * Comprehensive tests for deployment & workload cards (issue #19670)
 *
 * Validates configuration correctness, filter structure, column definitions,
 * data source hooks, and cross-cutting invariants for workload-related cards.
 */
import { describe, expect, it } from 'vitest'
import { getCardConfig, hasUnifiedConfig } from '../index'

// === Deployment card imports ===
import { deploymentStatusConfig } from '../deployment-status'
import { deploymentIssuesConfig } from '../deployment-issues'
import { deploymentMissionsConfig } from '../deployment-missions'
import { deploymentProgressConfig } from '../deployment-progress'
import { deploymentRiskScoreConfig } from '../deployment-risk-score'
import { deploymentRolloutTrackerConfig } from '../deployment-rollout-tracker'

// === Workload card imports ===
import { workloadDeploymentConfig } from '../workload-deployment'
import { workloadMonitorConfig } from '../workload-monitor'

// === Pod card imports ===
import { podIssuesConfig } from '../pod-issues'
import { podHealthTrendConfig } from '../pod-health-trend'
import { podLogsConfig } from '../pod-logs'

// === Job/StatefulSet/DaemonSet imports ===
import { statefulSetStatusConfig } from '../statefulset-status'
import { daemonSetStatusConfig } from '../daemonset-status'
import { replicaSetStatusConfig } from '../replicaset-status'
import { jobStatusConfig } from '../job-status'
import { cronJobStatusConfig } from '../cronjob-status'
import { hpaStatusConfig } from '../hpa-status'

// === Other workload imports ===
import { containerTetrisConfig } from '../container-tetris'
import { containerdStatusConfig } from '../containerd-status'

import type { UnifiedCardConfig } from '../../../lib/unified/types'

// ============================================================================
// Kubernetes Workload Status Cards — Table/List Structure Validation
// ============================================================================

interface ListContent {
  type: 'list'
  pageSize: number
  columns: Array<{ field: string; header: string; primary?: boolean; render?: string; width?: number }>
  sortable?: boolean
  defaultSort?: string
}

const K8S_STATUS_CARDS: Array<{ config: UnifiedCardConfig; name: string; hook: string }> = [
  { config: statefulSetStatusConfig, name: 'statefulset-status', hook: 'useCachedStatefulSets' },
  { config: daemonSetStatusConfig, name: 'daemonset-status', hook: 'useCachedDaemonSets' },
  { config: replicaSetStatusConfig, name: 'replicaset-status', hook: 'useCachedReplicaSets' },
  { config: jobStatusConfig, name: 'job-status', hook: 'useJobs' },
  { config: cronJobStatusConfig, name: 'cronjob-status', hook: 'useCachedCronJobs' },
  { config: hpaStatusConfig, name: 'hpa-status', hook: 'useCachedHPAs' },
]

describe('K8s workload status cards — shared invariants', () => {
  it.each(K8S_STATUS_CARDS)('$name belongs to "workloads" category', ({ config }) => {
    expect(config.category).toBe('workloads')
  })

  it.each(K8S_STATUS_CARDS)('$name uses hook data source with correct hook', ({ config, hook }) => {
    expect(config.dataSource.type).toBe('hook')
    expect((config.dataSource as { hook: string }).hook).toBe(hook)
  })

  it.each(K8S_STATUS_CARDS)('$name is live data', ({ config }) => {
    expect(config.isLive).toBe(true)
  })

  it.each(K8S_STATUS_CARDS)('$name uses list content type', ({ config }) => {
    expect(config.content.type).toBe('list')
  })

  it.each(K8S_STATUS_CARDS)('$name has pagination configured (pageSize > 0)', ({ config }) => {
    const content = config.content as ListContent
    expect(content.pageSize).toBeGreaterThan(0)
  })

  it.each(K8S_STATUS_CARDS)('$name has cluster column', ({ config }) => {
    const content = config.content as ListContent
    const fields = content.columns.map(c => c.field)
    expect(fields).toContain('cluster')
  })

  it.each(K8S_STATUS_CARDS)('$name has namespace column', ({ config }) => {
    const content = config.content as ListContent
    const fields = content.columns.map(c => c.field)
    expect(fields).toContain('namespace')
  })

  it.each(K8S_STATUS_CARDS)('$name has name column marked as primary', ({ config }) => {
    const content = config.content as ListContent
    const nameCol = content.columns.find(c => c.field === 'name')
    expect(nameCol).toBeDefined()
    expect(nameCol!.primary).toBe(true)
  })

  it.each(K8S_STATUS_CARDS)('$name has filters with search and cluster-select', ({ config }) => {
    expect(config.filters).toBeDefined()
    expect(config.filters!.length).toBeGreaterThanOrEqual(2)
    const filterTypes = config.filters!.map(f => f.type)
    expect(filterTypes).toContain('text')
    expect(filterTypes).toContain('cluster-select')
  })

  it.each(K8S_STATUS_CARDS)('$name has unique storageKeys in filters', ({ config }) => {
    const keys = config.filters!.map(f => (f as { storageKey?: string }).storageKey).filter(Boolean)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it.each(K8S_STATUS_CARDS)('$name has loading state with list rows', ({ config }) => {
    expect(config.loadingState).toBeDefined()
    const ls = config.loadingState as { type: string; rows: number }
    expect(ls.type).toBe('list')
    expect(ls.rows).toBeGreaterThan(0)
  })

  it.each(K8S_STATUS_CARDS)('$name is registered in config registry', ({ config }) => {
    expect(hasUnifiedConfig(config.type)).toBe(true)
    expect(getCardConfig(config.type)).toBeDefined()
  })
})

// ============================================================================
// Deployment Cards — Individual Validation
// ============================================================================

describe('Deployment cards', () => {
  describe('deployment-status', () => {
    it('has correct type and category', () => {
      expect(deploymentStatusConfig.type).toBe('deployment_status')
      expect(deploymentStatusConfig.category).toBe('workloads')
    })

    it('uses hook data source', () => {
      expect(deploymentStatusConfig.dataSource.type).toBe('hook')
      expect((deploymentStatusConfig.dataSource as { hook: string }).hook).toBe('useCachedDeployments')
    })

    it('uses table content type with sortable columns', () => {
      expect(deploymentStatusConfig.content.type).toBe('table')
      const content = deploymentStatusConfig.content as { sortable: boolean; columns: Array<{ field: string }> }
      expect(content.sortable).toBe(true)
    })

    it('has columns for cluster, namespace, name, ready, total, status', () => {
      const content = deploymentStatusConfig.content as { columns: Array<{ field: string }> }
      const fields = content.columns.map(c => c.field)
      expect(fields).toEqual(expect.arrayContaining(['cluster', 'namespace', 'name', 'readyReplicas', 'replicas', 'status']))
    })

    it('has drill-down configured for deployment details', () => {
      expect(deploymentStatusConfig.drillDown).toBeDefined()
      expect(deploymentStatusConfig.drillDown!.action).toBe('drillToDeployment')
      expect(deploymentStatusConfig.drillDown!.params).toContain('cluster')
      expect(deploymentStatusConfig.drillDown!.params).toContain('namespace')
      expect(deploymentStatusConfig.drillDown!.params).toContain('name')
    })

    it('is registered in config registry', () => {
      expect(hasUnifiedConfig('deployment_status')).toBe(true)
    })
  })

  describe('deployment-issues', () => {
    it('has correct type and category', () => {
      expect(deploymentIssuesConfig.type).toBe('deployment_issues')
      expect(deploymentIssuesConfig.category).toBe('workloads')
    })

    it('uses hook for fetching issues', () => {
      expect((deploymentIssuesConfig.dataSource as { hook: string }).hook).toBe('useCachedDeploymentIssues')
    })

    it('has drill-down for deployment investigation', () => {
      expect(deploymentIssuesConfig.drillDown).toBeDefined()
      expect(deploymentIssuesConfig.drillDown!.action).toBe('drillToDeployment')
    })

    it('emptyState indicates healthy (neutral variant)', () => {
      expect(deploymentIssuesConfig.emptyState!.variant).toBe('neutral')
    })

    it('has smaller page size (focus on critical issues)', () => {
      const content = deploymentIssuesConfig.content as ListContent
      expect(content.pageSize).toBeLessThanOrEqual(5)
    })

    it('includes reason column for issue diagnosis', () => {
      const content = deploymentIssuesConfig.content as ListContent
      const fields = content.columns.map(c => c.field)
      expect(fields).toContain('reason')
    })
  })

  describe('deployment-missions', () => {
    it('has correct type and is scoped to kubestellar project', () => {
      expect(deploymentMissionsConfig.type).toBe('deployment_missions')
      expect(deploymentMissionsConfig.projects).toContain('kubestellar')
    })

    it('includes progress column with progress-bar renderer', () => {
      const content = deploymentMissionsConfig.content as ListContent
      const progressCol = content.columns.find(c => c.field === 'progress')
      expect(progressCol).toBeDefined()
      expect(progressCol!.render).toBe('progress-bar')
    })
  })

  describe('deployment-progress', () => {
    it('has correct type and category', () => {
      expect(deploymentProgressConfig.type).toBe('deployment_progress')
      expect(deploymentProgressConfig.category).toBe('workloads')
    })

    it('uses hook for rollout progress', () => {
      expect((deploymentProgressConfig.dataSource as { hook: string }).hook).toBe('useDeploymentProgress')
    })

    it('includes progress and status columns', () => {
      const content = deploymentProgressConfig.content as ListContent
      const fields = content.columns.map(c => c.field)
      expect(fields).toContain('progress')
      expect(fields).toContain('status')
    })
  })

  describe('deployment-risk-score', () => {
    it('has correct type and security category', () => {
      expect(deploymentRiskScoreConfig.type).toBe('deployment_risk_score')
      expect(deploymentRiskScoreConfig.category).toBe('security')
    })

    it('uses static data source (composite multi-hook component)', () => {
      expect(deploymentRiskScoreConfig.dataSource.type).toBe('static')
    })

    it('is demo data (not yet backed by live signals)', () => {
      expect(deploymentRiskScoreConfig.isDemoData).toBe(true)
    })

    it('emptyState indicates neutral when no risk detected', () => {
      expect(deploymentRiskScoreConfig.emptyState!.variant).toBe('neutral')
    })
  })

  describe('deployment-rollout-tracker', () => {
    it('has correct type and insights category', () => {
      expect(deploymentRolloutTrackerConfig.type).toBe('deployment_rollout_tracker')
      expect(deploymentRolloutTrackerConfig.category).toBe('insights')
    })

    it('uses multi-cluster insights hook', () => {
      expect((deploymentRolloutTrackerConfig.dataSource as { hook: string }).hook).toBe('useMultiClusterInsights')
    })

    it('has wider layout for tracker view', () => {
      expect(deploymentRolloutTrackerConfig.defaultWidth).toBeGreaterThanOrEqual(8)
    })

    it('uses chart loading state', () => {
      expect((deploymentRolloutTrackerConfig.loadingState as { type: string }).type).toBe('chart')
    })
  })
})

// ============================================================================
// Pod Cards — Validation
// ============================================================================

describe('Pod cards', () => {
  describe('pod-issues', () => {
    it('has correct type and category', () => {
      expect(podIssuesConfig.type).toBe('pod_issues')
      expect(podIssuesConfig.category).toBe('workloads')
    })

    it('uses hook for pod issue detection', () => {
      expect((podIssuesConfig.dataSource as { hook: string }).hook).toBe('useCachedPodIssues')
    })

    it('has sort configuration with multiple options', () => {
      const content = podIssuesConfig.content as ListContent & { sortOptions: Array<{ field: string }> }
      expect(content.sortable).toBe(true)
      expect(content.sortOptions.length).toBeGreaterThan(1)
    })

    it('has drill-down to pod details', () => {
      expect(podIssuesConfig.drillDown).toBeDefined()
      expect(podIssuesConfig.drillDown!.action).toBe('drillToPod')
    })

    it('includes restarts column for crash detection', () => {
      const content = podIssuesConfig.content as ListContent
      const fields = content.columns.map(c => c.field)
      expect(fields).toContain('restarts')
      expect(fields).toContain('status')
    })

    it('has AI actions configured for diagnose/repair', () => {
      const content = podIssuesConfig.content as { aiActions: { showRepair: boolean } }
      expect(content.aiActions).toBeDefined()
      expect(content.aiActions.showRepair).toBe(true)
    })
  })

  describe('pod-health-trend', () => {
    it('has correct type and live-trends category', () => {
      expect(podHealthTrendConfig.type).toBe('pod_health_trend')
      expect(podHealthTrendConfig.category).toBe('live-trends')
    })

    it('uses chart content type with area chart', () => {
      expect(podHealthTrendConfig.content.type).toBe('chart')
      const content = podHealthTrendConfig.content as { chartType: string; yAxis: string[] }
      expect(content.chartType).toBe('area')
      expect(content.yAxis).toContain('healthy')
      expect(content.yAxis).toContain('unhealthy')
    })

    it('has wider layout for chart display', () => {
      expect(podHealthTrendConfig.defaultWidth).toBeGreaterThanOrEqual(8)
    })
  })

  describe('pod-logs', () => {
    it('has correct type and events category', () => {
      expect(podLogsConfig.type).toBe('pod_logs')
      expect(podLogsConfig.category).toBe('events')
    })

    it('uses full-width layout for log display', () => {
      expect(podLogsConfig.defaultWidth).toBe(12)
    })

    it('uses hook for log streaming', () => {
      expect((podLogsConfig.dataSource as { hook: string }).hook).toBe('usePodLogs')
    })
  })
})

// ============================================================================
// Workload Cards — Validation
// ============================================================================

describe('Workload cards', () => {
  describe('workload-deployment', () => {
    it('has correct type and is scoped to kubestellar', () => {
      expect(workloadDeploymentConfig.type).toBe('workload_deployment')
      expect(workloadDeploymentConfig.projects).toContain('kubestellar')
    })

    it('uses hook data source', () => {
      expect((workloadDeploymentConfig.dataSource as { hook: string }).hook).toBe('useWorkloadDeployment')
    })

    it('uses custom component', () => {
      expect((workloadDeploymentConfig.content as { component: string }).component).toBe('WorkloadDeploymentUI')
    })
  })

  describe('workload-monitor', () => {
    it('has correct type and category', () => {
      expect(workloadMonitorConfig.type).toBe('workload_monitor')
      expect(workloadMonitorConfig.category).toBe('workloads')
    })

    it('has larger dimensions for monitoring view', () => {
      expect(workloadMonitorConfig.defaultWidth).toBeGreaterThanOrEqual(8)
      expect(workloadMonitorConfig.defaultHeight).toBeGreaterThanOrEqual(4)
    })

    it('is live data', () => {
      expect(workloadMonitorConfig.isLive).toBe(true)
    })
  })

  describe('containerd-status', () => {
    it('is registered in the config registry', () => {
      expect(hasUnifiedConfig(containerdStatusConfig.type)).toBe(true)
    })

    it('uses hook data source', () => {
      expect(containerdStatusConfig.dataSource.type).toBe('hook')
    })
  })
})

// ============================================================================
// Cross-cutting Validations
// ============================================================================

const ALL_WORKLOAD_CARDS: Array<{ config: UnifiedCardConfig; name: string }> = [
  { config: deploymentStatusConfig, name: 'deployment-status' },
  { config: deploymentIssuesConfig, name: 'deployment-issues' },
  { config: deploymentMissionsConfig, name: 'deployment-missions' },
  { config: deploymentProgressConfig, name: 'deployment-progress' },
  { config: deploymentRiskScoreConfig, name: 'deployment-risk-score' },
  { config: deploymentRolloutTrackerConfig, name: 'deployment-rollout-tracker' },
  { config: workloadDeploymentConfig, name: 'workload-deployment' },
  { config: workloadMonitorConfig, name: 'workload-monitor' },
  { config: podIssuesConfig, name: 'pod-issues' },
  { config: podHealthTrendConfig, name: 'pod-health-trend' },
  { config: podLogsConfig, name: 'pod-logs' },
  { config: statefulSetStatusConfig, name: 'statefulset-status' },
  { config: daemonSetStatusConfig, name: 'daemonset-status' },
  { config: replicaSetStatusConfig, name: 'replicaset-status' },
  { config: jobStatusConfig, name: 'job-status' },
  { config: cronJobStatusConfig, name: 'cronjob-status' },
  { config: hpaStatusConfig, name: 'hpa-status' },
  { config: containerTetrisConfig, name: 'container-tetris' },
  { config: containerdStatusConfig, name: 'containerd-status' },
]

describe('Cross-cutting invariants for deployment & workload cards', () => {
  it('all cards have unique type identifiers', () => {
    const types = ALL_WORKLOAD_CARDS.map(c => c.config.type)
    expect(new Set(types).size).toBe(types.length)
  })

  it.each(ALL_WORKLOAD_CARDS)('$name type follows snake_case convention', ({ config }) => {
    expect(config.type).toMatch(/^[a-z][a-z0-9_]*$/)
  })

  it.each(ALL_WORKLOAD_CARDS)('$name has valid defaultWidth', ({ config }) => {
    const VALID_WIDTHS = [3, 4, 5, 6, 8, 12]
    expect(VALID_WIDTHS).toContain(config.defaultWidth)
  })

  it.each(ALL_WORKLOAD_CARDS)('$name has positive defaultHeight', ({ config }) => {
    expect(config.defaultHeight).toBeGreaterThan(0)
  })

  it.each(ALL_WORKLOAD_CARDS)('$name has non-empty title', ({ config }) => {
    expect(config.title.trim().length).toBeGreaterThan(0)
  })

  it.each(ALL_WORKLOAD_CARDS)('$name has icon configured', ({ config }) => {
    expect(config.icon).toBeTruthy()
  })

  it.each(ALL_WORKLOAD_CARDS)('$name has loadingState defined', ({ config }) => {
    expect(config.loadingState).toBeDefined()
  })

  it.each(ALL_WORKLOAD_CARDS)('$name is registered in config registry', ({ config }) => {
    expect(hasUnifiedConfig(config.type)).toBe(true)
  })
})
