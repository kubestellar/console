import { describe, it, expect } from 'vitest'

describe('cache/schema', () => {
  it('module can be imported', async () => {
    const mod = await import('../schema')
    expect(mod).toBeDefined()
  })
})
