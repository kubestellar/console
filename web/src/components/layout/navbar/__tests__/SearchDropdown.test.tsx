/**
 * SearchDropdown Component Tests
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/' }),
}))

vi.mock('../../../../hooks/useSearchIndex', () => ({
  useSearchIndex: () => ({ results: [], search: vi.fn(), clear: vi.fn() }),
  CATEGORY_ORDER: ['dashboard', 'card', 'cluster', 'resource'],
}))

vi.mock('../../../../hooks/useMissions', () => ({
  useMissions: () => ({ startMission: vi.fn() }),
}))

vi.mock('../../../../hooks/useSidebarConfig', () => ({
  useSidebarConfig: () => ({
    config: { items: [] },
    addItem: vi.fn(),
  }),
  DISCOVERABLE_DASHBOARDS: [],
}))

vi.mock('../../../../lib/scrollToCard', () => ({
  scrollToCard: vi.fn(),
}))

vi.mock('../../../../hooks/useFeatureHints', () => ({
  useFeatureHints: () => ({ hasHint: () => false, markSeen: vi.fn() }),
}))

vi.mock('../../../ui/FeatureHintTooltip', () => ({
  FeatureHintTooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('../../../../lib/analytics', () => ({
  emitGlobalSearchOpened: vi.fn(),
  emitGlobalSearchQueried: vi.fn(),
  emitGlobalSearchSelected: vi.fn(),
  emitGlobalSearchAskAI: vi.fn(),
}))

describe('SearchDropdown', () => {
  it('exports SearchDropdown component', async () => {
    const mod = await import('../SearchDropdown')
    expect(mod.SearchDropdown).toBeDefined()
    expect(typeof mod.SearchDropdown).toBe('function')
  })
})
