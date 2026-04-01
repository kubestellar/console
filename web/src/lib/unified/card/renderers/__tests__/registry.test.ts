import { describe, it, expect } from 'vitest'

describe('unified/card/renderers/registry', () => {
  it('module can be imported', async () => {
    const mod = await import('../registry')
    expect(mod).toBeDefined()
  })
})
