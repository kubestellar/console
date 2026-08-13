import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// ─── Mocks (hoisted; must sit above SUT import) ─────────────────────────────

const mockSafeGetItem = vi.fn()
const mockSafeSetItem = vi.fn()
vi.mock('../../lib/utils/localStorage', () => ({
  safeGetItem: (...a: unknown[]) => mockSafeGetItem(...a),
  safeSetItem: (...a: unknown[]) => mockSafeSetItem(...a),
}))

const mockSetAutoRefreshPaused = vi.fn()
vi.mock('../../lib/cache', () => ({
  setAutoRefreshPaused: (...a: unknown[]) => mockSetAutoRefreshPaused(...a),
}))

vi.mock('../../lib/analytics', () => ({
  emitCardDragged: vi.fn(),
  emitCardAdded: vi.fn(),
  emitCardRemoved: vi.fn(),
  emitCardConfigured: vi.fn(),
}))

const mockPrefetchCardChunks = vi.fn()
vi.mock('../cards/cardRegistry', () => ({
  prefetchCardChunks: (...a: unknown[]) => mockPrefetchCardChunks(...a),
}))

const mockUseLocation = vi.fn()
const mockUseNavigate = vi.fn()
const mockUseSearchParams = vi.fn()
vi.mock('react-router-dom', () => ({
  useLocation: () => mockUseLocation(),
  useNavigate: () => mockUseNavigate(),
  useSearchParams: () => mockUseSearchParams(),
}))

const mockUseDashboards = vi.fn()
vi.mock('../../hooks/useDashboards', () => ({
  useDashboards: () => mockUseDashboards(),
}))

const mockUseClusters = vi.fn()
vi.mock('../../hooks/useMCP', () => ({
  useClusters: () => mockUseClusters(),
}))

const mockUseCardHistory = vi.fn()
vi.mock('../../hooks/useCardHistory', () => ({
  useCardHistory: () => mockUseCardHistory(),
}))

const mockUseDrillDownActions = vi.fn()
vi.mock('../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => mockUseDrillDownActions(),
}))

const mockUseDashboardContext = vi.fn()
vi.mock('../../hooks/useDashboardContext', () => ({
  useDashboardContext: () => mockUseDashboardContext(),
}))

const mockShowToast = vi.fn()
vi.mock('../ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}))

const mockUseMissions = vi.fn()
vi.mock('../../hooks/useMissions', () => ({
  useMissions: () => mockUseMissions(),
}))

const mockUseDashboardReset = vi.fn()
vi.mock('../../hooks/useDashboardReset', () => ({
  useDashboardReset: () => mockUseDashboardReset(),
}))

const mockUndo = vi.fn()
const mockRedo = vi.fn()
const mockSnapshot = vi.fn()
const mockUseDashboardUndoRedo = vi.fn()
vi.mock('../../hooks/useUndoRedo', () => ({
  useDashboardUndoRedo: (...a: unknown[]) => mockUseDashboardUndoRedo(...a),
}))

const mockUseRefreshIndicator = vi.fn()
vi.mock('../../hooks/useRefreshIndicator', () => ({
  useRefreshIndicator: () => mockUseRefreshIndicator(),
}))

const mockUseContextualNudges = vi.fn()
vi.mock('../../hooks/useContextualNudges', () => ({
  useContextualNudges: () => mockUseContextualNudges(),
}))

vi.mock('../../hooks/useDashboardScrollTracking', () => ({
  useDashboardScrollTracking: () => undefined,
}))

vi.mock('../../lib/cardEvents', () => ({
  useCardPublish: () => vi.fn(),
}))

vi.mock('../../hooks/useWorkloads', () => ({
  useDeployWorkload: () => ({ mutate: vi.fn() }),
}))

const mockUseCardGridNavigation = vi.fn()
vi.mock('../../hooks/useCardGridNavigation', () => ({
  useCardGridNavigation: (opts: unknown) => mockUseCardGridNavigation(opts),
}))

const mockUseModalState = vi.fn()
let __modalStateCallIdx = 0
vi.mock('../../lib/modals', () => ({
  useModalState: () => {
    const idx = __modalStateCallIdx++ % 2
    return mockUseModalState(idx)
  },
}))

const mockUseGlobalFilters = vi.fn()
vi.mock('../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => mockUseGlobalFilters(),
}))

const mockUseDashboardSensors = vi.fn()
vi.mock('./dashboardState.sensors', () => ({
  useDashboardSensors: () => mockUseDashboardSensors(),
}))

vi.mock('./layout', () => ({
  dashboardCollisionDetection: vi.fn(),
}))

vi.mock('./persistence', () => ({
  AUTO_REFRESH_INTERVAL_MS: 30_000,
  DASHBOARD_STORAGE_KEY: 'test-dashboard-key',
  DEFAULT_DASHBOARD_CARDS: [],
  dashboardCache: null,
  initLocalCardsState: () => [],
  setDashboardCache: vi.fn(),
  patchDashboardCache: vi.fn(),
}))

vi.mock('./dashboardState.actions', () => ({
  loadDashboardData: vi.fn(),
  persistLocalCards: vi.fn(),
  addCardsToBoard: vi.fn(),
  removeCardFromBoard: vi.fn(),
  updateCardWidth: vi.fn(),
  updateCardHeight: vi.fn(),
  updateCardConfig: vi.fn(),
  addRecommendedCard: vi.fn(),
  addCardFromAI: vi.fn(),
  applyDashboardTemplate: vi.fn(),
  addSingleCard: vi.fn(),
  confirmDeployAction: vi.fn(),
  exportDashboardAsFile: vi.fn(),
  moveCardToDashboardAction: vi.fn(),
  moveCardToNewDashboardAction: vi.fn(),
}))

vi.mock('./dashboardState.selectors', () => ({
  computeFilteredClusters: (clusters: unknown[], selected: string[], isAll: boolean) =>
    isAll ? (clusters ?? []) : (clusters ?? []).filter((c: { name: string }) => selected.includes(c.name)),
  computeClusterStats: () => ({
    clusterCount: 0,
    healthyClusters: 0,
    unhealthyClusters: 0,
    healthyNodes: 0,
    totalPods: 0,
    totalNamespaces: 0,
    totalNodes: 0,
  }),
  resolveStatValue: (_id: string, _deps: unknown) => ({ value: 0 }),
  computeCurrentCardTypes: (cards: Array<{ card_type: string } | undefined | null>) =>
    (cards ?? []).filter(Boolean).map((c) => (c as { card_type: string }).card_type),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

// ─── SUT ────────────────────────────────────────────────────────────────────

import { STORAGE_KEY_DASHBOARD_AUTO_REFRESH } from '../../lib/constants'
import { useDashboardState } from './DashboardState'

// ─── Default mock factory ───────────────────────────────────────────────────

function buildDefaultMocks() {
  const mockSetSearchParams = vi.fn()
  const mockSearchParams = new URLSearchParams()
  mockUseLocation.mockReturnValue({ pathname: '/' })
  mockUseNavigate.mockReturnValue(vi.fn())
  mockUseSearchParams.mockReturnValue([mockSearchParams, mockSetSearchParams])

  mockUseDashboards.mockReturnValue({
    dashboards: [],
    moveCardToDashboard: vi.fn(),
    createDashboard: vi.fn(),
    exportDashboard: vi.fn(),
  })

  mockUseClusters.mockReturnValue({
    deduplicatedClusters: [],
    isRefreshing: false,
    lastUpdated: null,
    refetch: vi.fn(),
    isLoading: false,
    error: null,
  })

  mockUseCardHistory.mockReturnValue({
    recordCardRemoved: vi.fn(),
    recordCardAdded: vi.fn(),
    recordCardConfigured: vi.fn(),
  })

  mockUseDrillDownActions.mockReturnValue({
    drillToAllClusters: vi.fn(),
    drillToAllPods: vi.fn(),
    drillToAllNodes: vi.fn(),
  })

  mockUseDashboardContext.mockReturnValue({
    isAddCardModalOpen: false,
    closeAddCardModal: vi.fn(),
    openAddCardModal: vi.fn(),
    studioInitialSection: undefined,
    studioWidgetCardType: undefined,
    pendingOpenAddCardModal: null,
    setPendingOpenAddCardModal: vi.fn(),
    isTemplatesModalOpen: false,
    closeTemplatesModal: vi.fn(),
    openTemplatesModal: vi.fn(),
    pendingRestoreCard: null,
    clearPendingRestoreCard: vi.fn(),
  })

  mockUseMissions.mockReturnValue({
    openSidebar: vi.fn(),
    startMission: vi.fn(),
  })

  mockUseDashboardReset.mockReturnValue({
    reset: vi.fn(),
    isCustomized: false,
  })

  mockUseDashboardUndoRedo.mockReturnValue({
    snapshot: mockSnapshot,
    undo: mockUndo,
    redo: mockRedo,
    canUndo: false,
    canRedo: false,
  })

  mockUseRefreshIndicator.mockReturnValue({
    showIndicator: false,
    triggerRefresh: vi.fn(),
  })

  mockUseContextualNudges.mockReturnValue({
    activeNudge: null,
    showDragHint: false,
    dismissNudge: vi.fn(),
    actionNudge: vi.fn(),
    recordVisit: vi.fn(),
  })

  mockUseCardGridNavigation.mockReturnValue({
    registerCardRef: vi.fn(),
    handleGridKeyDown: vi.fn(),
  })

  mockUseModalState.mockImplementation(() => ({
    isOpen: false,
    open: vi.fn(),
    close: vi.fn(),
  }))

  mockUseGlobalFilters.mockReturnValue({
    selectedClusters: [],
    isAllClustersSelected: true,
  })

  mockUseDashboardSensors.mockReturnValue([])
  mockSafeGetItem.mockReturnValue(null)
}

beforeEach(() => {
  vi.clearAllMocks()
  __modalStateCallIdx = 0
  buildDefaultMocks()
})

afterEach(() => {
  vi.clearAllTimers()
})

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('useDashboardState — shape', () => {
  it('returns an object with expected stable keys', () => {
    const { result } = renderHook(() => useDashboardState())
    const state = result.current

    expect(state).toHaveProperty('localCards')
    expect(state).toHaveProperty('dashboard')
    expect(state).toHaveProperty('isLoading')
    expect(state).toHaveProperty('autoRefresh')
    expect(state).toHaveProperty('clusters')

    expect(typeof state.handleDragStart).toBe('function')
    expect(typeof state.handleDragOver).toBe('function')
    expect(typeof state.handleDragEnd).toBe('function')
    expect(typeof state.handleDragCancel).toBe('function')

    expect(typeof state.handleAddCards).toBe('function')
    expect(typeof state.handleRemoveCard).toBe('function')
    expect(typeof state.handleConfigureCard).toBe('function')
    expect(typeof state.handleWidthChange).toBe('function')
    expect(typeof state.handleHeightChange).toBe('function')
    expect(typeof state.handleCardConfigured).toBe('function')

    expect(typeof state.undo).toBe('function')
    expect(typeof state.redo).toBe('function')
    expect(state.canUndo).toBe(false)
    expect(state.canRedo).toBe(false)
  })
})

describe('useDashboardState — autoRefresh localStorage persistence', () => {
  it('defaults autoRefresh to true when localStorage has no entry', () => {
    mockSafeGetItem.mockReturnValue(null)
    const { result } = renderHook(() => useDashboardState())
    expect(result.current.autoRefresh).toBe(true)
  })

  it('reads autoRefresh=false from localStorage', () => {
    mockSafeGetItem.mockImplementation((key: string) =>
      key === STORAGE_KEY_DASHBOARD_AUTO_REFRESH ? 'false' : null
    )
    const { result } = renderHook(() => useDashboardState())
    expect(result.current.autoRefresh).toBe(false)
  })

  it('reads autoRefresh=true from localStorage', () => {
    mockSafeGetItem.mockImplementation((key: string) =>
      key === STORAGE_KEY_DASHBOARD_AUTO_REFRESH ? 'true' : null
    )
    const { result } = renderHook(() => useDashboardState())
    expect(result.current.autoRefresh).toBe(true)
  })

  it('persists autoRefresh when toggled via setAutoRefresh', () => {
    const { result } = renderHook(() => useDashboardState())
    act(() => {
      result.current.setAutoRefresh(false)
    })
    expect(mockSafeSetItem).toHaveBeenCalledWith(STORAGE_KEY_DASHBOARD_AUTO_REFRESH, 'false')
    expect(result.current.autoRefresh).toBe(false)
  })

  it('calls setAutoRefreshPaused(true) when autoRefresh is set to false', () => {
    const { result } = renderHook(() => useDashboardState())
    act(() => {
      result.current.setAutoRefresh(false)
    })
    expect(mockSetAutoRefreshPaused).toHaveBeenCalledWith(true)
  })

  it('calls setAutoRefreshPaused(false) when autoRefresh is set to true', () => {
    mockSafeGetItem.mockImplementation((key: string) =>
      key === STORAGE_KEY_DASHBOARD_AUTO_REFRESH ? 'false' : null
    )
    const { result } = renderHook(() => useDashboardState())
    act(() => {
      result.current.setAutoRefresh(true)
    })
    expect(mockSetAutoRefreshPaused).toHaveBeenCalledWith(false)
  })
})

describe('useDashboardState — drag state machine', () => {
  it('sets activeId and isDragging on handleDragStart', () => {
    const { result } = renderHook(() => useDashboardState())
    expect(result.current.activeId).toBeNull()
    expect(result.current.isDragging).toBe(false)

    act(() => {
      result.current.handleDragStart({
        active: { id: 'card-1', data: { current: { type: 'card' } } },
      } as Parameters<typeof result.current.handleDragStart>[0])
    })

    expect(result.current.activeId).toBe('card-1')
    expect(result.current.activeDragData).toEqual({ type: 'card' })
    expect(result.current.isDragging).toBe(true)
  })

  it('clears activeId and isDragging on handleDragCancel', () => {
    const { result } = renderHook(() => useDashboardState())

    act(() => {
      result.current.handleDragStart({
        active: { id: 'card-1', data: { current: null } },
      } as Parameters<typeof result.current.handleDragStart>[0])
    })
    expect(result.current.isDragging).toBe(true)

    act(() => {
      result.current.handleDragCancel()
    })
    expect(result.current.activeId).toBeNull()
    expect(result.current.isDragging).toBe(false)
  })

  it('clears drag state on handleDragEnd when over is null', async () => {
    const { result } = renderHook(() => useDashboardState())

    act(() => {
      result.current.handleDragStart({
        active: { id: 'card-1', data: { current: null } },
      } as Parameters<typeof result.current.handleDragStart>[0])
    })

    await act(async () => {
      await result.current.handleDragEnd({
        active: { id: 'card-1', data: { current: {} } },
        over: null,
      } as Parameters<typeof result.current.handleDragEnd>[0])
    })

    expect(result.current.activeId).toBeNull()
    expect(result.current.isDragging).toBe(false)
  })

  it('clears drag state after handleDragEnd for card-to-card reorder', async () => {
    const { result } = renderHook(() => useDashboardState())

    await act(async () => {
      await result.current.handleDragEnd({
        active: { id: 'card-1', data: { current: { type: 'card' } } },
        over: { id: 'card-2', data: { current: {} } },
      } as Parameters<typeof result.current.handleDragEnd>[0])
    })

    expect(result.current.activeId).toBeNull()
    expect(result.current.isDragging).toBe(false)
  })
})

describe('useDashboardState — isActiveDashboard detection', () => {
  it('treats pathname "/" as the active dashboard', () => {
    mockUseLocation.mockReturnValue({ pathname: '/' })
    renderHook(() => useDashboardState())
    expect(mockUseDashboardUndoRedo).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      true,
    )
  })

  it('treats other pathnames as NOT the active dashboard', () => {
    mockUseLocation.mockReturnValue({ pathname: '/clusters' })
    mockUseDashboardUndoRedo.mockClear()
    renderHook(() => useDashboardState())
    expect(mockUseDashboardUndoRedo).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      false,
    )
  })
})

describe('useDashboardState — undo/redo passthrough', () => {
  it('exposes undo, redo, canUndo, canRedo from useDashboardUndoRedo', () => {
    mockUseDashboardUndoRedo.mockReturnValue({
      snapshot: mockSnapshot,
      undo: mockUndo,
      redo: mockRedo,
      canUndo: true,
      canRedo: true,
    })
    const { result } = renderHook(() => useDashboardState())
    expect(result.current.canUndo).toBe(true)
    expect(result.current.canRedo).toBe(true)
    expect(result.current.undo).toBe(mockUndo)
    expect(result.current.redo).toBe(mockRedo)
  })
})

describe('useDashboardState — sensor/collision passthrough', () => {
  it('returns sensors from useDashboardSensors', () => {
    const fakeSensors = [{}]
    mockUseDashboardSensors.mockReturnValue(fakeSensors)
    const { result } = renderHook(() => useDashboardState())
    expect(result.current.sensors).toBe(fakeSensors)
  })
})

describe('useDashboardState — card grid navigation', () => {
  it('passes a stable onExpandCard callback to useCardGridNavigation across re-renders', () => {
    mockUseCardGridNavigation.mockClear()
    const { result } = renderHook(() => useDashboardState())
    const firstOnExpandCard = mockUseCardGridNavigation.mock.calls[0][0].onExpandCard
    act(() => {
      result.current.setAutoRefresh(false)
    })
    const lastCallIndex = mockUseCardGridNavigation.mock.calls.length - 1
    const secondOnExpandCard = mockUseCardGridNavigation.mock.calls[lastCallIndex][0].onExpandCard
    expect(secondOnExpandCard).toBe(firstOnExpandCard)
  })
})

describe('useDashboardState — insert-before/after', () => {
  it('handleInsertBefore stores the index and opens add-card modal', () => {
    const openAddCardModal = vi.fn()
    mockUseDashboardContext.mockReturnValue({
      isAddCardModalOpen: false,
      closeAddCardModal: vi.fn(),
      openAddCardModal,
      studioInitialSection: undefined,
      studioWidgetCardType: undefined,
      pendingOpenAddCardModal: null,
      setPendingOpenAddCardModal: vi.fn(),
      isTemplatesModalOpen: false,
      closeTemplatesModal: vi.fn(),
      openTemplatesModal: vi.fn(),
      pendingRestoreCard: null,
      clearPendingRestoreCard: vi.fn(),
    })
    const { result } = renderHook(() => useDashboardState())
    act(() => {
      result.current.handleInsertBefore(2)
    })
    expect(openAddCardModal).toHaveBeenCalled()
  })

  it('handleInsertAfter calls openAddCardModal', () => {
    const openAddCardModal = vi.fn()
    mockUseDashboardContext.mockReturnValue({
      isAddCardModalOpen: false,
      closeAddCardModal: vi.fn(),
      openAddCardModal,
      studioInitialSection: undefined,
      studioWidgetCardType: undefined,
      pendingOpenAddCardModal: null,
      setPendingOpenAddCardModal: vi.fn(),
      isTemplatesModalOpen: false,
      closeTemplatesModal: vi.fn(),
      openTemplatesModal: vi.fn(),
      pendingRestoreCard: null,
      clearPendingRestoreCard: vi.fn(),
    })
    const { result } = renderHook(() => useDashboardState())
    act(() => {
      result.current.handleInsertAfter(3)
    })
    expect(openAddCardModal).toHaveBeenCalled()
  })
})

describe('useDashboardState — nudge integration', () => {
  it('exposes activeNudge and dismissNudge from useContextualNudges', () => {
    const dismissNudge = vi.fn()
    mockUseContextualNudges.mockReturnValue({
      activeNudge: 'customize',
      showDragHint: true,
      dismissNudge,
      actionNudge: vi.fn(),
      recordVisit: vi.fn(),
    })
    const { result } = renderHook(() => useDashboardState())
    expect(result.current.activeNudge).toBe('customize')
    expect(result.current.showDragHint).toBe(true)
    expect(result.current.dismissNudge).toBe(dismissNudge)
  })

  it('handleNudgeAction calls openAddCardModal when activeNudge is customize', () => {
    const openAddCardModal = vi.fn()
    const actionNudge = vi.fn()
    mockUseContextualNudges.mockReturnValue({
      activeNudge: 'customize',
      showDragHint: false,
      dismissNudge: vi.fn(),
      actionNudge,
      recordVisit: vi.fn(),
    })
    mockUseDashboardContext.mockReturnValue({
      isAddCardModalOpen: false,
      closeAddCardModal: vi.fn(),
      openAddCardModal,
      studioInitialSection: undefined,
      studioWidgetCardType: undefined,
      pendingOpenAddCardModal: null,
      setPendingOpenAddCardModal: vi.fn(),
      isTemplatesModalOpen: false,
      closeTemplatesModal: vi.fn(),
      openTemplatesModal: vi.fn(),
      pendingRestoreCard: null,
      clearPendingRestoreCard: vi.fn(),
    })
    const { result } = renderHook(() => useDashboardState())
    act(() => {
      result.current.handleNudgeAction()
    })
    expect(openAddCardModal).toHaveBeenCalled()
    expect(actionNudge).toHaveBeenCalled()
  })
})

describe('useDashboardState — export dashboard', () => {
  it('handleExportDashboard is undefined when dashboard has no id', () => {
    const { result } = renderHook(() => useDashboardState())
    expect(result.current.handleExportDashboard).toBeUndefined()
  })
})

describe('useDashboardState — run health check', () => {
  it('handleRunHealthCheck calls startMission with the correct payload', () => {
    const startMission = vi.fn()
    mockUseMissions.mockReturnValue({
      openSidebar: vi.fn(),
      startMission,
    })
    const { result } = renderHook(() => useDashboardState())
    act(() => {
      result.current.handleRunHealthCheck()
    })
    expect(startMission).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining('Health'),
        type: 'custom',
        initialPrompt: expect.any(String),
      }),
    )
  })
})

describe('useDashboardState — close handlers', () => {
  it('handleCloseCustomizer calls closeAddCardModal', () => {
    const closeAddCardModal = vi.fn()
    mockUseDashboardContext.mockReturnValue({
      isAddCardModalOpen: true,
      closeAddCardModal,
      openAddCardModal: vi.fn(),
      studioInitialSection: undefined,
      studioWidgetCardType: undefined,
      pendingOpenAddCardModal: null,
      setPendingOpenAddCardModal: vi.fn(),
      isTemplatesModalOpen: false,
      closeTemplatesModal: vi.fn(),
      openTemplatesModal: vi.fn(),
      pendingRestoreCard: null,
      clearPendingRestoreCard: vi.fn(),
    })
    const { result } = renderHook(() => useDashboardState())
    act(() => {
      result.current.handleCloseCustomizer()
    })
    expect(closeAddCardModal).toHaveBeenCalled()
  })

  it('handleCloseConfigureCard clears selectedCard and calls close', () => {
    const mockClose = vi.fn()
    mockUseModalState.mockImplementation((idx: number) =>
      idx === 0
        ? { isOpen: true, open: vi.fn(), close: mockClose }
        : { isOpen: false, open: vi.fn(), close: vi.fn() },
    )
    const { result } = renderHook(() => useDashboardState())
    act(() => {
      result.current.handleCloseConfigureCard()
    })
    expect(mockClose).toHaveBeenCalled()
    expect(result.current.selectedCard).toBeNull()
  })
})

describe('useDashboardState — currentCardTypes', () => {
  it('returns empty array when localCards is empty', () => {
    const { result } = renderHook(() => useDashboardState())
    expect(result.current.currentCardTypes).toEqual([])
  })
})

describe('useDashboardState — cluster data passthrough', () => {
  it('exposes clusters and clustersError from useClusters', () => {
    const fakeError = new Error('network fail')
    mockUseClusters.mockReturnValue({
      deduplicatedClusters: [{ name: 'prod' }],
      isRefreshing: false,
      lastUpdated: null,
      refetch: vi.fn(),
      isLoading: false,
      error: fakeError,
    })
    const { result } = renderHook(() => useDashboardState())
    expect(result.current.clusters).toEqual([{ name: 'prod' }])
    expect(result.current.clustersError).toBe(fakeError)
  })

  it('isFetching is true when isClustersLoading is true', () => {
    mockUseClusters.mockReturnValue({
      deduplicatedClusters: [],
      isRefreshing: false,
      lastUpdated: null,
      refetch: vi.fn(),
      isLoading: true,
      error: null,
    })
    const { result } = renderHook(() => useDashboardState())
    expect(result.current.isFetching).toBe(true)
  })
})

describe('useDashboardState — open dashboard catalog', () => {
  it('handleOpenDashboardCatalog calls openAddCardModal with dashboards section', () => {
    const openAddCardModal = vi.fn()
    mockUseDashboardContext.mockReturnValue({
      isAddCardModalOpen: false,
      closeAddCardModal: vi.fn(),
      openAddCardModal,
      studioInitialSection: undefined,
      studioWidgetCardType: undefined,
      pendingOpenAddCardModal: null,
      setPendingOpenAddCardModal: vi.fn(),
      isTemplatesModalOpen: false,
      closeTemplatesModal: vi.fn(),
      openTemplatesModal: vi.fn(),
      pendingRestoreCard: null,
      clearPendingRestoreCard: vi.fn(),
    })
    const { result } = renderHook(() => useDashboardState())
    act(() => {
      result.current.handleOpenDashboardCatalog()
    })
    expect(openAddCardModal).toHaveBeenCalledWith('dashboards')
  })
})
