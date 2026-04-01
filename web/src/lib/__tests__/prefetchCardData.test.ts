import { describe, it, expect } from 'vitest'

describe('prefetchCardData', () => {
  it('module can be imported', async () => {
    const mod = await import('../prefetchCardData')
    expect(mod).toBeDefined()
  })
})
