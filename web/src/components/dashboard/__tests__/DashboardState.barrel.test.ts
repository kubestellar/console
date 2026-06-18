import { describe, expect, it } from 'vitest'

describe('DashboardState barrel export', () => {
  it('module can be imported', async () => {
    const mod = await import('../DashboardState')
    expect(mod.useDashboardState).toBeDefined()
  })
})
