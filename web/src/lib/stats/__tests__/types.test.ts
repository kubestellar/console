import { describe, it, expect } from 'vitest'

describe('stats/types', () => {
  it('module can be imported', async () => {
    const mod = await import('../types')
    expect(mod).toBeDefined()
  })
})
