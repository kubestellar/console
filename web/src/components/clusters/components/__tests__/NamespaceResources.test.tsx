/**
 * NamespaceResources Component Tests
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))

/** Timeout for importing heavy modules — NamespaceResources pulls in MCP/chart deps */
const IMPORT_TIMEOUT_MS = 60000

describe('NamespaceResources', () => {
  it('exports NamespaceResources component', async () => {
    const mod = await import('../NamespaceResources')
    expect(mod.NamespaceResources).toBeDefined()
    expect(typeof mod.NamespaceResources).toBe('function')
  }, IMPORT_TIMEOUT_MS)
})
