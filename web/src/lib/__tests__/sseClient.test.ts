import { describe, it, expect } from 'vitest'

describe('sseClient', () => {
  it('module can be imported', async () => {
    const mod = await import('../sseClient')
    expect(mod).toBeDefined()
  })
})
