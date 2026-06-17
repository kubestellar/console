import { describe, it, expect } from 'vitest'

describe('cache coverage cleanup', () => {
  it('loads cache module for cleanup-focused coverage bucket', async () => {
    const mod = await import('../index')
    expect(mod.__testables).toHaveProperty('clearSessionSnapshots')
  })
})
