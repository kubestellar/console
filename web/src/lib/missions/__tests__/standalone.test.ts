import { describe, it, expect } from 'vitest'

describe('missions/scanner/standalone', () => {
  it('module can be imported', async () => {
    const mod = await import('../scanner/standalone')
    expect(mod).toBeDefined()
  })
})
