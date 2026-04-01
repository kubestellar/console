import { describe, it, expect } from 'vitest'

describe('themes', () => {
  it('module can be imported', async () => {
    const mod = await import('../themes')
    expect(mod).toBeDefined()
  })
})
