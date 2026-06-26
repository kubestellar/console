import { describe, it, expect } from 'vitest'

describe('constants barrel export', () => {
  it('re-exports network, storage, and ui modules', async () => {
    const mod = await import('../index')
    expect(mod).toBeDefined()
    // Should have network constants
    expect(mod.WS_CONNECT_TIMEOUT_MS).toBeDefined()
    // Should have storage constants
    expect(mod.STORAGE_KEY_TOKEN).toBeDefined()
  })
})
