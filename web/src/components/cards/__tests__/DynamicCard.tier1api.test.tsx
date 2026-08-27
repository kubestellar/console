import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DynamicCard, Tier1CardRuntime, Tier2CardRuntime } from '../DynamicCard'
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

describe('Tier1CardRuntime', () => {
  const definition = makeT1Definition()

  describe('badge column format', () => {
    it('renders badge span with correct color class', () => {
      const def: DynamicCardDefinition_T1 = {
        ...BASE_T1_DEF,
        columns: [
          {
            field: 'status',
            label: 'Status',
            format: 'badge',
            badgeColors: { Healthy: 'bg-green-500/20 text-green-300' },
          },
        ],
        staticData: [{ status: 'Healthy' }],
      }
      mockUseCardData.mockReturnValue(makeUseCardDataReturn([{ status: 'Healthy' }]))
      render(<Tier1CardRuntime definition={definition} cardDefinition={def} />)
      const badge = screen.getByText('Healthy')
      expect(badge.className).toContain('bg-green-500/20')
    })

    it('uses a shared grid with compact badge columns so rows stay aligned after resize', () => {
      const def: DynamicCardDefinition_T1 = {
        ...BASE_T1_DEF,
        columns: [
          { field: 'name', label: 'Name' },
          {
            field: 'status',
            label: 'Status',
            format: 'badge',
            badgeColors: { Healthy: 'bg-green-500/20 text-green-300' },
          },
        ],
        staticData: [{ name: 'Alpha', status: 'Healthy' }],
      }
      mockUseCardData.mockReturnValue(makeUseCardDataReturn([{ name: 'Alpha', status: 'Healthy' }]))

      render(<Tier1CardRuntime definition={definition} cardDefinition={def} />)

      const listGrid = screen.getByTestId('dynamic-card-list-grid')
      expect(listGrid).toHaveStyle({ gridTemplateColumns: 'minmax(0, 1fr) fit-content(8rem)' })
      expect(screen.getAllByTestId('dynamic-card-data-row')).toHaveLength(2)
      expect(screen.getByText('Healthy').className).not.toContain('shrink-0')
    })
  })

  describe('pagination', () => {
    it('renders Pagination when needsPagination=true', () => {
      mockUseCardData.mockReturnValue({
        ...makeUseCardDataReturn([{ name: 'A' }]),
        needsPagination: true,
        totalPages: 3,
        currentPage: 1,
      })
      render(<Tier1CardRuntime definition={definition} cardDefinition={BASE_T1_DEF} />)
      expect(screen.getByTestId('pagination')).toBeInTheDocument()
    })

    it('does NOT render Pagination when needsPagination=false', () => {
      mockUseCardData.mockReturnValue(makeUseCardDataReturn([{ name: 'A' }]))
      render(<Tier1CardRuntime definition={definition} cardDefinition={BASE_T1_DEF} />)
      expect(screen.queryByTestId('pagination')).not.toBeInTheDocument()
    })
  })

  describe('API data fetching', () => {
    beforeEach(() => {
      vi.spyOn(localStorage, 'getItem').mockReturnValue('test-token')
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('shows skeleton while fetching', async () => {
      let resolveFetch!: (v: Response) => void
      global.fetch = vi.fn(
        () => new Promise<Response>((r) => { resolveFetch = r })
      ) as unknown as typeof fetch

      const def: DynamicCardDefinition_T1 = {
        ...BASE_T1_DEF,
        dataSource: 'api',
        apiEndpoint: '/api/things',
      }
      render(<Tier1CardRuntime definition={definition} cardDefinition={def} />)
      expect(screen.getByTestId('skeleton-text')).toBeInTheDocument()
      await waitFor(() => expect(global.fetch).toHaveBeenCalled())

      // Cleanup
      await act(async () => {
        resolveFetch(new Response(JSON.stringify([]), { status: 200 }))
      })
    })

    it('shows error state on non-ok HTTP response', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response('', { status: 500 })
      ) as unknown as typeof fetch

      const def: DynamicCardDefinition_T1 = {
        ...BASE_T1_DEF,
        dataSource: 'api',
        apiEndpoint: '/api/things',
      }
      await act(async () => {
        render(<Tier1CardRuntime definition={definition} cardDefinition={def} />)
      })
      await waitFor(() =>
        expect(screen.getByText('dynamicCard.fetchFailed')).toBeInTheDocument()
      )
    })

    it('shows error message from fetch rejection', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network down')) as unknown as typeof fetch

      const def: DynamicCardDefinition_T1 = {
        ...BASE_T1_DEF,
        dataSource: 'api',
        apiEndpoint: '/api/things',
      }
      await act(async () => {
        render(<Tier1CardRuntime definition={definition} cardDefinition={def} />)
      })
      await waitFor(() =>
        expect(screen.getByText('Network down')).toBeInTheDocument()
      )
    })

    it('sends Authorization header when token exists', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify([{ name: 'X' }]), { status: 200 })
      ) as unknown as typeof fetch

      const def: DynamicCardDefinition_T1 = {
        ...BASE_T1_DEF,
        dataSource: 'api',
        apiEndpoint: '/api/things',
      }
      await act(async () => {
        render(<Tier1CardRuntime definition={definition} cardDefinition={def} />)
      })
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/things',
          expect.objectContaining({
            headers: { Authorization: 'Bearer test-token' },
          })
        )
      })
    })

    it('sends no Authorization header when token is absent', async () => {
      vi.spyOn(localStorage, 'getItem').mockReturnValue(null)
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify([]), { status: 200 })
      ) as unknown as typeof fetch

      const def: DynamicCardDefinition_T1 = {
        ...BASE_T1_DEF,
        dataSource: 'api',
        apiEndpoint: '/api/things',
      }
      await act(async () => {
        render(<Tier1CardRuntime definition={definition} cardDefinition={def} />)
      })
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/things',
        expect.objectContaining({ headers: {} })
      )
    })

    it('normalises non-array JSON response via items key', async () => {
      const payload = { items: [{ name: 'FromItems' }] }
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(payload), { status: 200 })
      ) as unknown as typeof fetch
      mockUseCardData.mockImplementation((data: unknown[]) =>
        makeUseCardDataReturn(data as Record<string, unknown>[])
      )

      const def: DynamicCardDefinition_T1 = {
        ...BASE_T1_DEF,
        dataSource: 'api',
        apiEndpoint: '/api/things',
      }
      await act(async () => {
        render(<Tier1CardRuntime definition={definition} cardDefinition={def} />)
      })
      await waitFor(() => {
        const callArgs = mockUseCardData.mock.calls.at(-1)?.[0]
        expect(callArgs).toEqual([{ name: 'FromItems' }])
      })
    })

    it('allows same-origin absolute apiEndpoint URLs', async () => {
      const sameOriginEndpoint = `${window.location.origin}/api/things`
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify([{ name: 'Allowed' }]), { status: 200 })
      ) as unknown as typeof fetch

      const def: DynamicCardDefinition_T1 = {
        ...BASE_T1_DEF,
        dataSource: 'api',
        apiEndpoint: sameOriginEndpoint,
      }

      await act(async () => {
        render(<Tier1CardRuntime definition={definition} cardDefinition={def} />)
      })

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          sameOriginEndpoint,
          expect.objectContaining({
            headers: { Authorization: 'Bearer test-token' },
          }),
        )
      })
    })

    it.each([
      ['external https URL', 'https://evil.com/steal'],
      ['protocol-relative URL', '//evil.com/steal'],
      ['javascript URL', 'javascript:alert(1)'],
      ['data URL', 'data:text/plain,steal'],
    ])('blocks %s from being fetched', async (_label, apiEndpoint) => {
      global.fetch = vi.fn() as unknown as typeof fetch

      const def: DynamicCardDefinition_T1 = {
        ...BASE_T1_DEF,
        dataSource: 'api',
        apiEndpoint,
        emptyMessage: 'Blocked endpoint',
      }

      await act(async () => {
        render(<Tier1CardRuntime definition={definition} cardDefinition={def} />)
      })

      await waitFor(() => {
        expect(global.fetch).not.toHaveBeenCalled()
      })
      expect(screen.getByText('Blocked endpoint')).toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// Tier2CardRuntime
// ---------------------------------------------------------------------------

})
