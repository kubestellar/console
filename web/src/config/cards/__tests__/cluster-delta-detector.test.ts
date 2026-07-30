// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { clusterDeltaDetectorConfig } from '../cluster-delta-detector'
import * as moduleExports from '../cluster-delta-detector'
import { registerCardConfigTest } from './card-config-test-helpers'

registerCardConfigTest('cluster-delta-detector', moduleExports)

describe('cluster-delta-detector configuration coverage', () => {
  it('validates all required fields', () => {
    expect(clusterDeltaDetectorConfig.type).toBe('cluster_delta_detector')
    expect(clusterDeltaDetectorConfig.title).toBe('Cluster Delta Detector')
    expect(clusterDeltaDetectorConfig.category).toBe('insights')
    expect(clusterDeltaDetectorConfig.description).toBe('Detects differences between clusters sharing the same workloads')
  })

  it('validates appearance fields', () => {
    expect(clusterDeltaDetectorConfig.icon).toBe('GitCompare')
    expect(clusterDeltaDetectorConfig.iconColor).toBe('text-blue-400')
    expect(clusterDeltaDetectorConfig.defaultWidth).toBe(8)
    expect(clusterDeltaDetectorConfig.defaultHeight).toBe(4)
  })

  it('validates data source configuration', () => {
    expect(clusterDeltaDetectorConfig.dataSource.type).toBe('hook')
    expect(clusterDeltaDetectorConfig.dataSource.hook).toBe('useMultiClusterInsights')
  })

  it('validates content configuration', () => {
    expect(clusterDeltaDetectorConfig.content.type).toBe('custom')
  })

  it('validates empty state configuration', () => {
    expect(clusterDeltaDetectorConfig.emptyState?.icon).toBe('GitCompare')
    expect(clusterDeltaDetectorConfig.emptyState?.title).toBe('No cluster deltas detected')
    expect(clusterDeltaDetectorConfig.emptyState?.message).toBe('Shared workloads are consistent across clusters')
    expect(clusterDeltaDetectorConfig.emptyState?.variant).toBe('neutral')
  })

  it('validates loading state configuration', () => {
    expect(clusterDeltaDetectorConfig.loadingState?.type).toBe('chart')
  })

  it('validates metadata fields', () => {
    expect(clusterDeltaDetectorConfig.isDemoData).toBe(false)
    expect(clusterDeltaDetectorConfig.isLive).toBe(true)
  })
})
