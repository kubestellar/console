import { describe, it, expect } from 'vitest'

describe('cache coverage registry', () => {
  it('exposes cache stats helpers', async () => {
    const mod = await import('../index')
    expect(typeof mod.getCacheStats).toBe('function')
    expect(typeof mod.invalidateCache).toBe('function')
  })
})
