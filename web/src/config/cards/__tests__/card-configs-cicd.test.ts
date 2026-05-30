/**
 * CI/CD & Pipeline Card Config Tests
 *
 * Tests CI/CD and pipeline card configurations.
 */
import { describe, it, expect } from 'vitest'
import { pipelineFlowConfig } from '../pipeline-flow'
import { prowJobsConfig } from '../prow-jobs'
import { prowStatusConfig } from '../prow-status'
import { prowHistoryConfig } from '../prow-history'
import { prowCiMonitorConfig } from '../prow-ci-monitor'
import { githubCiMonitorConfig } from '../github-ci-monitor'
import { nightlyE2eStatusConfig } from '../nightly-e2e-status'
import { nightlyReleasePulseConfig } from '../nightly-release-pulse'

const cicdCards = [
  { name: 'pipelineFlow', config: pipelineFlowConfig },
  { name: 'prowJobs', config: prowJobsConfig },
  { name: 'prowStatus', config: prowStatusConfig },
  { name: 'prowHistory', config: prowHistoryConfig },
  { name: 'prowCiMonitor', config: prowCiMonitorConfig },
  { name: 'githubCiMonitor', config: githubCiMonitorConfig },
  { name: 'nightlyE2eStatus', config: nightlyE2eStatusConfig },
  { name: 'nightlyReleasePulse', config: nightlyReleasePulseConfig },
]

describe('CI/CD & Pipeline card configs', () => {
  it.each(cicdCards)('$name has valid structure', ({ config }) => {
    expect(config.type).toBeTruthy()
    expect(config.title).toBeTruthy()
    expect(config.category).toBeTruthy()
    expect(config.content).toBeDefined()
    expect(config.dataSource).toBeDefined()
  })

  it.each(cicdCards)('$name has valid dimensions', ({ config }) => {
    expect(config.defaultWidth).toBeGreaterThan(0)
    expect(config.defaultHeight).toBeGreaterThan(0)
  })

  it.each(cicdCards)('$name has icon', ({ config }) => {
    expect(config.icon).toBeTruthy()
  })

  it.each(cicdCards)('$name type contains pipeline/ci/prow keyword', ({ config }) => {
    const lowerType = config.type.toLowerCase()
    const lowerTitle = config.title.toLowerCase()
    const hasKeyword =
      lowerType.includes('pipeline') ||
      lowerType.includes('prow') ||
      lowerType.includes('ci') ||
      lowerType.includes('nightly') ||
      lowerTitle.includes('ci') ||
      lowerTitle.includes('pipeline')
    expect(hasKeyword).toBe(true)
  })
})
