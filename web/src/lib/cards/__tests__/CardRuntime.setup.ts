import { vi, beforeEach } from 'vitest'
import type { CardDefinition } from '../types'

type SkeletonProps = {
  height?: number | string
  width?: number | string
  variant?: string
  className?: string
}

type PaginationProps = {
  currentPage?: number
  totalPages?: number
}

type RefreshButtonProps = {
  onRefresh?: () => void
  isRefreshing?: boolean
}

type ClusterBadgeProps = {
  cluster?: string
}

// ---------------------------------------------------------------------------
// Mocks — must be defined before importing the module under test
// ---------------------------------------------------------------------------

// Mock useCardType to avoid requiring CardWrapper context
vi.mock('../../../components/cards/CardWrapper', () => ({
  useCardType: () => 'test-card',
}))

// Mock analytics
vi.mock('../../analytics', () => ({
  emitCardSearchUsed: vi.fn(),
  emitCardClusterFilterChanged: vi.fn(),
  emitCardListItemClicked: vi.fn(),
  emitCardPaginationUsed: vi.fn(),
}))

// Mock useMissions
vi.mock('../../../hooks/useMissions', () => ({
  useMissions: () => ({ startMission: vi.fn() }),
}))

// Mock useApiKeyCheck
vi.mock('../../../components/cards/console-missions/shared', () => ({
  useApiKeyCheck: () => ({
    showKeyPrompt: false,
    checkKeyAndRun: (fn: () => void) => fn(),
    goToSettings: vi.fn(),
    dismissPrompt: vi.fn(),
  }),
  ApiKeyPromptModal: () => null,
}))

// Mock ClusterStatusBadge
vi.mock('../../../components/ui/ClusterStatusBadge', () => ({
  ClusterStatusDot: ({ state }: { state: string }) => 
    ({ default: `<span data-testid="status-dot">${state}</span>` }),
  getClusterState: () => 'healthy',
}))

// Mock Skeleton
vi.mock('../../../components/ui/Skeleton', () => ({
  Skeleton: ({ height, width, variant, className }: SkeletonProps) =>
    ({ default: `<div data-testid="skeleton" data-variant=${variant} data-height=${height} data-width=${width} className=${className} />` }),
  SkeletonCardWithRefresh: () => ({ default: `<div data-testid="skeleton-card-with-refresh" />` }),
}))

// Mock Pagination
vi.mock('../../../components/ui/Pagination', () => ({
  Pagination: ({ currentPage, totalPages }: PaginationProps) =>
    ({ default: `<div data-testid="pagination" data-current=${currentPage} data-total=${totalPages} />` }),
}))

// Mock CardControls
vi.mock('../../../components/ui/CardControls', () => ({
  CardControls: () => ({ default: `<div data-testid="card-controls" />` }),
}))

// Mock RefreshIndicator
vi.mock('../../../components/ui/RefreshIndicator', () => ({
  RefreshButton: ({ onRefresh, isRefreshing }: RefreshButtonProps) =>
    ({ default: `<button data-testid="refresh-btn" data-refreshing=${isRefreshing} onClick=${onRefresh}>Refresh</button>` }),
}))

// Mock ClusterBadge
vi.mock('../../../components/ui/ClusterBadge', () => ({
  ClusterBadge: ({ cluster }: ClusterBadgeProps) =>
    ({ default: `<span data-testid="cluster-badge">${cluster}</span>` }),
}))

// Mock icons module
vi.mock('../../icons', () => ({
  getIcon: (name: string) => {
    return () => ({ default: `<span data-testid="icon-${name}">${name}</span>` })
  },
}))

// Create a controllable mock for useCardData
const mockGoToPage = vi.fn()
const mockSetItemsPerPage = vi.fn()
const mockSetSearch = vi.fn()
const mockToggleClusterFilter = vi.fn()
const mockClearClusterFilter = vi.fn()
const mockSetShowClusterFilter = vi.fn()
const mockSetSortBy = vi.fn()
const mockSetSortDirection = vi.fn()
const mockClusterFilterRef = { current: null }

export function makeCardDataResult(overrides: Record<string, unknown> = {}) {
  return {
    items: [],
    totalItems: 0,
    currentPage: 1,
    totalPages: 1,
    itemsPerPage: 5,
    goToPage: mockGoToPage,
    needsPagination: false,
    setItemsPerPage: mockSetItemsPerPage,
    containerRef: { current: null },
    containerStyle: undefined,
    filters: {
      search: '',
      setSearch: mockSetSearch,
      localClusterFilter: [],
      toggleClusterFilter: mockToggleClusterFilter,
      clearClusterFilter: mockClearClusterFilter,
      availableClusters: [],
      showClusterFilter: false,
      setShowClusterFilter: mockSetShowClusterFilter,
      clusterFilterRef: mockClusterFilterRef,
    },
    sorting: {
      sortBy: 'name',
      setSortBy: mockSetSortBy,
      sortDirection: 'asc' as const,
      setSortDirection: mockSetSortDirection,
    },
    ...overrides,
  }
}

let mockCardDataResult = makeCardDataResult()

vi.mock('../cardHooks', () => ({
  useCardData: () => mockCardDataResult,
}))

// ---------------------------------------------------------------------------
// Import the module under test AFTER mocks are set up
// ---------------------------------------------------------------------------

const {
  CardRuntime,
  registerDataHook: registerRuntimeDataHook,
  registerDrillAction,
  registerRenderer,
  registerCard,
  getCardDefinition,
  getAllCardDefinitions,
  parseCardYAML,
} = await import('../CardRuntime')

export {
  CardRuntime,
  registerRuntimeDataHook as registerDataHook,
  registerDrillAction,
  registerRenderer,
  registerCard,
  getCardDefinition,
  getAllCardDefinitions,
  parseCardYAML,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function makeDefinition(overrides: Partial<CardDefinition> = {}): CardDefinition {
  return {
    type: 'test_card',
    title: 'Test Card',
    category: 'workloads',
    visualization: 'status',
    dataSource: { hook: 'useTestData' },
    ...overrides,
  }
}

export function registerFakeHook(
  name: string,
  result: {
    data?: unknown[]
    isLoading?: boolean
    isRefreshing?: boolean
    error?: string
    isFailed?: boolean
    consecutiveFailures?: number
    lastRefresh?: Date
  } = {},
) {
  const hook = () => ({
    data: result.data ?? [],
    isLoading: result.isLoading ?? false,
    isRefreshing: result.isRefreshing ?? false,
    error: result.error,
    refetch: vi.fn(),
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
  })
  registerRuntimeDataHook(name, hook)
  return hook
}

export function setMockCardDataResult(value: ReturnType<typeof makeCardDataResult>) {
  mockCardDataResult = value
}

export function getMockCardDataResult() {
  return mockCardDataResult
}

beforeEach(() => {
  vi.clearAllMocks()
  mockCardDataResult = makeCardDataResult()
})
