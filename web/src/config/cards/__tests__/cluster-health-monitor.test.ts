// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { clusterHealthMonitorConfig } from '../cluster-health-monitor'
import * as moduleExports from '../cluster-health-monitor'
import { registerCardConfigTest } from './card-config-test-helpers'

registerCardConfigTest('cluster-health-monitor', moduleExports)

describe('cluster-health-monitor configuration coverage', () => {
  it('validates all required fields', () => {
    expect(clusterHealthMonitorConfig.type).toBe('cluster_health_monitor')
    expect(clusterHealthMonitorConfig.title).toBe('Cluster Monitor')
    expect(clusterHealthMonitorConfig.category).toBe('cluster-health')
    expect(clusterHealthMonitorConfig.description).toBe('Comprehensive cluster health')
  })

  it('validates appearance fields', () => {
    expect(clusterHealthMonitorConfig.icon).toBe('HeartPulse')
    expect(clusterHealthMonitorConfig.iconColor).toBe('text-red-400')
    expect(clusterHealthMonitorConfig.defaultWidth).toBe(6)
    expect(clusterHealthMonitorConfig.defaultHeight).toBe(3)
  })

  it('validates data source configuration', () => {
    expect(clusterHealthMonitorConfig.dataSource.type).toBe('hook')
    expect(clusterHealthMonitorConfig.dataSource.hook).toBe('useClusterHealthMonitor')
  })

  it('validates content configuration', () => {
    expect(clusterHealthMonitorConfig.content.type).toBe('custom')
    expect(clusterHealthMonitorConfig.content.component).toBe('ClusterHealthView')
  })

  it('validates empty state configuration', () => {
    expect(clusterHealthMonitorConfig.emptyState?.icon).toBe('HeartPulse')
    expect(clusterHealthMonitorConfig.emptyState?.title).toBe('No Clusters')
    expect(clusterHealthMonitorConfig.emptyState?.variant).toBe('info')
  })

  it('validates loading state configuration', () => {
    expect(clusterHealthMonitorConfig.loadingState?.type).toBe('custom')
  })

  it('validates metadata fields', () => {
    expect(clusterHealthMonitorConfig.isDemoData).toBe(false)
    expect(clusterHealthMonitorConfig.isLive).toBe(true)
  })
})
