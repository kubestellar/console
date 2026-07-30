// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { clusterResourceTreeConfig } from '../cluster-resource-tree'
import * as moduleExports from '../cluster-resource-tree'
import { registerCardConfigTest } from './card-config-test-helpers'

registerCardConfigTest('cluster-resource-tree', moduleExports)

describe('cluster-resource-tree configuration coverage', () => {
  it('validates all required fields', () => {
    expect(clusterResourceTreeConfig.type).toBe('cluster_resource_tree')
    expect(clusterResourceTreeConfig.title).toBe('Resource Tree')
    expect(clusterResourceTreeConfig.category).toBe('cluster-health')
    expect(clusterResourceTreeConfig.description).toBe('Hierarchical view of cluster resources')
  })

  it('validates appearance fields', () => {
    expect(clusterResourceTreeConfig.icon).toBe('GitBranch')
    expect(clusterResourceTreeConfig.iconColor).toBe('text-purple-400')
    expect(clusterResourceTreeConfig.defaultWidth).toBe(12)
    expect(clusterResourceTreeConfig.defaultHeight).toBe(5)
  })

  it('validates data source configuration', () => {
    expect(clusterResourceTreeConfig.dataSource.type).toBe('hook')
    expect(clusterResourceTreeConfig.dataSource.hook).toBe('useClusterResourceTree')
  })

  it('validates content configuration', () => {
    expect(clusterResourceTreeConfig.content.type).toBe('custom')
    expect(clusterResourceTreeConfig.content.component).toBe('ResourceTree')
  })

  it('validates empty state configuration', () => {
    expect(clusterResourceTreeConfig.emptyState?.icon).toBe('GitBranch')
    expect(clusterResourceTreeConfig.emptyState?.title).toBe('No Resources')
    expect(clusterResourceTreeConfig.emptyState?.variant).toBe('info')
  })

  it('validates loading state configuration', () => {
    expect(clusterResourceTreeConfig.loadingState?.type).toBe('custom')
  })

  it('validates metadata fields', () => {
    expect(clusterResourceTreeConfig.isDemoData).toBe(false)
    expect(clusterResourceTreeConfig.isLive).toBe(true)
  })
})
