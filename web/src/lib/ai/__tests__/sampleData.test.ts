import { describe, it, expect } from 'vitest'

describe('ai/sampleData', () => {
  it('module can be imported', async () => {
    const mod = await import('../sampleData')
    expect(mod).toBeDefined()
  })
})
