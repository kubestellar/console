import { describe, it, expect } from 'vitest'

describe('dynamic-cards/types', () => {
  it('module can be imported', async () => {
    const mod = await import('../types')
    expect(mod).toBeDefined()
  })
})
