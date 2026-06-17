import { describe, it, expect } from 'vitest'

describe('cache coverage mode', () => {
  it('exposes refresh rate constants', async () => {
    const mod = await import('../index')
    expect(mod.REFRESH_RATES).toBeTypeOf('object')
  })
})
