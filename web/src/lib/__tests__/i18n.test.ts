import { describe, it, expect } from 'vitest'

describe('i18n', () => {
  it('module can be imported', async () => {
    const mod = await import('../i18n')
    expect(mod).toBeDefined()
  })
})
