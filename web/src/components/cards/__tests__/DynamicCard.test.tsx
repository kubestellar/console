import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DynamicCard, Tier1CardRuntime, Tier2CardRuntime } from '../DynamicCard'
import type { DynamicCardDefinition, DynamicCardDefinition_T1 } from '../../../lib/dynamic-cards/types'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

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

vi.mock('../../../lib/constants', () => ({
  STORAGE_KEY_TOKEN: 'kc_token',
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))

// Stub UI components
vi.mock('../../ui/Skeleton', () => ({
  Skeleton: ({ variant }: { variant: string }) => <div data-testid={`skeleton-${variant}`} />,
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
      <button onClick={() => onPageChange(currentPage + 1)}>Next</button>
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
    vi.clearAllMocks()
    mockUseCardData.mockReturnValue(makeUseCardDataReturn())
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
    mockCompileCardCode.mockResolvedValue({ code: 'compiled', error: null })
    mockCreateCardComponent.mockReturnValue({
      component: () => <div>T2 rendered</div>,
      cleanup: mockCleanup,
      error: null,
    })
    await act(async () => {
      render(<DynamicCard config={{ dynamicCardId: 'card-t2', extra: true }} />)
    })
    await waitFor(() => expect(screen.getByText('T2 rendered')).toBeInTheDocument())
  })
})

// ---------------------------------------------------------------------------
// Tier1CardRuntime
// ---------------------------------------------------------------------------

describe('Tier1CardRuntime', () => {
  const definition = makeT1Definition()

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCardData.mockReturnValue(makeUseCardDataReturn())
  })

  describe('validation errors', () => {
    it('shows invalid-config when cardDefinition is null', () => {
      // @ts-expect-error intentional
      render(<Tier1CardRuntime definition={definition} cardDefinition={null} />)
      expect(screen.getByText('dynamicCard.invalidCardConfig')).toBeInTheDocument()
    })

    it('shows missing-endpoint error when dataSource=api and apiEndpoint is absent', () => {
      const def: DynamicCardDefinition_T1 = {
        ...BASE_T1_DEF,
        dataSource: 'api',
        apiEndpoint: undefined,
      }
      render(<Tier1CardRuntime definition={definition} cardDefinition={def} />)
      expect(screen.getByText('dynamicCard.missingEndpoint')).toBeInTheDocument()
    })
  })

  describe('static data rendering', () => {
    it('renders list rows from static data via useCardData', () => {
      mockUseCardData.mockReturnValue(
        makeUseCardDataReturn([{ name: 'Alpha' }, { name: 'Beta' }])
      )
      render(<Tier1CardRuntime definition={definition} cardDefinition={BASE_T1_DEF} />)
      expect(screen.getByText('Alpha')).toBeInTheDocument()
      expect(screen.getByText('Beta')).toBeInTheDocument()
    })

    it('renders column header labels', () => {
      mockUseCardData.mockReturnValue(makeUseCardDataReturn([{ name: 'x' }]))
      render(<Tier1CardRuntime definition={definition} cardDefinition={BASE_T1_DEF} />)
      expect(screen.getByText('Name')).toBeInTheDocument()
    })

    it('shows emptyMessage when items array is empty', () => {
      mockUseCardData.mockReturnValue(makeUseCardDataReturn([]))
      render(<Tier1CardRuntime definition={definition} cardDefinition={BASE_T1_DEF} />)
      expect(screen.getByText('Nothing here.')).toBeInTheDocument()
    })

    it('shows fallback empty text when emptyMessage is not set', () => {
      mockUseCardData.mockReturnValue(makeUseCardDataReturn([]))
      const def = { ...BASE_T1_DEF, emptyMessage: undefined }
      render(<Tier1CardRuntime definition={definition} cardDefinition={def} />)
      expect(screen.getByText('dynamicCard.noDataAvailable')).toBeInTheDocument()
    })
  })

  describe('search filter', () => {
    it('renders search input for list layout', () => {
      mockUseCardData.mockReturnValue(makeUseCardDataReturn([]))
      render(<Tier1CardRuntime definition={definition} cardDefinition={BASE_T1_DEF} />)
      expect(screen.getByRole('textbox')).toBeInTheDocument()
    })

    it('calls filters.setSearch when user types', async () => {
      const setSearch = vi.fn()
      mockUseCardData.mockReturnValue({
        ...makeUseCardDataReturn([]),
        filters: { search: '', setSearch },
      })
      render(<Tier1CardRuntime definition={definition} cardDefinition={BASE_T1_DEF} />)
      await userEvent.type(screen.getByRole('textbox'), 'abc')
      expect(setSearch).toHaveBeenCalled()
    })

    it('does NOT render search input for stats-only layout', () => {
      const def: DynamicCardDefinition_T1 = { ...BASE_T1_DEF, layout: 'stats', stats: [] }
      mockUseCardData.mockReturnValue(makeUseCardDataReturn([]))
      render(<Tier1CardRuntime definition={definition} cardDefinition={def} />)
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    })
  })

  describe('stats layout', () => {
    it('renders stat blocks for stats layout', () => {
      const def: DynamicCardDefinition_T1 = {
        ...BASE_T1_DEF,
        layout: 'stats',
        stats: [{ label: 'Total', value: 'count:', color: 'text-green-400' }],
      }
      mockUseCardData.mockReturnValue(makeUseCardDataReturn([{ name: 'X' }, { name: 'Y' }]))
      render(<Tier1CardRuntime definition={definition} cardDefinition={def} />)
      expect(screen.getByText('Total')).toBeInTheDocument()
      // count: resolves to data.length — but data here comes from static, so 2
      expect(screen.getByText('2')).toBeInTheDocument()
    })

    it('resolves field: value from first data row', () => {
      const def: DynamicCardDefinition_T1 = {
        ...BASE_T1_DEF,
        layout: 'stats',
        stats: [{ label: 'Version', value: 'field:version' }],
        staticData: [{ name: 'A', version: 'v1.2' }],
      }
      mockUseCardData.mockReturnValue(makeUseCardDataReturn([{ name: 'A', version: 'v1.2' }]))
      render(<Tier1CardRuntime definition={definition} cardDefinition={def} />)
      expect(screen.getByText('v1.2')).toBeInTheDocument()
    })

    it('renders both stats and list for stats-and-list layout', () => {
      const def: DynamicCardDefinition_T1 = {
        ...BASE_T1_DEF,
        layout: 'stats-and-list',
        stats: [{ label: 'Count', value: 'count:' }],
      }
      mockUseCardData.mockReturnValue(makeUseCardDataReturn([{ name: 'X' }]))
      render(<Tier1CardRuntime definition={definition} cardDefinition={def} />)
      expect(screen.getByText('Count')).toBeInTheDocument()
      expect(screen.getByText('X')).toBeInTheDocument()
    })
  })

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
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/things',
        expect.objectContaining({
          headers: { Authorization: 'Bearer test-token' },
        })
      )
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
  })
})

// ---------------------------------------------------------------------------
// Tier2CardRuntime
// ---------------------------------------------------------------------------

describe('Tier2CardRuntime', () => {
  const definition = makeT2Definition()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows compiling spinner initially', () => {
    // Never resolves — stays in compiling state
    mockCompileCardCode.mockReturnValue(new Promise(() => { }))
    render(<Tier2CardRuntime definition={definition} />)
    expect(screen.getByText('dynamicCard.compiling')).toBeInTheDocument()
  })

  it('renders compiled component on success', async () => {
    mockCompileCardCode.mockResolvedValue({ code: 'compiled', error: null })
    mockCreateCardComponent.mockReturnValue({
      component: () => <div>Tier2 Works</div>,
      cleanup: vi.fn(),
      error: null,
    })

    await act(async () => {
      render(<Tier2CardRuntime definition={definition} />)
    })
    await waitFor(() => expect(screen.getByText('Tier2 Works')).toBeInTheDocument())
  })

  it('shows compilation error returned by compileCardCode', async () => {
    mockCompileCardCode.mockResolvedValue({ code: null, error: 'Syntax error on line 3' })

    await act(async () => {
      render(<Tier2CardRuntime definition={definition} />)
    })
    await waitFor(() => expect(screen.getByText('dynamicCard.compilationError')).toBeInTheDocument())
    expect(screen.getByText('Syntax error on line 3')).toBeInTheDocument()
  })

  it('shows compilation error returned by createCardComponent', async () => {
    mockCompileCardCode.mockResolvedValue({ code: 'compiled', error: null })
    mockCreateCardComponent.mockReturnValue({
      component: null,
      cleanup: undefined,
      error: 'Module export missing',
    })

    await act(async () => {
      render(<Tier2CardRuntime definition={definition} />)
    })
    await waitFor(() => expect(screen.getByText('Module export missing')).toBeInTheDocument())
  })

  it('shows error when sourceCode is missing', async () => {
    const def = makeT2Definition({ sourceCode: undefined })

    await act(async () => {
      render(<Tier2CardRuntime definition={def} />)
    })
    await waitFor(() =>
      expect(screen.getByText(/No source code provided/i)).toBeInTheDocument()
    )
  })

  it('uses compiledCode cache and skips compileCardCode when available', async () => {
    const defWithCache = makeT2Definition({ compiledCode: 'cached-code' })
    mockCreateCardComponent.mockReturnValue({
      component: () => <div>Cached</div>,
      cleanup: vi.fn(),
      error: null,
    })

    await act(async () => {
      render(<Tier2CardRuntime definition={defWithCache} />)
    })
    await waitFor(() => expect(screen.getByText('Cached')).toBeInTheDocument())
    expect(mockCompileCardCode).not.toHaveBeenCalled()
  })

  it('shows no-component message when component is null after compile', async () => {
    mockCompileCardCode.mockResolvedValue({ code: 'compiled', error: null })
    mockCreateCardComponent.mockReturnValue({
      component: null,
      cleanup: undefined,
      error: null,
    })

    await act(async () => {
      render(<Tier2CardRuntime definition={definition} />)
    })
    await waitFor(() =>
      expect(screen.getByText('dynamicCard.noComponent')).toBeInTheDocument()
    )
  })

  it('calls cleanup on unmount', async () => {
    const cleanup = vi.fn()
    mockCompileCardCode.mockResolvedValue({ code: 'compiled', error: null })
    mockCreateCardComponent.mockReturnValue({
      component: () => <div>OK</div>,
      cleanup,
      error: null,
    })

    let unmount!: () => void
    await act(async () => {
      ; ({ unmount } = render(<Tier2CardRuntime definition={definition} />))
    })
    await waitFor(() => expect(screen.getByText('OK')).toBeInTheDocument())
    unmount()
    expect(cleanup).toHaveBeenCalledTimes(1)
  })

  it('handles unexpected thrown errors from compileCardCode', async () => {
    mockCompileCardCode.mockRejectedValue(new Error('Totally unexpected'))

    await act(async () => {
      render(<Tier2CardRuntime definition={definition} />)
    })
    await waitFor(() =>
      expect(screen.getByText(/Unexpected error: Totally unexpected/i)).toBeInTheDocument()
    )
  })

  it('passes config prop through to the compiled component', async () => {
    const ReceivedConfig = vi.fn(({ config }: { config: Record<string, unknown> }) => (
      <div data-testid="cfg">{JSON.stringify(config)}</div>
    ))
    mockCompileCardCode.mockResolvedValue({ code: 'compiled', error: null })
    mockCreateCardComponent.mockReturnValue({
      component: ReceivedConfig,
      cleanup: vi.fn(),
      error: null,
    })

    await act(async () => {
      render(<Tier2CardRuntime definition={definition} config={{ mode: 'dark', limit: 5 }} />)
    })
    await waitFor(() =>
      expect(screen.getByTestId('cfg').textContent).toContain('"mode":"dark"')
    )
  })

  it('passes empty config when config prop is undefined', async () => {
    const ReceivedConfig = vi.fn(({ config }: { config: Record<string, unknown> }) => (
      <div data-testid="cfg">{JSON.stringify(config)}</div>
    ))
    mockCompileCardCode.mockResolvedValue({ code: 'compiled', error: null })
    mockCreateCardComponent.mockReturnValue({
      component: ReceivedConfig,
      cleanup: vi.fn(),
      error: null,
    })

    await act(async () => {
      render(<Tier2CardRuntime definition={definition} config={undefined} />)
    })
    await waitFor(() =>
      expect(screen.getByTestId('cfg').textContent).toBe('{}')
    )
  })

  // =========================================================================
  // #5282 — Tier 2 Compile/Runtime Failure Paths
  // =========================================================================

  describe('Tier 2 compile/runtime failure paths (#5282)', () => {
    it('shows error when compileCardCode throws synchronously', async () => {
      mockCompileCardCode.mockRejectedValue(new TypeError('Cannot read property of undefined'))

      await act(async () => {
        render(<Tier2CardRuntime definition={definition} />)
      })
      await waitFor(() =>
        expect(screen.getByText(/Unexpected error/i)).toBeInTheDocument()
      )
      expect(screen.getByText(/Cannot read property of undefined/)).toBeInTheDocument()
    })

    it('shows error when compileCardCode returns both code and error', async () => {
      // Edge case: compile returns error (should take precedence)
      mockCompileCardCode.mockResolvedValue({ code: 'some-code', error: 'Parse error at line 1' })

      await act(async () => {
        render(<Tier2CardRuntime definition={definition} />)
      })
      await waitFor(() =>
        expect(screen.getByText('Parse error at line 1')).toBeInTheDocument()
      )
    })

    it('shows error when createCardComponent throws during execution', async () => {
      mockCompileCardCode.mockResolvedValue({ code: 'compiled', error: null })
      mockCreateCardComponent.mockImplementation(() => {
        throw new RangeError('Maximum call stack size exceeded')
      })

      await act(async () => {
        render(<Tier2CardRuntime definition={definition} />)
      })
      await waitFor(() =>
        expect(screen.getByText(/Unexpected error: Maximum call stack size exceeded/)).toBeInTheDocument()
      )
    })

    it('shows Compilation Error heading with error detail from compileCardCode', async () => {
      mockCompileCardCode.mockResolvedValue({
        code: null,
        error: 'Compilation error: Unexpected token at line 42',
      })

      await act(async () => {
        render(<Tier2CardRuntime definition={definition} />)
      })
      // The heading "Compilation Error" and the detail message are both rendered
      await waitFor(() =>
        expect(screen.getByText(/Unexpected token at line 42/)).toBeInTheDocument()
      )
    })

    it('handles non-Error thrown values from compileCardCode', async () => {
      // Throw a string instead of an Error instance
      mockCompileCardCode.mockRejectedValue('string error thrown')

      await act(async () => {
        render(<Tier2CardRuntime definition={definition} />)
      })
      await waitFor(() =>
        expect(screen.getByText(/Unexpected error: string error thrown/)).toBeInTheDocument()
      )
    })

    it('renders "No component produced" when component is null and error is null', async () => {
      mockCompileCardCode.mockResolvedValue({ code: 'compiled', error: null })
      mockCreateCardComponent.mockReturnValue({
        component: null,
        cleanup: undefined,
        error: null,
      })

      await act(async () => {
        render(<Tier2CardRuntime definition={definition} />)
      })
      await waitFor(() =>
        expect(screen.getByText('dynamicCard.noComponent')).toBeInTheDocument()
      )
    })

    it('does not call compileCardCode when definition has compiledCode but createCardComponent fails', async () => {
      const defWithCache = makeT2Definition({ compiledCode: 'pre-compiled' })
      mockCreateCardComponent.mockReturnValue({
        component: null,
        cleanup: undefined,
        error: 'Invalid module.exports: not a function',
      })

      await act(async () => {
        render(<Tier2CardRuntime definition={defWithCache} />)
      })
      await waitFor(() =>
        expect(screen.getByText('Invalid module.exports: not a function')).toBeInTheDocument()
      )
      expect(mockCompileCardCode).not.toHaveBeenCalled()
    })

    it('cleans up even when compilation fails', async () => {
      const cleanup = vi.fn()
      mockCompileCardCode.mockResolvedValue({ code: 'compiled', error: null })
      mockCreateCardComponent.mockReturnValue({
        component: () => <div>OK</div>,
        cleanup,
        error: null,
      })

      let unmount!: () => void
      await act(async () => {
        ;({ unmount } = render(<Tier2CardRuntime definition={definition} />))
      })
      await waitFor(() => expect(screen.getByText('OK')).toBeInTheDocument())

      // Replace with a failing definition to trigger recompile
      unmount()
      expect(cleanup).toHaveBeenCalledTimes(1)
    })
  })
})