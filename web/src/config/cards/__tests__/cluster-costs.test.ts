// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { AMBER_500, BLUE_500, GREEN_500 } from '../../../lib/theme/chartColors'
import { clusterCostsConfig } from '../cluster-costs'
import * as moduleExports from '../cluster-costs'
import { registerCardConfigTest } from './card-config-test-helpers'

registerCardConfigTest('cluster-costs', moduleExports)

describe('cluster-costs configuration coverage', () => {
  it('validates all required fields', () => {
    expect(clusterCostsConfig.type).toBe('cluster_costs')
    expect(clusterCostsConfig.title).toBe('Cluster Costs')
    expect(clusterCostsConfig.category).toBe('cost')
    expect(clusterCostsConfig.description).toBe('Cost allocation by cluster')
  })

  it('validates appearance fields', () => {
    expect(clusterCostsConfig.icon).toBe('DollarSign')
    expect(clusterCostsConfig.iconColor).toBe('text-green-400')
    expect(clusterCostsConfig.defaultWidth).toBe(8)
    expect(clusterCostsConfig.defaultHeight).toBe(3)
  })

  it('validates data source configuration', () => {
    expect(clusterCostsConfig.dataSource.type).toBe('hook')
    expect(clusterCostsConfig.dataSource.hook).toBe('useClusterCosts')
  })

  it('validates content configuration', () => {
    expect(clusterCostsConfig.content.type).toBe('chart')
    expect(clusterCostsConfig.content.chartType).toBe('bar')
    expect(clusterCostsConfig.content.dataKey).toBe('clusters')
    expect(clusterCostsConfig.content.xAxis).toBe('cluster')
    expect(clusterCostsConfig.content.yAxis).toEqual(['compute', 'storage', 'network'])
    expect(clusterCostsConfig.content.colors).toEqual([BLUE_500, GREEN_500, AMBER_500])
  })

  it('validates empty state configuration', () => {
    expect(clusterCostsConfig.emptyState?.icon).toBe('DollarSign')
    expect(clusterCostsConfig.emptyState?.title).toBe('No Cost Data')
    expect(clusterCostsConfig.emptyState?.variant).toBe('info')
  })

  it('validates loading state configuration', () => {
    expect(clusterCostsConfig.loadingState?.type).toBe('chart')
  })

  it('validates metadata fields', () => {
    expect(clusterCostsConfig.isDemoData).toBe(false)
    expect(clusterCostsConfig.isLive).toBe(true)
  })
})
