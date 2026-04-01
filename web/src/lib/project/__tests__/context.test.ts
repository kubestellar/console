import { describe, it, expect } from 'vitest'

describe('project/context', () => {
  it('module can be imported', async () => {
    const mod = await import('../context')
    expect(mod).toBeDefined()
  })
})
