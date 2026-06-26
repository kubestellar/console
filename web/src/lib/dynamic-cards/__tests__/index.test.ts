import { describe, it, expect } from 'vitest'

describe('dynamic-cards barrel export', () => {
  it('module can be imported', async () => {
    const mod = await import('../index')
    expect(mod).toBeDefined()
  })
})
