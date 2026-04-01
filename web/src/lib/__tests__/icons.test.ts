import { describe, it, expect } from 'vitest'

describe('icons', () => {
  it('exports iconRegistry', async () => {
    const mod = await import('../icons')
    expect(mod.iconRegistry).toBeDefined()
    expect(typeof mod.iconRegistry).toBe('object')
  })
})
