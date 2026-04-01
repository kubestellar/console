/**
 * ClusterGrid Component Tests
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))

/** Timeout for importing heavy modules */
const IMPORT_TIMEOUT_MS = 30000

describe('ClusterGrid', () => {
  it('exports ClusterGrid component', async () => {
    const mod = await import('../ClusterGrid')
    expect(mod.ClusterGrid).toBeDefined()
    // ClusterGrid is wrapped in React.memo, which is an object
    expect(typeof mod.ClusterGrid).toMatch(/function|object/)
  }, IMPORT_TIMEOUT_MS)
})
