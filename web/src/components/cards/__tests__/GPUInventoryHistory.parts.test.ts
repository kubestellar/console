/**
 * Tests for GPUInventoryHistory.parts — pure utility functions exported from
 * the GPU inventory history sub-module.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../charts/LazyEChart', () => ({
  LazyEChart: () => null,
}))

// Dynamically import after mocks are set up
async function getModule() {
  return import('../GPUInventoryHistory.parts')
}

describe('GPUInventoryHistory.parts — utility functions', () => {
  it('generateDemoData returns an array of data points', async () => {
    const { generateDemoData } = await getModule()
    const data = generateDemoData()
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBeGreaterThan(0)
  })

  it('generateDemoData points have required fields', async () => {
    const { generateDemoData } = await getModule()
    const data = generateDemoData()
    const point = data[0]
    expect(point).toHaveProperty('time')
    expect(point).toHaveProperty('total')
    expect(point).toHaveProperty('allocated')
  })

  it('generateDemoTableRows returns an array', async () => {
    const { generateDemoTableRows } = await getModule()
    const rows = generateDemoTableRows()
    expect(Array.isArray(rows)).toBe(true)
    expect(rows.length).toBeGreaterThan(0)
  })

  it('resolveGPUType returns a string', async () => {
    const { resolveGPUType } = await getModule()
    expect(typeof resolveGPUType('nvidia-a100')).toBe('string')
    expect(typeof resolveGPUType(undefined)).toBe('string')
  })

  it('getTypeColor returns a string', async () => {
    const { getTypeColor } = await getModule()
    expect(typeof getTypeColor(0)).toBe('string')
    expect(typeof getTypeColor(3)).toBe('string')
  })

  it('exports expected constants', async () => {
    const mod = await getModule()
    expect(mod.MIN_TREND_SNAPSHOTS).toBeGreaterThan(0)
    expect(mod.HIGH_USAGE_PCT).toBeGreaterThan(0)
    expect(mod.MEDIUM_USAGE_PCT).toBeGreaterThan(0)
    expect(Array.isArray(mod.GPU_TYPE_COLORS)).toBe(true)
  })
})
