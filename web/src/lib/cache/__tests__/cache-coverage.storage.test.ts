import { describe, it, expect } from 'vitest'

describe('cache coverage storage', () => {
  it('exposes session snapshot read/write helpers', async () => {
    const mod = await import('../index')
    expect(mod.__testables).toHaveProperty('ssRead')
    expect(mod.__testables).toHaveProperty('ssWrite')
  })
})
