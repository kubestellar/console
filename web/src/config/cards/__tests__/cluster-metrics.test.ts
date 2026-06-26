// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { CYAN_500, PURPLE_400 } from '../../../lib/theme/chartColors'
import { clusterMetricsConfig } from '../cluster-metrics'
import * as moduleExports from '../cluster-metrics'
import { registerCardConfigTest } from './card-config-test-helpers'

registerCardConfigTest('cluster-metrics', moduleExports)

describe('cluster-metrics configuration coverage', () => {
  it('validates all required fields', () => {
    expect(clusterMetricsConfig.type).toBe('cluster_metrics')
    expect(clusterMetricsConfig.title).toBe('Cluster Metrics')
    expect(clusterMetricsConfig.category).toBe('compute')
    expect(clusterMetricsConfig.description).toBe('CPU and memory metrics over time')
  })

  it('validates appearance fields', () => {
    expect(clusterMetricsConfig.icon).toBe('Activity')
    expect(clusterMetricsConfig.iconColor).toBe('text-blue-400')
    expect(clusterMetricsConfig.defaultWidth).toBe(6)
    expect(clusterMetricsConfig.defaultHeight).toBe(4)
  })

  it('validates data source configuration', () => {
    expect(clusterMetricsConfig.dataSource.type).toBe('hook')
    expect(clusterMetricsConfig.dataSource.hook).toBe('useCachedClusterMetrics')
  })

  it('validates stats configuration', () => {
    expect(clusterMetricsConfig.stats).toBeDefined()
    expect(clusterMetricsConfig.stats).toHaveLength(2)
    
    const cpuStat = clusterMetricsConfig.stats?.[0]
    expect(cpuStat?.id).toBe('currentCpu')
    expect(cpuStat?.icon).toBe('Cpu')
    expect(cpuStat?.label).toBe('CPU')
    
    const memoryStat = clusterMetricsConfig.stats?.[1]
    expect(memoryStat?.id).toBe('currentMemory')
    expect(memoryStat?.icon).toBe('MemoryStick')
    expect(memoryStat?.label).toBe('Memory')
  })

  it('validates content configuration', () => {
    expect(clusterMetricsConfig.content.type).toBe('chart')
    expect(clusterMetricsConfig.content.chartType).toBe('area')
    expect(clusterMetricsConfig.content.height).toBe(250)
    expect(clusterMetricsConfig.content.showLegend).toBe(true)
    expect(clusterMetricsConfig.content.xAxis?.field).toBe('time')
    expect(clusterMetricsConfig.content.yAxis?.label).toBe('Usage %')
    expect(clusterMetricsConfig.content.series).toHaveLength(2)
    expect(clusterMetricsConfig.content.series?.[0].field).toBe('cpu')
    expect(clusterMetricsConfig.content.series?.[0].color).toBe(CYAN_500)
    expect(clusterMetricsConfig.content.series?.[1].field).toBe('memory')
    expect(clusterMetricsConfig.content.series?.[1].color).toBe(PURPLE_400)
  })

  it('validates empty state configuration', () => {
    expect(clusterMetricsConfig.emptyState?.icon).toBe('Activity')
    expect(clusterMetricsConfig.emptyState?.title).toBe('No metrics data')
    expect(clusterMetricsConfig.emptyState?.variant).toBe('neutral')
  })

  it('validates loading state configuration', () => {
    expect(clusterMetricsConfig.loadingState?.type).toBe('chart')
    expect(clusterMetricsConfig.loadingState?.rows).toBe(1)
    expect(clusterMetricsConfig.loadingState?.showSearch).toBe(false)
  })

  it('validates metadata fields', () => {
    expect(clusterMetricsConfig.isDemoData).toBe(false)
    expect(clusterMetricsConfig.isLive).toBe(true)
  })
})
