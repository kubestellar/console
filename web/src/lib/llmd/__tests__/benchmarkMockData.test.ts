import { describe, it, expect } from 'vitest'

describe('benchmarkMockData', () => {
  it('module can be imported and exports data', async () => {
    const mod = await import('../benchmarkMockData')
    expect(mod).toBeDefined()
    expect(mod.getModelShort).toBeDefined()
    expect(mod.getHardwareShort).toBeDefined()
  })

  it('getModelShort returns short name', async () => {
    const { getModelShort } = await import('../benchmarkMockData')
    expect(typeof getModelShort('something')).toBe('string')
  })

  it('getHardwareShort returns short name', async () => {
    const { getHardwareShort } = await import('../benchmarkMockData')
    expect(typeof getHardwareShort('something')).toBe('string')
  })
})
