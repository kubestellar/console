import { describe, it, expect, vi } from 'vitest'

vi.mock('./DashboardState', () => ({
  useDashboardState: () => ({
    isLoading: false,
    localCards: [{ id: '1' }],
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
    activeDragData: null,
    activeId: null,
    collisionDetection: vi.fn(),
    dashboard: null,
    dashboards: [],
    handleAddSingleCard: vi.fn(),
    handleConfigureCard: vi.fn(),
    handleCreateDashboard: vi.fn(),
    handleDragCancel: vi.fn(),
    handleDragEnd: vi.fn(),
    handleDragOver: vi.fn(),
    handleDragStart: vi.fn(),
    handleGridKeyDown: vi.fn(),
    handleHeightChange: vi.fn(),
    handleInsertAfter: vi.fn(),
    handleRegisterExpandTrigger: vi.fn(),
    handleRemoveCard: vi.fn(),
    handleWidthChange: vi.fn(),
    isCustomized: false,
    isDragging: false,
    isRefreshing: false,
    registerCardRef: vi.fn(),
    sensors: [],
    showDragHint: false,
  }),
}))

import { DashboardView } from './DashboardView'

describe('DashboardView Component', () => {
  it('exports DashboardView component', () => {
    expect(DashboardView).toBeDefined()
    expect(typeof DashboardView).toBe('function')
  })
})
