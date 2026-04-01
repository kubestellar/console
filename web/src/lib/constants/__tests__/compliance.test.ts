import { describe, it, expect } from 'vitest'

describe('constants/compliance', () => {
  it('module can be imported', async () => {
    const mod = await import('../compliance')
    expect(mod).toBeDefined()
  })
})
