// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { clusterHealthConfig } from '../cluster-health'
import * as moduleExports from '../cluster-health'
import { registerCardConfigTest } from './card-config-test-helpers'

registerCardConfigTest('cluster-health', moduleExports)

describe('cluster-health configuration coverage', () => {
  it('validates all required fields', () => {
    expect(clusterHealthConfig.type).toBe('cluster_health')
    expect(clusterHealthConfig.title).toBe('Cluster Health')
    expect(clusterHealthConfig.category).toBe('cluster-health')
    expect(clusterHealthConfig.description).toBe('Health status of all connected Kubernetes clusters')
  })

  it('validates appearance fields', () => {
    expect(clusterHealthConfig.icon).toBe('Activity')
    expect(clusterHealthConfig.iconColor).toBe('text-green-400')
    expect(clusterHealthConfig.defaultWidth).toBe(4)
    expect(clusterHealthConfig.defaultHeight).toBe(3)
  })

  it('validates data source configuration', () => {
    expect(clusterHealthConfig.dataSource).toBeDefined()
    expect(clusterHealthConfig.dataSource.type).toBe('hook')
    expect(clusterHealthConfig.dataSource.hook).toBe('useClusters')
  })

  it('validates stats configuration', () => {
    expect(clusterHealthConfig.stats).toBeDefined()
    expect(clusterHealthConfig.stats).toHaveLength(3)
    
    const healthyStat = clusterHealthConfig.stats?.[0]
    expect(healthyStat?.id).toBe('healthy')
    expect(healthyStat?.icon).toBe('CheckCircle')
    expect(healthyStat?.color).toBe('text-green-400')
    expect(healthyStat?.label).toBe('Healthy')
    
    const unhealthyStat = clusterHealthConfig.stats?.[1]
    expect(unhealthyStat?.id).toBe('unhealthy')
    expect(unhealthyStat?.icon).toBe('XCircle')
    
    const offlineStat = clusterHealthConfig.stats?.[2]
    expect(offlineStat?.id).toBe('offline')
    expect(offlineStat?.icon).toBe('WifiOff')
  })

  it('validates filters configuration', () => {
    expect(clusterHealthConfig.filters).toBeDefined()
    expect(clusterHealthConfig.filters).toHaveLength(1)
    expect(clusterHealthConfig.filters?.[0].field).toBe('search')
    expect(clusterHealthConfig.filters?.[0].type).toBe('text')
    expect(clusterHealthConfig.filters?.[0].searchFields).toEqual(['name', 'context', 'server'])
  })

  it('validates content configuration', () => {
    expect(clusterHealthConfig.content.type).toBe('list')
    expect(clusterHealthConfig.content.pageSize).toBe(10)
    expect(clusterHealthConfig.content.itemClick).toBe('drill')
    expect(clusterHealthConfig.content.columns).toBeDefined()
    expect(clusterHealthConfig.content.columns).toHaveLength(4)
  })

  it('validates drillDown configuration', () => {
    expect(clusterHealthConfig.drillDown).toBeDefined()
    expect(clusterHealthConfig.drillDown?.action).toBe('openClusterDetail')
    expect(clusterHealthConfig.drillDown?.params).toEqual(['name'])
  })

  it('validates empty state configuration', () => {
    expect(clusterHealthConfig.emptyState).toBeDefined()
    expect(clusterHealthConfig.emptyState?.icon).toBe('Server')
    expect(clusterHealthConfig.emptyState?.title).toBe('No clusters connected')
    expect(clusterHealthConfig.emptyState?.variant).toBe('info')
  })

  it('validates loading state configuration', () => {
    expect(clusterHealthConfig.loadingState).toBeDefined()
    expect(clusterHealthConfig.loadingState?.type).toBe('list')
    expect(clusterHealthConfig.loadingState?.rows).toBe(5)
  })

  it('validates metadata fields', () => {
    expect(clusterHealthConfig.isDemoData).toBe(false)
    expect(clusterHealthConfig.isLive).toBe(true)
  })
})
