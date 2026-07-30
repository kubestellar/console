// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { clusterNetworkConfig } from '../cluster-network'
import * as moduleExports from '../cluster-network'
import { registerCardConfigTest } from './card-config-test-helpers'

registerCardConfigTest('cluster-network', moduleExports)

describe('cluster-network configuration coverage', () => {
  it('validates all required fields', () => {
    expect(clusterNetworkConfig.type).toBe('cluster_network')
    expect(clusterNetworkConfig.title).toBe('Cluster Network')
    expect(clusterNetworkConfig.category).toBe('network')
    expect(clusterNetworkConfig.description).toBe('Network topology visualization')
  })

  it('validates appearance fields', () => {
    expect(clusterNetworkConfig.icon).toBe('Network')
    expect(clusterNetworkConfig.iconColor).toBe('text-cyan-400')
    expect(clusterNetworkConfig.defaultWidth).toBe(8)
    expect(clusterNetworkConfig.defaultHeight).toBe(4)
  })

  it('validates data source configuration', () => {
    expect(clusterNetworkConfig.dataSource.type).toBe('hook')
    expect(clusterNetworkConfig.dataSource.hook).toBe('useClusterNetwork')
  })

  it('validates content configuration', () => {
    expect(clusterNetworkConfig.content.type).toBe('custom')
    expect(clusterNetworkConfig.content.component).toBe('NetworkTopology')
  })

  it('validates empty state configuration', () => {
    expect(clusterNetworkConfig.emptyState?.icon).toBe('Network')
    expect(clusterNetworkConfig.emptyState?.title).toBe('No Network Data')
    expect(clusterNetworkConfig.emptyState?.variant).toBe('info')
  })

  it('validates loading state configuration', () => {
    expect(clusterNetworkConfig.loadingState?.type).toBe('custom')
  })

  it('validates metadata fields', () => {
    expect(clusterNetworkConfig.isDemoData).toBe(false)
    expect(clusterNetworkConfig.isLive).toBe(true)
  })
})
