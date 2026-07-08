// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { clusterFocusConfig } from '../cluster-focus'
import * as moduleExports from '../cluster-focus'
import { registerCardConfigTest } from './card-config-test-helpers'

registerCardConfigTest('cluster-focus', moduleExports)

describe('cluster-focus configuration coverage', () => {
  it('validates all required fields', () => {
    expect(clusterFocusConfig.type).toBe('cluster_focus')
    expect(clusterFocusConfig.title).toBe('Cluster Focus')
    expect(clusterFocusConfig.category).toBe('cluster-health')
    expect(clusterFocusConfig.description).toBe('Focused view of selected cluster')
  })

  it('validates appearance fields', () => {
    expect(clusterFocusConfig.icon).toBe('Target')
    expect(clusterFocusConfig.iconColor).toBe('text-purple-400')
    expect(clusterFocusConfig.defaultWidth).toBe(8)
    expect(clusterFocusConfig.defaultHeight).toBe(3)
  })

  it('validates data source configuration', () => {
    expect(clusterFocusConfig.dataSource.type).toBe('hook')
    expect(clusterFocusConfig.dataSource.hook).toBe('useClusterFocus')
  })

  it('validates content configuration', () => {
    expect(clusterFocusConfig.content.type).toBe('stats-grid')
    expect(clusterFocusConfig.content.stats).toBeDefined()
    expect(clusterFocusConfig.content.stats).toHaveLength(4)
    expect(clusterFocusConfig.content.stats?.[0].field).toBe('nodes')
    expect(clusterFocusConfig.content.stats?.[1].field).toBe('pods')
    expect(clusterFocusConfig.content.stats?.[2].field).toBe('cpu')
    expect(clusterFocusConfig.content.stats?.[3].field).toBe('memory')
  })

  it('validates empty state configuration', () => {
    expect(clusterFocusConfig.emptyState?.icon).toBe('Target')
    expect(clusterFocusConfig.emptyState?.title).toBe('Select Cluster')
    expect(clusterFocusConfig.emptyState?.variant).toBe('info')
  })

  it('validates loading state configuration', () => {
    expect(clusterFocusConfig.loadingState?.type).toBe('stats')
    expect(clusterFocusConfig.loadingState?.count).toBe(4)
  })

  it('validates metadata fields', () => {
    expect(clusterFocusConfig.isDemoData).toBe(false)
    expect(clusterFocusConfig.isLive).toBe(true)
  })
})
