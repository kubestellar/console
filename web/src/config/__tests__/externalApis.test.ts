/**
 * External APIs Configuration Tests
 */
import { describe, it, expect } from 'vitest'

// Mock import.meta.env before importing the module
vi.stubGlobal('import', { meta: { env: {} } })

describe('External APIs config', () => {
  it('exports are importable', async () => {
    // Dynamic import so mocks are in place
    const mod = await import('../externalApis')
    expect(mod).toBeDefined()
  })
})
