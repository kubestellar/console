import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import React from 'react'

// agentFetch — controlled per-test via mockResolvedValueOnce
vi.mock('../../../../hooks/mcp/shared', () => ({
  agentFetch: vi.fn(),
}))

// getDemoMode returns false by default so the component actually fetches.
// Individual tests that need demo-mode blocking can override it.
vi.mock('../../../../hooks/useDemoMode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../hooks/useDemoMode')>()),
  getDemoMode: vi.fn().mockReturnValue(false),
  default: () => false,
  useDemoMode: () => ({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }),
  hasRealToken: () => true,
  isDemoModeForced: false,
  isNetlifyDeployment: false,
  canToggleDemoMode: () => true,
  isDemoToken: () => false,
  setDemoToken: vi.fn(),
  setGlobalDemoMode: vi.fn(),
}))

vi.mock('../../../../lib/demoMode', () => ({
  isDemoMode: () => false, getDemoMode: () => false, isNetlifyDeployment: false,
  isDemoModeForced: false, canToggleDemoMode: () => true, setDemoMode: vi.fn(),
  toggleDemoMode: vi.fn(), subscribeDemoMode: () => () => {},
  isDemoToken: () => false, hasRealToken: () => true, setDemoToken: vi.fn(),
  isFeatureEnabled: () => true,
}))

vi.mock('../../../../lib/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../lib/analytics')>()),
  emitNavigate: vi.fn(), emitLogin: vi.fn(), emitEvent: vi.fn(), analyticsReady: Promise.resolve(),
  emitAddCardModalOpened: vi.fn(), emitCardExpanded: vi.fn(), emitCardRefreshed: vi.fn(),
}
))

vi.mock('../../../../hooks/useTokenUsage', () => ({
  useTokenUsage: () => ({ usage: { total: 0, remaining: 0, used: 0 }, isLoading: false }),
  tokenUsageTracker: { getUsage: () => ({ total: 0, remaining: 0, used: 0 }), trackRequest: vi.fn(), getSettings: () => ({ enabled: false }) },
}))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, opts?: string | Record<string, unknown>) => {
      if (typeof opts === 'string') return opts
      if (opts && typeof opts === 'object' && 'defaultValue' in opts) return opts.defaultValue as string
      return key
    },
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
  Trans: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock('../../../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => ({ drillToCluster: vi.fn(), drillToNamespace: vi.fn() }),
  useDrillDown: () => ({ state: { stack: [] }, pop: vi.fn(), close: vi.fn() }),
}))

vi.mock('../../../../lib/clipboard', () => ({
  copyToClipboard: vi.fn(),
}))

vi.mock('../../../charts/StatusIndicator', () => ({
  StatusIndicator: ({ status }: { status: string }) => <div data-testid="status-indicator">{status}</div>,
}))

vi.mock('../../../ui/ClusterBadge', () => ({
  ClusterBadge: ({ cluster }: { cluster: string }) => <span data-testid="cluster-badge">{cluster}</span>,
}))

vi.mock('../../../../lib/cn', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}))

import { EventsDrillDown } from '../EventsDrillDown'
import { agentFetch } from '../../../../hooks/mcp/shared'

// ─── Helpers ────────────────────────────────────────────────────────────────

function mkEvent(overrides: Partial<{
  type: string; reason: string; message: string
  object: string; namespace: string; cluster: string; count: number; lastSeen: string
}> = {}) {
  return {
    type: 'Normal',
    reason: 'Started',
    message: 'Started container',
    object: 'pod/my-pod',
    namespace: 'default',
    cluster: 'c1',
    count: 1,
    lastSeen: new Date().toISOString(),
    ...overrides,
  }
}

/** Make agentFetch resolve with the given events for the next call. */
function mockEvents(events: ReturnType<typeof mkEvent>[]) {
  vi.mocked(agentFetch).mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve({ events }),
  } as Response)
}

/** agentFetch returns a network failure — component shows error/empty state. */
function mockFetchError() {
  vi.mocked(agentFetch).mockResolvedValueOnce({
    ok: false,
    json: () => Promise.resolve({}),
  } as Response)
}

const BASE_DATA = { cluster: 'c1', namespace: 'ns1' }

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('EventsDrillDown', () => {
  beforeEach(() => {
    vi.mocked(agentFetch).mockReset()
  })

  it('renders without crashing', async () => {
    mockFetchError()
    await act(async () => {
      render(<EventsDrillDown data={BASE_DATA} />)
    })
    expect(document.body).toBeTruthy()
  })

  describe('stat tiles reflect full filtered set, not the current page', () => {
    it('shows correct total when events exceed one page', async () => {
      const events = Array.from({ length: 25 }, (_, i) => mkEvent({ reason: `R${i}` }))
      mockEvents(events)

      await act(async () => {
        render(<EventsDrillDown data={BASE_DATA} />)
      })

      // All 25 are Normal so both Total and Normal tiles show "25" — use getAllByText
      expect(screen.getAllByText('25').length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText('Total Events')).toBeTruthy()
    })

    it('shows correct Warning and Normal counts across all pages', async () => {
      const warnings = Array.from({ length: 15 }, (_, i) => mkEvent({ type: 'Warning', reason: `W${i}` }))
      const normals  = Array.from({ length: 15 }, (_, i) => mkEvent({ type: 'Normal',  reason: `N${i}` }))
      mockEvents([...warnings, ...normals])

      await act(async () => {
        render(<EventsDrillDown data={BASE_DATA} />)
      })

      // Total = 30
      expect(screen.getByText('30')).toBeTruthy()
      // Both warning and normal counts should be 15, not the partial page-1 counts
      const fifteens = screen.getAllByText('15')
      expect(fifteens.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('type filter', () => {
    it('renders the type filter select', async () => {
      mockEvents([mkEvent()])
      await act(async () => {
        render(<EventsDrillDown data={BASE_DATA} />)
      })
      expect(screen.getByTestId('events-type-filter')).toBeTruthy()
    })

    it('filters list and updates stat tile total when Warning is selected', async () => {
      mockEvents([
        mkEvent({ type: 'Warning', reason: 'BackOff' }),
        mkEvent({ type: 'Normal',  reason: 'Started' }),
        mkEvent({ type: 'Warning', reason: 'Failed' }),
      ])
      await act(async () => {
        render(<EventsDrillDown data={BASE_DATA} />)
      })

      const select = screen.getByTestId('events-type-filter') as HTMLSelectElement
      await act(async () => {
        fireEvent.change(select, { target: { value: 'Warning' } })
      })

      // Only 2 warnings remain — total and warning tiles both show 2
      expect(screen.getAllByText('2').length).toBeGreaterThanOrEqual(1)
      // Normal event should not appear in the list
      expect(screen.queryByText('Started')).toBeNull()
    })

    it('shows "Clear filters" button when a filter is active', async () => {
      mockEvents([mkEvent()])
      await act(async () => {
        render(<EventsDrillDown data={BASE_DATA} />)
      })

      const select = screen.getByTestId('events-type-filter') as HTMLSelectElement
      await act(async () => {
        fireEvent.change(select, { target: { value: 'Warning' } })
      })

      expect(screen.getByTestId('events-clear-filters')).toBeTruthy()
    })

    it('restores full list when Clear filters is clicked', async () => {
      mockEvents([
        mkEvent({ type: 'Warning', reason: 'BackOff' }),
        mkEvent({ type: 'Normal',  reason: 'Started' }),
      ])
      await act(async () => {
        render(<EventsDrillDown data={BASE_DATA} />)
      })

      const select = screen.getByTestId('events-type-filter') as HTMLSelectElement
      await act(async () => {
        fireEvent.change(select, { target: { value: 'Warning' } })
      })
      await act(async () => {
        fireEvent.click(screen.getByTestId('events-clear-filters'))
      })

      expect(screen.getByText('BackOff')).toBeTruthy()
      expect(screen.getByText('Started')).toBeTruthy()
    })
  })

  describe('search', () => {
    it('renders the search input', async () => {
      mockEvents([mkEvent()])
      await act(async () => {
        render(<EventsDrillDown data={BASE_DATA} />)
      })
      expect(screen.getByTestId('events-search')).toBeTruthy()
    })

    it('filters events by reason text', async () => {
      mockEvents([
        mkEvent({ reason: 'BackOff',  message: 'back-off restarting failed container' }),
        mkEvent({ reason: 'Pulled',   message: 'Successfully pulled image' }),
        mkEvent({ reason: 'Created',  message: 'Created container' }),
      ])
      await act(async () => {
        render(<EventsDrillDown data={BASE_DATA} />)
      })

      const input = screen.getByTestId('events-search') as HTMLInputElement
      await act(async () => {
        fireEvent.change(input, { target: { value: 'BackOff' } })
      })

      expect(screen.getByText('BackOff')).toBeTruthy()
      expect(screen.queryByText('Pulled')).toBeNull()
      expect(screen.queryByText('Created')).toBeNull()
    })

    it('filters events by message text (case-insensitive)', async () => {
      mockEvents([
        mkEvent({ reason: 'E1', message: 'OOMKilled container restart' }),
        mkEvent({ reason: 'E2', message: 'Successfully pulled image' }),
      ])
      await act(async () => {
        render(<EventsDrillDown data={BASE_DATA} />)
      })

      const input = screen.getByTestId('events-search') as HTMLInputElement
      await act(async () => {
        fireEvent.change(input, { target: { value: 'oomkilled' } })
      })

      expect(screen.getByText('E1')).toBeTruthy()
      expect(screen.queryByText('E2')).toBeNull()
    })

    it('shows "no events match filters" when search yields nothing', async () => {
      mockEvents([mkEvent({ reason: 'Pulled' })])
      await act(async () => {
        render(<EventsDrillDown data={BASE_DATA} />)
      })

      const input = screen.getByTestId('events-search') as HTMLInputElement
      await act(async () => {
        fireEvent.change(input, { target: { value: 'xyzzy-no-match' } })
      })

      expect(screen.getByText('No events match the active filters.')).toBeTruthy()
    })

    it('does not show kubectl fallback when filters are active', async () => {
      mockEvents([mkEvent({ reason: 'Pulled' })])
      await act(async () => {
        render(<EventsDrillDown data={BASE_DATA} />)
      })

      const input = screen.getByTestId('events-search') as HTMLInputElement
      await act(async () => {
        fireEvent.change(input, { target: { value: 'xyzzy-no-match' } })
      })

      expect(screen.queryByText('Get Events via kubectl')).toBeNull()
    })
  })

  describe('pagination', () => {
    it('does not render pagination when events fit on one page', async () => {
      mockEvents(Array.from({ length: 5 }, (_, i) => mkEvent({ reason: `R${i}` })))
      await act(async () => {
        render(<EventsDrillDown data={BASE_DATA} />)
      })

      expect(screen.queryByText(/^Page 1 of/)).toBeNull()
    })

    it('renders pagination controls when events exceed PAGE_SIZE (20)', async () => {
      mockEvents(Array.from({ length: 25 }, (_, i) => mkEvent({ reason: `R${i}` })))
      await act(async () => {
        render(<EventsDrillDown data={BASE_DATA} />)
      })

      expect(screen.getByText('Page 1 of 2')).toBeTruthy()
    })

    it('shows correct range label on page 1', async () => {
      mockEvents(Array.from({ length: 25 }, (_, i) => mkEvent({ reason: `R${i}` })))
      await act(async () => {
        render(<EventsDrillDown data={BASE_DATA} />)
      })

      expect(screen.getByText('Showing 1–20 of 25')).toBeTruthy()
    })

    it('advances to page 2 and shows correct range', async () => {
      mockEvents(Array.from({ length: 25 }, (_, i) =>
        mkEvent({ reason: `R${i}`, lastSeen: new Date(Date.now() - i * 1000).toISOString() })
      ))
      await act(async () => {
        render(<EventsDrillDown data={BASE_DATA} />)
      })

      await act(async () => {
        fireEvent.click(screen.getByLabelText('Next page'))
      })

      expect(screen.getByText('Page 2 of 2')).toBeTruthy()
      expect(screen.getByText('Showing 21–25 of 25')).toBeTruthy()
    })

    it('disables Previous button on page 1', async () => {
      mockEvents(Array.from({ length: 25 }, (_, i) => mkEvent({ reason: `R${i}` })))
      await act(async () => {
        render(<EventsDrillDown data={BASE_DATA} />)
      })

      expect((screen.getByLabelText('Previous page') as HTMLButtonElement).disabled).toBe(true)
    })

    it('disables Next button on the last page', async () => {
      mockEvents(Array.from({ length: 25 }, (_, i) =>
        mkEvent({ reason: `R${i}`, lastSeen: new Date(Date.now() - i * 1000).toISOString() })
      ))
      await act(async () => {
        render(<EventsDrillDown data={BASE_DATA} />)
      })

      await act(async () => {
        fireEvent.click(screen.getByLabelText('Next page'))
      })

      expect((screen.getByLabelText('Next page') as HTMLButtonElement).disabled).toBe(true)
    })

    it('resets to page 1 when type filter changes', async () => {
      // 25 warnings → page controls appear; switch to Normal → reset to page 1
      mockEvents(Array.from({ length: 25 }, (_, i) =>
        mkEvent({ type: 'Warning', reason: `W${i}`, lastSeen: new Date(Date.now() - i * 1000).toISOString() })
      ))
      await act(async () => {
        render(<EventsDrillDown data={BASE_DATA} />)
      })

      // Advance to page 2
      await act(async () => {
        fireEvent.click(screen.getByLabelText('Next page'))
      })
      expect(screen.getByText('Page 2 of 2')).toBeTruthy()

      // Switch filter → no Normal events exist, but the important thing is page reset
      const select = screen.getByTestId('events-type-filter')
      await act(async () => {
        fireEvent.change(select, { target: { value: 'Normal' } })
      })

      // Page 2 gone — either empty state or page 1 (no Normal events matches empty state)
      expect(screen.queryByText('Page 2 of 2')).toBeNull()
    })

    it('resets to page 1 when search query changes', async () => {
      mockEvents(Array.from({ length: 25 }, (_, i) =>
        mkEvent({ reason: `Alpha${i}`, lastSeen: new Date(Date.now() - i * 1000).toISOString() })
      ))
      await act(async () => {
        render(<EventsDrillDown data={BASE_DATA} />)
      })

      await act(async () => {
        fireEvent.click(screen.getByLabelText('Next page'))
      })
      expect(screen.getByText('Page 2 of 2')).toBeTruthy()

      const input = screen.getByTestId('events-search')
      await act(async () => {
        fireEvent.change(input, { target: { value: 'Alpha' } })
      })

      // All 25 Alpha events still match — but page resets to 1
      expect(screen.getByText('Page 1 of 2')).toBeTruthy()
    })
  })
})
