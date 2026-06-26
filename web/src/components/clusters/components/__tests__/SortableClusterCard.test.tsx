/**
 * SortableClusterCard Component Tests
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (k: string) => k }),
}))

/** Timeout for importing heavy modules — SortableClusterCard pulls in dnd-kit/MCP */
const IMPORT_TIMEOUT_MS = 60000

describe('SortableClusterCard', () => {
  it('exports SortableClusterCard component', async () => {
    const mod = await import('../SortableClusterCard')
    expect(mod.SortableClusterCard).toBeDefined()
    // SortableClusterCard is wrapped in React.memo
    expect(typeof mod.SortableClusterCard).toMatch(/function|object/)
  }, IMPORT_TIMEOUT_MS)
})
