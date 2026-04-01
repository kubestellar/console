import { describe, it, expect } from 'vitest'

describe('settingsTypes', () => {
  it('module exports types (compile-time check)', async () => {
    const mod = await import('../settingsTypes')
    expect(mod).toBeDefined()
  })
})
