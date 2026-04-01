/**
 * ClusterDetailModal Component Tests
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))

/** Timeout for importing heavy modules — ClusterDetailModal pulls in charts/MCP */
const IMPORT_TIMEOUT_MS = 60000

describe('ClusterDetailModal', () => {
  it('exports ClusterDetailModal component', async () => {
    const mod = await import('../ClusterDetailModal')
    expect(mod.ClusterDetailModal).toBeDefined()
    expect(typeof mod.ClusterDetailModal).toBe('function')
  }, IMPORT_TIMEOUT_MS)
})
