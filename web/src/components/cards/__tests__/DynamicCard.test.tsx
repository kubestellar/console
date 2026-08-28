import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import { DynamicCard } from '../DynamicCard'
import type { DynamicCardDefinition, DynamicCardDefinition_T1 } from '../../../lib/dynamic-cards/types'
import { BTN } from '../../../test-utils/buttonLabels'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock useCache to avoid shared CacheStore state between tests.
// This provides a minimal implementation that calls the fetcher immediately.
vi.mock('../../../lib/cache', () => {
  const React = require('react')
  return {
    useCache: ({ fetcher, initialData, enabled = true }: { fetcher: () => Promise<unknown>; initialData: unknown; enabled?: boolean; [k: string]: unknown }) => {
      const [data, setData] = React.useState(initialData)
      const [isLoading, setIsLoading] = React.useState(enabled)
      const [isFailed, setIsFailed] = React.useState(false)
      const [error, setError] = React.useState<string | null>(null)
      const fetcherRef = React.useRef(fetcher)
      fetcherRef.current = fetcher
      React.useEffect(() => {
        if (!enabled) { setIsLoading(false); return }
        let cancelled = false
        fetcherRef.current().then((result: unknown) => {
          if (!cancelled) { setData(result); setIsLoading(false) }
        }).catch((err: Error) => {
          if (!cancelled) { setIsFailed(true); setError(err.message); setIsLoading(false) }
        })
        return () => { cancelled = true }
      }, [enabled])
      return { data, isLoading, isFailed, isDemoFallback: false, error, consecutiveFailures: 0, refetch: async () => {} }
    },
  }
})

const mockGetDynamicCard = vi.fn()
vi.mock('../../../hooks/mcp/shared', () => ({
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
  clusterCacheRef: { clusters: [] },
  REFRESH_INTERVAL_MS: 120_000,
  CLUSTER_POLL_INTERVAL_MS: 60_000,
}))

vi.mock('../../../lib/dynamic-cards/dynamicCardRegistry', () => ({
  getDynamicCard: (...args: unknown[]) => mockGetDynamicCard(...args),
}))

const mockCompileCardCode = vi.fn()
const mockCreateCardComponent = vi.fn()
vi.mock('../../../lib/dynamic-cards/compiler', () => ({
  compileCardCode: (...args: unknown[]) => mockCompileCardCode(...args),
  createCardComponent: (...args: unknown[]) => mockCreateCardComponent(...args),
}))

vi.mock('../../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/constants')>()
  return { ...actual, STORAGE_KEY_TOKEN: 'kc_token' }
})

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (k: string) => k }),
}))

// Stub UI components
vi.mock('../../ui/Skeleton', () => ({
  Skeleton: ({ variant }: { variant: string }) => <div data-testid={`skeleton-${variant}`} />,
  SkeletonCardWithRefresh: () => <div data-testid="skeleton-card-with-refresh" />,
}))

vi.mock('../../ui/Pagination', () => ({
  Pagination: ({
    currentPage,
    totalPages,
    onPageChange,
  }: {
    currentPage: number
    totalPages: number
    onPageChange: (p: number) => void
  }) => (
    <div data-testid="pagination">
      <span>Page {currentPage} of {totalPages}</span>
      <button onClick={() => onPageChange(currentPage + 1)}>{BTN.next}</button>
    </div>
  ),
}))

vi.mock('../DynamicCardErrorBoundary', () => ({
  DynamicCardErrorBoundary: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="error-boundary">{children}</div>
  ),
}))

const mockShouldUseDemoData = vi.fn(() => false)
vi.mock('../CardDataContext', () => ({
  useCardDemoState: () => ({ shouldUseDemoData: mockShouldUseDemoData() }),
  useReportCardDataState: vi.fn(),
}))

// useCardData: returns a pass-through by default, overrideable per test
const mockUseCardData = vi.fn()
vi.mock('../../../lib/cards/cardHooks', () => ({
  useCardData: (...args: unknown[]) => mockUseCardData(...args),
}))

// ---------------------------------------------------------------------------
// Default useCardData return value
// ---------------------------------------------------------------------------

function makeUseCardDataReturn(items: Record<string, unknown>[] = []) {
  return {
    items,
    totalItems: items.length,
    currentPage: 1,
    totalPages: 1,
    goToPage: vi.fn(),
    needsPagination: false,
    itemsPerPage: 10,
    filters: { search: '', setSearch: vi.fn() },
    containerRef: { current: null },
    containerStyle: {},
  }
}

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const BASE_T1_DEF: DynamicCardDefinition_T1 = {
  layout: 'list',
  columns: [{ field: 'name', label: 'Name' }],
  dataSource: 'static',
  staticData: [{ name: 'Alpha' }, { name: 'Beta' }],
  searchFields: ['name'],
  defaultLimit: 5,
  emptyMessage: 'Nothing here.',
}

function makeT1Definition(overrides: Partial<DynamicCardDefinition> = {}): DynamicCardDefinition {
  return {
    id: 'card-t1',
    tier: 'tier1',
    cardDefinition: BASE_T1_DEF,
    ...overrides,
  } as DynamicCardDefinition
}

function makeT2Definition(overrides: Partial<DynamicCardDefinition> = {}): DynamicCardDefinition {
  return {
    id: 'card-t2',
    tier: 'tier2',
    sourceCode: 'export default function MyCard() { return <div>T2 Card</div> }',
    ...overrides,
  } as DynamicCardDefinition
}

// ---------------------------------------------------------------------------
// DynamicCard (top-level)
// ---------------------------------------------------------------------------

describe('DynamicCard', () => {
  beforeEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    mockUseCardData.mockReturnValue(makeUseCardDataReturn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows missing-config error when config is undefined', () => {
    // @ts-expect-error intentional
    render(<DynamicCard config={undefined} />)
    expect(screen.getByText('dynamicCard.missingConfig')).toBeInTheDocument()
  })

  it('shows missing-config error when dynamicCardId is empty string', () => {
    render(<DynamicCard config={{ dynamicCardId: '' }} />)
    expect(screen.getByText('dynamicCard.missingConfig')).toBeInTheDocument()
  })

  it('shows not-found error when getDynamicCard returns undefined', () => {
    mockGetDynamicCard.mockReturnValue(undefined)
    render(<DynamicCard config={{ dynamicCardId: 'ghost-card' }} />)
    expect(screen.getByText('dynamicCard.notFound')).toBeInTheDocument()
  })

  it('renders Tier1CardRuntime inside error boundary for tier1 definition', () => {
    mockGetDynamicCard.mockReturnValue(makeT1Definition())
    mockUseCardData.mockReturnValue(makeUseCardDataReturn([{ name: 'Alpha' }]))
    render(<DynamicCard config={{ dynamicCardId: 'card-t1' }} />)
    expect(screen.getByTestId('error-boundary')).toBeInTheDocument()
  })

  it('shows invalid-definition error when tier1 card has no cardDefinition', () => {
    mockGetDynamicCard.mockReturnValue(makeT1Definition({ cardDefinition: undefined }))
    render(<DynamicCard config={{ dynamicCardId: 'card-t1' }} />)
    expect(screen.getByText('dynamicCard.invalidDefinition')).toBeInTheDocument()
  })

  it('shows invalid-definition error when tier2 card has no sourceCode', () => {
    mockGetDynamicCard.mockReturnValue(makeT2Definition({ sourceCode: undefined }))
    render(<DynamicCard config={{ dynamicCardId: 'card-t2' }} />)
    expect(screen.getByText('dynamicCard.invalidDefinition')).toBeInTheDocument()
  })

  it('passes safeConfig to Tier2CardRuntime', async () => {
    mockGetDynamicCard.mockReturnValue(makeT2Definition())
    const mockCleanup = vi.fn()
    mockCompileCardCode.mockResolvedValue({ code: 'compiled', error: false })
    mockCreateCardComponent.mockResolvedValue({
      component: () => <div>T2 rendered</div>,
      cleanup: mockCleanup,
      error: false,
    })
    await act(async () => {
      render(<DynamicCard config={{ dynamicCardId: 'card-t2', extra: true }} />)
    })
    await waitFor(() => expect(screen.getByText('T2 rendered')).toBeInTheDocument())
  })
})
