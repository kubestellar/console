import { describe, it, expect } from 'vitest'

describe('llmd/mockData', () => {
  it('module can be imported', async () => {
    const mod = await import('../mockData')
    expect(mod).toBeDefined()
  })
})
