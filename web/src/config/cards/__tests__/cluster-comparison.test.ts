// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { clusterComparisonConfig } from '../cluster-comparison'
import * as moduleExports from '../cluster-comparison'
import { registerCardConfigTest } from './card-config-test-helpers'

registerCardConfigTest('cluster-comparison', moduleExports)

describe('cluster-comparison configuration coverage', () => {
  it('validates all required fields', () => {
    expect(clusterComparisonConfig.type).toBe('cluster_comparison')
    expect(clusterComparisonConfig.title).toBe('Cluster Comparison')
    expect(clusterComparisonConfig.category).toBe('cluster-health')
    expect(clusterComparisonConfig.description).toBe('Compare metrics across clusters')
  })

  it('validates appearance fields', () => {
    expect(clusterComparisonConfig.icon).toBe('GitCompare')
    expect(clusterComparisonConfig.iconColor).toBe('text-blue-400')
    expect(clusterComparisonConfig.defaultWidth).toBe(12)
    expect(clusterComparisonConfig.defaultHeight).toBe(4)
  })

  it('validates data source configuration', () => {
    expect(clusterComparisonConfig.dataSource.type).toBe('hook')
    expect(clusterComparisonConfig.dataSource.hook).toBe('useClusterComparison')
  })

  it('validates content configuration', () => {
    expect(clusterComparisonConfig.content.type).toBe('table')
    expect(clusterComparisonConfig.content.columns).toBeDefined()
    expect(clusterComparisonConfig.content.columns).toHaveLength(6)
    expect(clusterComparisonConfig.content.columns?.[0].field).toBe('cluster')
    expect(clusterComparisonConfig.content.columns?.[0].primary).toBe(true)
  })

  it('validates empty state configuration', () => {
    expect(clusterComparisonConfig.emptyState?.icon).toBe('GitCompare')
    expect(clusterComparisonConfig.emptyState?.title).toBe('No Clusters')
    expect(clusterComparisonConfig.emptyState?.variant).toBe('info')
  })

  it('validates loading state configuration', () => {
    expect(clusterComparisonConfig.loadingState?.type).toBe('table')
    expect(clusterComparisonConfig.loadingState?.rows).toBe(4)
  })

  it('validates metadata fields', () => {
    expect(clusterComparisonConfig.isDemoData).toBe(false)
    expect(clusterComparisonConfig.isLive).toBe(true)
  })
})
