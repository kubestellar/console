import { describe, it, expect } from 'vitest'

describe('unified/migration/types', () => {
  it('module can be imported', async () => {
    const mod = await import('../types')
    expect(mod).toBeDefined()
  })
})
