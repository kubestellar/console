/**
 * Tests for UnifiedDemo (UnifiedDemoProvider + useUnifiedData)
 *
 * Mocks external dependencies and tests:
 * - Provider renders children
 * - Demo mode context values
 * - Mode switching triggers skeleton state
 * - useUnifiedData returns live/demo data correctly
 * - Skeleton state during mode transition
 * - refetch triggers regeneration
 * - forceSkeleton and skipDemo options
 * - Error passthrough
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { UnifiedDemoProvider, useUnifiedData } from '../UnifiedDemo'
import { useUnifiedDemoContext } from '../UnifiedDemoContext'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockToggleDemoMode = vi.fn()
const mockSetDemoMode = vi.fn()
let mockIsDemoMode = false

vi.mock('../../../../hooks/useDemoMode', () => ({
  useDemoMode: () => ({
    isDemoMode: mockIsDemoMode,
    toggleDemoMode: mockToggleDemoMode,
    setDemoMode: mockSetDemoMode,
  }),
  isDemoModeForced: false,
}))

vi.mock('../demoDataRegistry', () => ({
  registerDemoData: vi.fn(),
  generateDemoDataSync: vi.fn((_id: string) => ({
    data: { demo: true },
    isLoading: false,
    isDemoData: true as const,
  })),
  clearDemoDataCache: vi.fn(),
}))

vi.mock('../../../modeTransition', () => ({
  triggerAllRefetches: vi.fn(),
  incrementModeTransitionVersion: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Renders a consumer that displays context values */
function ContextConsumer() {
  const ctx = useUnifiedDemoContext()
  return (
    <div>
      <span data-testid="is-demo">{String(ctx.isDemoMode)}</span>
      <span data-testid="is-switching">{String(ctx.isModeSwitching)}</span>
      <span data-testid="mode-version">{ctx.modeVersion}</span>
      <button data-testid="toggle" onClick={ctx.toggleDemoMode}>Toggle</button>
      <button data-testid="regen-all" onClick={ctx.regenerateAll}>RegenAll</button>
      <button data-testid="regen" onClick={() => ctx.regenerate('test-id')}>Regen</button>
    </div>
  )
}

/** Renders a component using useUnifiedData */
function DataConsumer({
  liveData,
  isLiveLoading,
  options = {},
}: {
  liveData: unknown
  isLiveLoading: boolean
  options?: Parameters<typeof useUnifiedData>[3]
}) {
  const result = useUnifiedData('test-component', liveData, isLiveLoading, options)
  return (
    <div>
      <span data-testid="data">{JSON.stringify(result.data)}</span>
      <span data-testid="is-loading">{String(result.isLoading)}</span>
      <span data-testid="show-skeleton">{String(result.showSkeleton)}</span>
      <span data-testid="is-demo-data">{String(result.isDemoData)}</span>
      <span data-testid="error">{result.error?.message ?? 'none'}</span>
      <button data-testid="refetch" onClick={result.refetch}>Refetch</button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('UnifiedDemoProvider', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockIsDemoMode = false
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders children', () => {
    render(
      <UnifiedDemoProvider>
        <div data-testid="child">Hello</div>
      </UnifiedDemoProvider>,
    )
    expect(screen.getByTestId('child')).toHaveTextContent('Hello')
  })

  it('provides demo mode context values', () => {
    render(
      <UnifiedDemoProvider>
        <ContextConsumer />
      </UnifiedDemoProvider>,
    )
    expect(screen.getByTestId('is-demo')).toHaveTextContent('false')
    expect(screen.getByTestId('is-switching')).toHaveTextContent('false')
    expect(screen.getByTestId('mode-version')).toHaveTextContent('0')
  })

  it('triggers initial refetch after mount delay', async () => {
    const { triggerAllRefetches } = await import('../../../modeTransition')

    render(
      <UnifiedDemoProvider>
        <div>mounted</div>
      </UnifiedDemoProvider>,
    )

    // Advance past the 100ms initial load delay
    act(() => {
      vi.advanceTimersByTime(150)
    })

    expect(triggerAllRefetches).toHaveBeenCalled()
  })

  it('exposes toggleDemoMode from context', () => {
    render(
      <UnifiedDemoProvider>
        <ContextConsumer />
      </UnifiedDemoProvider>,
    )

    act(() => {
      screen.getByTestId('toggle').click()
    })

    expect(mockToggleDemoMode).toHaveBeenCalled()
  })
})

describe('useUnifiedData', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockIsDemoMode = false
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns live data when not in demo mode', () => {
    const liveData = { live: true }
    render(
      <UnifiedDemoProvider>
        <DataConsumer liveData={liveData} isLiveLoading={false} />
      </UnifiedDemoProvider>,
    )

    expect(screen.getByTestId('data')).toHaveTextContent(JSON.stringify(liveData))
    expect(screen.getByTestId('is-demo-data')).toHaveTextContent('false')
    expect(screen.getByTestId('is-loading')).toHaveTextContent('false')
  })

  it('returns loading state when live data is loading', () => {
    render(
      <UnifiedDemoProvider>
        <DataConsumer liveData={undefined} isLiveLoading={true} />
      </UnifiedDemoProvider>,
    )

    expect(screen.getByTestId('is-loading')).toHaveTextContent('true')
    expect(screen.getByTestId('show-skeleton')).toHaveTextContent('true')
  })

  it('returns demo data when in demo mode', () => {
    mockIsDemoMode = true

    render(
      <UnifiedDemoProvider>
        <DataConsumer liveData={undefined} isLiveLoading={false} />
      </UnifiedDemoProvider>,
    )

    expect(screen.getByTestId('data')).toHaveTextContent(JSON.stringify({ demo: true }))
    expect(screen.getByTestId('is-demo-data')).toHaveTextContent('true')
  })

  it('skips demo data when skipDemo is true', () => {
    mockIsDemoMode = true

    render(
      <UnifiedDemoProvider>
        <DataConsumer liveData={{ live: true }} isLiveLoading={false} options={{ skipDemo: true }} />
      </UnifiedDemoProvider>,
    )

    expect(screen.getByTestId('data')).toHaveTextContent(JSON.stringify({ live: true }))
    expect(screen.getByTestId('is-demo-data')).toHaveTextContent('false')
  })

  it('shows skeleton when forceSkeleton is true', () => {
    render(
      <UnifiedDemoProvider>
        <DataConsumer liveData={{ live: true }} isLiveLoading={false} options={{ forceSkeleton: true }} />
      </UnifiedDemoProvider>,
    )

    expect(screen.getByTestId('show-skeleton')).toHaveTextContent('true')
  })

  it('passes through live error when not in demo mode', () => {
    const error = new Error('fetch failed')

    render(
      <UnifiedDemoProvider>
        <DataConsumer liveData={undefined} isLiveLoading={false} options={{ error }} />
      </UnifiedDemoProvider>,
    )

    expect(screen.getByTestId('error')).toHaveTextContent('fetch failed')
  })

  it('refetch calls regenerate when in demo mode', async () => {
    mockIsDemoMode = true
    const { clearDemoDataCache } = await import('../demoDataRegistry')

    render(
      <UnifiedDemoProvider>
        <DataConsumer liveData={undefined} isLiveLoading={false} />
      </UnifiedDemoProvider>,
    )

    act(() => {
      screen.getByTestId('refetch').click()
    })

    expect(clearDemoDataCache).toHaveBeenCalledWith('test-component')
  })
})
