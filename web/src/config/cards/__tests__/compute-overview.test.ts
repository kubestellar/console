// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { computeOverviewConfig } from '../compute-overview'
import * as moduleExports from '../compute-overview'
import { registerCardConfigTest } from './card-config-test-helpers'

registerCardConfigTest('compute-overview', moduleExports)

describe('compute-overview configuration coverage', () => {
  it('validates all required fields', () => {
    expect(computeOverviewConfig.type).toBe('compute_overview')
    expect(computeOverviewConfig.title).toBe('Compute Overview')
    expect(computeOverviewConfig.category).toBe('compute')
    expect(computeOverviewConfig.description).toBe('Compute resource summary')
  })

  it('validates appearance fields', () => {
    expect(computeOverviewConfig.icon).toBe('Cpu')
    expect(computeOverviewConfig.iconColor).toBe('text-blue-400')
    expect(computeOverviewConfig.defaultWidth).toBe(4)
    expect(computeOverviewConfig.defaultHeight).toBe(3)
  })

  it('validates data source configuration', () => {
    expect(computeOverviewConfig.dataSource.type).toBe('hook')
    expect(computeOverviewConfig.dataSource.hook).toBe('useComputeOverview')
  })

  it('validates content configuration', () => {
    expect(computeOverviewConfig.content.type).toBe('stats-grid')
    expect(computeOverviewConfig.content.stats).toBeDefined()
    expect(computeOverviewConfig.content.stats).toHaveLength(3)
    expect(computeOverviewConfig.content.stats?.[0].field).toBe('nodes')
    expect(computeOverviewConfig.content.stats?.[1].field).toBe('cpuUsage')
    expect(computeOverviewConfig.content.stats?.[2].field).toBe('memoryUsage')
  })

  it('validates empty state configuration', () => {
    expect(computeOverviewConfig.emptyState?.icon).toBe('Cpu')
    expect(computeOverviewConfig.emptyState?.title).toBe('No Data')
    expect(computeOverviewConfig.emptyState?.variant).toBe('info')
  })

  it('validates loading state configuration', () => {
    expect(computeOverviewConfig.loadingState?.type).toBe('stats')
    expect(computeOverviewConfig.loadingState?.count).toBe(3)
  })

  it('validates metadata fields', () => {
    expect(computeOverviewConfig.isDemoData).toBe(false)
    expect(computeOverviewConfig.isLive).toBe(true)
  })
})
