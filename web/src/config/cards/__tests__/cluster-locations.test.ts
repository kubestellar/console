// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { clusterLocationsConfig } from '../cluster-locations'
import * as moduleExports from '../cluster-locations'
import { registerCardConfigTest } from './card-config-test-helpers'

registerCardConfigTest('cluster-locations', moduleExports)

describe('cluster-locations configuration coverage', () => {
  it('validates all required fields', () => {
    expect(clusterLocationsConfig.type).toBe('cluster_locations')
    expect(clusterLocationsConfig.title).toBe('Cluster Locations')
    expect(clusterLocationsConfig.category).toBe('cluster-health')
    expect(clusterLocationsConfig.description).toBe('Geographic distribution of clusters')
  })

  it('validates appearance fields', () => {
    expect(clusterLocationsConfig.icon).toBe('MapPin')
    expect(clusterLocationsConfig.iconColor).toBe('text-red-400')
    expect(clusterLocationsConfig.defaultWidth).toBe(8)
    expect(clusterLocationsConfig.defaultHeight).toBe(4)
  })

  it('validates data source configuration', () => {
    expect(clusterLocationsConfig.dataSource.type).toBe('hook')
    expect(clusterLocationsConfig.dataSource.hook).toBe('useClusterLocations')
  })

  it('validates content configuration', () => {
    expect(clusterLocationsConfig.content.type).toBe('custom')
    expect(clusterLocationsConfig.content.component).toBe('ClusterMap')
  })

  it('validates empty state configuration', () => {
    expect(clusterLocationsConfig.emptyState?.icon).toBe('MapPin')
    expect(clusterLocationsConfig.emptyState?.title).toBe('No Location Data')
    expect(clusterLocationsConfig.emptyState?.variant).toBe('info')
  })

  it('validates loading state configuration', () => {
    expect(clusterLocationsConfig.loadingState?.type).toBe('custom')
  })

  it('validates metadata fields', () => {
    expect(clusterLocationsConfig.isDemoData).toBe(false)
    expect(clusterLocationsConfig.isLive).toBe(true)
  })
})
