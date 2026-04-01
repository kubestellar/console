import { describe, it, expect } from 'vitest'

describe('widgetRegistry', () => {
  it('module can be imported', async () => {
    const mod = await import('../widgetRegistry')
    expect(mod).toBeDefined()
  })
})
