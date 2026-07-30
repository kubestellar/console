/**
 * Analytics & Observability Card Config Tests
 * Covers: deployment-risk-score, drasi-reactive-graph, nightly-release-pulse,
 * pipeline-flow, pod-logs, recent-failures, right-size-advisor, workflow-matrix
 */
import { describe, it, expect } from 'vitest'
import { deploymentRiskScoreConfig } from '../deployment-risk-score'
import { drasiReactiveGraphConfig } from '../drasi-reactive-graph'
import { nightlyReleasePulseConfig } from '../nightly-release-pulse'
import { pipelineFlowConfig } from '../pipeline-flow'
import { podLogsConfig } from '../pod-logs'
import { recentFailuresConfig } from '../recent-failures'
import { rightSizeAdvisorConfig } from '../right-size-advisor'
import { workflowMatrixConfig } from '../workflow-matrix'

const analyticsCards = [
  { name: 'deploymentRiskScore', config: deploymentRiskScoreConfig },
  { name: 'drasiReactiveGraph', config: drasiReactiveGraphConfig },
  { name: 'nightlyReleasePulse', config: nightlyReleasePulseConfig },
  { name: 'pipelineFlow', config: pipelineFlowConfig },
  { name: 'podLogs', config: podLogsConfig },
  { name: 'recentFailures', config: recentFailuresConfig },
  { name: 'rightSizeAdvisor', config: rightSizeAdvisorConfig },
  { name: 'workflowMatrix', config: workflowMatrixConfig },
]

describe('Analytics & observability card configs', () => {
  it.each(analyticsCards)('$name has valid structure', ({ config }) => {
    expect(config.type).toBeTruthy()
    expect(config.title).toBeTruthy()
    expect(config.category).toBeTruthy()
    expect(config.content).toBeDefined()
    expect(config.dataSource).toBeDefined()
  })

  it.each(analyticsCards)('$name has icon and color', ({ config }) => {
    expect(config.icon).toBeTruthy()
    expect(config.iconColor).toBeTruthy()
  })

  it.each(analyticsCards)('$name has loading and empty states', ({ config }) => {
    expect(config.loadingState).toBeDefined()
    expect(config.emptyState).toBeDefined()
    expect(config.emptyState.title).toBeTruthy()
  })

  it.each(analyticsCards)('$name has default dimensions', ({ config }) => {
    expect(config.defaultWidth).toBeGreaterThan(0)
    expect(config.defaultHeight).toBeGreaterThan(0)
  })
})
