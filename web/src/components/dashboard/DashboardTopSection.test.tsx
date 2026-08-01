import { describe, it, expect, vi } from "vitest"

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>()
  return {
    ...actual,
    useTranslation: () => ({ t: (key: string) => key }),
    initReactI18next: { type: '3rdParty', init: () => {} },
  }
}),
}))

vi.mock('../../config/routes', () => ({
  ROUTES: {},
}))

import { DashboardTopSection } from './DashboardTopSection'

describe('DashboardTopSection Component', () => {
  it('exports DashboardTopSection component', () => {
    expect(DashboardTopSection).toBeDefined()
    expect(typeof DashboardTopSection).toBe('function')
  })

  it('renders with required props', () => {
    const props = {
      activeNudge: null,
      autoRefresh: false,
      clusters: [],
      clustersError: null,
      currentCardTypes: [],
      dismissNudge: vi.fn(),
      getStatValue: vi.fn(),
      handleAddRecommendedCard: vi.fn(),
      handleNudgeAction: vi.fn(),
      handleOpenDashboardCatalog: vi.fn(),
      handleRunHealthCheck: vi.fn(),
      isClustersLoading: false,
      isFetching: false,
      lastUpdated: null,
      navigate: vi.fn(),
      openAddCardModal: vi.fn(),
      openMissionSidebar: vi.fn(),
      setAutoRefresh: vi.fn(),
      triggerRefresh: vi.fn(),
    }
    expect(() => {
      DashboardTopSection(props as Parameters<typeof DashboardTopSection>[0])
    }).not.toThrow()
  })
})
