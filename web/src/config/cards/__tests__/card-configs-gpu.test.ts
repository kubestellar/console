/**
 * GPU Card Config Tests
 *
 * Tests GPU-related card configurations.
 */
import { describe, it, expect } from 'vitest'
import { gpuInventoryConfig } from '../gpu-inventory'
import { gpuInventoryHistoryConfig } from '../gpu-inventory-history'
import { gpuOverviewConfig } from '../gpu-overview'
import { gpuStatusConfig } from '../gpu-status'
import { gpuUsageTrendConfig } from '../gpu-usage-trend'
import { gpuUtilizationConfig } from '../gpu-utilization'
import { gpuNodeHealthConfig } from '../gpu-node-health'
import { gpuWorkloadsConfig } from '../gpu-workloads'

const gpuCards = [
  { name: 'gpuInventory', config: gpuInventoryConfig },
  { name: 'gpuInventoryHistory', config: gpuInventoryHistoryConfig },
  { name: 'gpuOverview', config: gpuOverviewConfig },
  { name: 'gpuStatus', config: gpuStatusConfig },
  { name: 'gpuUsageTrend', config: gpuUsageTrendConfig },
  { name: 'gpuUtilization', config: gpuUtilizationConfig },
  { name: 'gpuNodeHealth', config: gpuNodeHealthConfig },
  { name: 'gpuWorkloads', config: gpuWorkloadsConfig },
]

describe('GPU card configs', () => {
  it.each(gpuCards)('$name has valid structure', ({ config }) => {
    expect(config.type).toBeTruthy()
    expect(config.title).toBeTruthy()
    expect(config.category).toBeTruthy()
    expect(config.content).toBeDefined()
    expect(config.dataSource).toBeDefined()
  })

  it.each(gpuCards)('$name type contains gpu', ({ config }) => {
    expect(config.type.includes('gpu')).toBe(true)
  })
})
