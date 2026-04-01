import { describe, it, expect } from 'vitest'

describe('dashboards/types', () => {
  it('module can be imported', async () => {
    const mod = await import('../types')
    expect(mod).toBeDefined()
  })
})
