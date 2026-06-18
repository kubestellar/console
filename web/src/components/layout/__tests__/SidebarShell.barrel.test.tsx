import { describe, expect, it } from 'vitest'

describe('SidebarShell barrel export', () => {
  it('module can be imported', async () => {
    const mod = await import('../SidebarShell')
    expect(mod.SidebarShell).toBeDefined()
  })
})
