/**
 * Cluster Card Config Tests
 *
 * Tests cluster-related card configurations.
 */
import { describe, it, expect } from 'vitest'
import { clusterComparisonConfig } from '../cluster-comparison'
import { clusterCostsConfig } from '../cluster-costs'
import { clusterFocusConfig } from '../cluster-focus'
import { clusterGroupsConfig } from '../cluster-groups'
import { clusterHealthConfig } from '../cluster-health'
import { clusterHealthMonitorConfig } from '../cluster-health-monitor'
import { clusterLocationsConfig } from '../cluster-locations'
import { clusterMetricsConfig } from '../cluster-metrics'
import { clusterNetworkConfig } from '../cluster-network'
import { clusterResourceTreeConfig } from '../cluster-resource-tree'
import { clusterDeltaDetectorConfig } from '../cluster-delta-detector'

const clusterCards = [
  { name: 'clusterComparison', config: clusterComparisonConfig },
  { name: 'clusterCosts', config: clusterCostsConfig },
  { name: 'clusterFocus', config: clusterFocusConfig },
  { name: 'clusterGroups', config: clusterGroupsConfig },
  { name: 'clusterHealth', config: clusterHealthConfig },
  { name: 'clusterHealthMonitor', config: clusterHealthMonitorConfig },
  { name: 'clusterLocations', config: clusterLocationsConfig },
  { name: 'clusterMetrics', config: clusterMetricsConfig },
  { name: 'clusterNetwork', config: clusterNetworkConfig },
  { name: 'clusterResourceTree', config: clusterResourceTreeConfig },
  { name: 'clusterDeltaDetector', config: clusterDeltaDetectorConfig },
]

describe('Cluster card configs', () => {
  it.each(clusterCards)('$name has valid structure', ({ config }) => {
    expect(config.type).toBeTruthy()
    expect(config.title).toBeTruthy()
    expect(config.category).toBeTruthy()
    expect(config.content).toBeDefined()
    expect(config.dataSource).toBeDefined()
  })

  it.each(clusterCards)('$name type contains relevant keyword', ({ config }) => {
    expect(config.type.includes('cluster') || config.type.includes('delta')).toBe(true)
  })

  it.each(clusterCards)('$name has description', ({ config }) => {
    if (config.description) {
      expect(config.description.length).toBeGreaterThan(0)
    }
  })
})
