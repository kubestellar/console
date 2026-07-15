import { describe, it, expect } from 'vitest'

describe('modals barrel export', () => {
  it('module can be imported', async () => {
    const mod = await import('../index')
    expect(mod).toBeDefined()
  })
})
