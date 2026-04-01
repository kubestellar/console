import { describe, it, expect } from 'vitest'

describe('ai/prompts', () => {
  it('module can be imported', async () => {
    const mod = await import('../prompts')
    expect(mod).toBeDefined()
  })
})
