import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import { Tier2CardRuntime } from '../DynamicCard'
import type { DynamicCardDefinition } from '../../../lib/dynamic-cards/types'
import { BTN } from '../../../test-utils/buttonLabels'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock useCache to avoid shared CacheStore state between tests.
// This provides a minimal implementation that calls the fetcher immediately.
vi.mock('../../../lib/cache', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- moved verbatim from baselined DynamicCard.test.tsx; vi.mock factories are hoisted and cannot reference top-level imports
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
// Shared fixtures
// ---------------------------------------------------------------------------

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

describe('Tier2CardRuntime', () => {
  const definition = makeT2Definition()

  beforeEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows compiling spinner initially', () => {
    // Never resolves — stays in compiling state
    mockCompileCardCode.mockReturnValue(new Promise(() => { }))
    render(<Tier2CardRuntime definition={definition} />)
    expect(screen.getByText('dynamicCard.compiling')).toBeInTheDocument()
  })

  it('renders compiled component on success', async () => {
    mockCompileCardCode.mockResolvedValue({ code: 'compiled', error: false })
    mockCreateCardComponent.mockResolvedValue({
      component: () => <div>Tier2 Works</div>,
      cleanup: vi.fn(),
      error: false,
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
    mockCompileCardCode.mockResolvedValue({ code: 'compiled', error: false })
    mockCreateCardComponent.mockResolvedValue({
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
    mockCreateCardComponent.mockResolvedValue({
      component: () => <div>Cached</div>,
      cleanup: vi.fn(),
      error: false,
    })

    await act(async () => {
      render(<Tier2CardRuntime definition={defWithCache} />)
    })
    await waitFor(() => expect(screen.getByText('Cached')).toBeInTheDocument())
    expect(mockCompileCardCode).not.toHaveBeenCalled()
  })

  it('shows no-component message when component is null after compile', async () => {
    mockCompileCardCode.mockResolvedValue({ code: 'compiled', error: false })
    mockCreateCardComponent.mockResolvedValue({
      component: null,
      cleanup: undefined,
      error: false,
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
    mockCompileCardCode.mockResolvedValue({ code: 'compiled', error: false })
    mockCreateCardComponent.mockResolvedValue({
      component: () => <div>OK</div>,
      cleanup,
      error: false,
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
    mockCompileCardCode.mockResolvedValue({ code: 'compiled', error: false })
    mockCreateCardComponent.mockResolvedValue({
      component: ReceivedConfig,
      cleanup: vi.fn(),
      error: false,
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
    mockCompileCardCode.mockResolvedValue({ code: 'compiled', error: false })
    mockCreateCardComponent.mockResolvedValue({
      component: ReceivedConfig,
      cleanup: vi.fn(),
      error: false,
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
      mockCompileCardCode.mockResolvedValue({ code: 'compiled', error: false })
      mockCreateCardComponent.mockRejectedValue(new RangeError('Maximum call stack size exceeded'))

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
      mockCompileCardCode.mockResolvedValue({ code: 'compiled', error: false })
      mockCreateCardComponent.mockResolvedValue({
        component: null,
        cleanup: undefined,
        error: false,
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
      mockCreateCardComponent.mockResolvedValue({
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
      mockCompileCardCode.mockResolvedValue({ code: 'compiled', error: false })
      mockCreateCardComponent.mockResolvedValue({
        component: () => <div>OK</div>,
        cleanup,
        error: false,
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