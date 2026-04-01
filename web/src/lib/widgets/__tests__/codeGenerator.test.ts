import { describe, it, expect } from 'vitest'

describe('codeGenerator', () => {
  it('module can be imported', async () => {
    const mod = await import('../codeGenerator')
    expect(mod).toBeDefined()
  })
})
