/**
 * Unit tests for NodeConditions card component.
 *
 * Tests cover: loading skeleton, empty state, filter pills (all/healthy/cordoned/pressure),
 * node classification, cordon/uncordon confirmation dialog, kubectl execution,
 * action error display, stale data warning, and truncation at MAX_VISIBLE_CONDITIONS.
 *
 * Closes #14769
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NodeConditions } from './NodeConditions'

// ---------------------------------------------------------------------------
// Mock dependencies
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown> | string) => {
      if (opts && typeof opts === 'object' && 'count' in opts) return `${opts.count} more`
      if (opts && typeof opts === 'object' && 'action' in opts && 'node' in opts) return `${opts.action} ${opts.node}?`
      if (opts && typeof opts === 'object' && 'time' in opts) return `Last refreshed: ${opts.time}`
      return key.split('.').pop() ?? key
    },
  }),
}))

const mockCachedNodes = vi.fn()
vi.mock('../../hooks/useCachedData', () => ({
  useCachedNodes: () => mockCachedNodes(),
}))

const mockIsDemoMode = vi.fn(() => ({ isDemoMode: false }))
vi.mock('../../hooks/useDemoMode', () => ({
  useDemoMode: () => mockIsDemoMode(),
}))

const mockExecute = vi.fn()
vi.mock('../../hooks/useKubectl', () => ({
  useKubectl: () => ({ execute: mockExecute }),
}))

const mockUseCardLoadingState = vi.fn()
vi.mock('./CardDataContext', () => ({
  useCardLoadingState: (opts: Record<string, unknown>) => mockUseCardLoadingState(opts),
}))

vi.mock('../ui/StatusBadge', () => ({
  StatusBadge: ({ children, color }: { children: React.ReactNode; color?: string }) => (
    <span data-testid="status-badge" data-color={color}>{children}</span>
  ),
}))

vi.mock('../../lib/cards/CardComponents', () => ({
  CardEmptyState: ({ title, message }: { title: string; message: string }) => (
    <div data-testid="card-empty-state">
      <div data-testid="empty-title">{title}</div>
      <div data-testid="empty-message">{message}</div>
    </div>
  ),
}))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const healthyNode = {
  name: 'node-1',
  cluster: 'prod-cluster',
  unschedulable: false,
  conditions: [{ type: 'Ready', status: 'True' }],
}

const cordonedNode = {
  name: 'node-2',
  cluster: 'prod-cluster',
  unschedulable: true,
  conditions: [{ type: 'Ready', status: 'True' }],
}

const pressureNode = {
  name: 'node-3',
  cluster: 'staging-cluster',
  unschedulable: false,
  conditions: [
    { type: 'Ready', status: 'False' },
    { type: 'MemoryPressure', status: 'True' },
  ],
}

const defaultNodesReturn = {
  nodes: [healthyNode, cordonedNode, pressureNode],
  isLoading: false,
  isRefreshing: false,
  isDemoFallback: false,
  isFailed: false,
  consecutiveFailures: 0,
  lastRefresh: null,
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function setup() {
  mockCachedNodes.mockReturnValue(defaultNodesReturn)
  mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: false })
  mockIsDemoMode.mockReturnValue({ isDemoMode: false })
  mockExecute.mockResolvedValue(undefined)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NodeConditions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setup()
  })

  // --- Loading states -------------------------------------------------------

  it('renders loading skeleton when isLoading and no data', () => {
    mockCachedNodes.mockReturnValue({
      ...defaultNodesReturn,
      nodes: [],
      isLoading: true,
    })
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: false })

    render(<NodeConditions />)
    // Skeleton is rendered as pulse divs when isLoading && nodes.length === 0
    const skeleton = document.querySelectorAll('.animate-pulse')
    expect(skeleton.length).toBeGreaterThan(0)
  })

  it('renders empty state when showEmptyState is true', () => {
    mockCachedNodes.mockReturnValue({ ...defaultNodesReturn, nodes: [] })
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: true })

    render(<NodeConditions />)
    expect(screen.getByTestId('card-empty-state')).toBeInTheDocument()
    expect(screen.getByTestId('empty-title').textContent).toMatch(/emptyTitle|No nodes/i)
  })

  // --- Filter pills ---------------------------------------------------------

  it('renders 4 filter pills (all, healthy, cordoned, pressure)', () => {
    render(<NodeConditions />)
    const buttons = screen.getAllByRole('button')
    // Filter pills are buttons; also cordon buttons exist — filter by title pattern
    const filterButtons = buttons.filter(b => b.title.includes(':'))
    expect(filterButtons.length).toBe(4)
  })

  it('shows correct counts in filter pills', () => {
    render(<NodeConditions />)
    // all:3, healthy:1, cordoned:1, pressure:1
    expect(screen.getByTitle('filterAll: 3')).toBeInTheDocument()
    expect(screen.getByTitle('filterHealthy: 1')).toBeInTheDocument()
    expect(screen.getByTitle('filterCordoned: 1')).toBeInTheDocument()
    expect(screen.getByTitle('filterPressure: 1')).toBeInTheDocument()
  })

  it('clicking "healthy" pill filters list to healthy nodes only', async () => {
    const user = userEvent.setup()
    render(<NodeConditions />)

    await user.click(screen.getByTitle('filterHealthy: 1'))

    // Only node-1 should be visible
    expect(screen.getByText('node-1')).toBeInTheDocument()
    expect(screen.queryByText('node-2')).not.toBeInTheDocument()
    expect(screen.queryByText('node-3')).not.toBeInTheDocument()
  })

  it('clicking "cordoned" pill shows only cordoned nodes', async () => {
    const user = userEvent.setup()
    render(<NodeConditions />)

    await user.click(screen.getByTitle('filterCordoned: 1'))

    expect(screen.getByText('node-2')).toBeInTheDocument()
    expect(screen.queryByText('node-1')).not.toBeInTheDocument()
    expect(screen.queryByText('node-3')).not.toBeInTheDocument()
  })

  it('clicking "pressure" pill shows only pressure nodes', async () => {
    const user = userEvent.setup()
    render(<NodeConditions />)

    await user.click(screen.getByTitle('filterPressure: 1'))

    expect(screen.getByText('node-3')).toBeInTheDocument()
    expect(screen.queryByText('node-1')).not.toBeInTheDocument()
    expect(screen.queryByText('node-2')).not.toBeInTheDocument()
  })

  it('clicking "all" pill returns to full list', async () => {
    const user = userEvent.setup()
    render(<NodeConditions />)

    await user.click(screen.getByTitle('filterCordoned: 1'))
    await user.click(screen.getByTitle('filterAll: 3'))

    expect(screen.getByText('node-1')).toBeInTheDocument()
    expect(screen.getByText('node-2')).toBeInTheDocument()
    expect(screen.getByText('node-3')).toBeInTheDocument()
  })

  // --- Node rendering -------------------------------------------------------

  it('renders node names and cluster names', () => {
    render(<NodeConditions />)
    expect(screen.getByText('node-1')).toBeInTheDocument()
    expect(screen.getByText('node-2')).toBeInTheDocument()
    expect(screen.getByText('node-3')).toBeInTheDocument()
    expect(screen.getAllByText('prod-cluster').length).toBeGreaterThan(0)
    expect(screen.getByText('staging-cluster')).toBeInTheDocument()
  })

  it('cordoned node shows cordoned status badge', () => {
    render(<NodeConditions />)
    const badges = screen.getAllByTestId('status-badge')
    const cordonedBadge = badges.find(b => b.getAttribute('data-color') === 'yellow')
    expect(cordonedBadge).toBeTruthy()
  })

  it('pressure node shows pressure type label', () => {
    render(<NodeConditions />)
    // MemoryPressure → "Memory" after stripping "Pressure"
    expect(screen.getByText('Memory')).toBeInTheDocument()
  })

  it('healthy node shows green status indicator', () => {
    render(<NodeConditions />)
    const greenDots = document.querySelectorAll('.bg-green-500')
    expect(greenDots.length).toBeGreaterThan(0)
  })

  it('cordoned node shows yellow status indicator', () => {
    render(<NodeConditions />)
    const yellowDots = document.querySelectorAll('.bg-yellow-500')
    expect(yellowDots.length).toBeGreaterThan(0)
  })

  // --- Cordon/uncordon action -----------------------------------------------

  it('healthy node shows "cordon" action button', () => {
    render(<NodeConditions />)
    // Should have a cordon button for node-1 (healthy)
    const cordonButtons = screen.getAllByRole('button').filter(
      b => b.textContent === 'cordon'
    )
    expect(cordonButtons.length).toBeGreaterThan(0)
  })

  it('cordoned node shows "uncordon" action button', () => {
    render(<NodeConditions />)
    const uncordonButtons = screen.getAllByRole('button').filter(
      b => b.textContent === 'uncordon'
    )
    expect(uncordonButtons.length).toBeGreaterThan(0)
  })

  it('clicking cordon button opens confirmation dialog', async () => {
    const user = userEvent.setup()
    render(<NodeConditions />)

    const cordonBtn = screen.getAllByRole('button').find(b => b.textContent === 'cordon')!
    await user.click(cordonBtn)

    // Confirmation dialog should appear (confirmTitle key rendered)
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
  })

  it('cancelling confirmation dismisses dialog', async () => {
    const user = userEvent.setup()
    render(<NodeConditions />)

    const cordonBtn = screen.getAllByRole('button').find(b => b.textContent === 'cordon')!
    await user.click(cordonBtn)

    await user.click(screen.getByRole('button', { name: /cancel/i }))
    expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument()
  })

  it('confirming cordon calls kubectl execute with correct args', async () => {
    const user = userEvent.setup()
    render(<NodeConditions />)

    // Click the cordon button on a healthy node
    const allButtons = screen.getAllByRole('button')
    const cordonBtn = allButtons.find(b => b.textContent?.trim() === 'cordon')!
    await user.click(cordonBtn)

    // Confirmation dialog appears — the yellow-styled confirm button is inside the dialog
    // It is the only button with class bg-yellow-500/20
    const confirmBtn = document.querySelector('button.bg-yellow-500\\/20') as HTMLElement
    expect(confirmBtn).toBeTruthy()
    await user.click(confirmBtn)

    await waitFor(() => {
      expect(mockExecute).toHaveBeenCalledWith(
        expect.any(String),
        ['cordon', expect.any(String)]
      )
    })
  })

  it('shows action error when kubectl execute rejects', async () => {
    mockExecute.mockRejectedValue(new Error('kubectl timeout'))
    const user = userEvent.setup()
    render(<NodeConditions />)

    const allButtons = screen.getAllByRole('button')
    const cordonBtn = allButtons.find(b => b.textContent?.trim() === 'cordon')!
    await user.click(cordonBtn)

    const confirmBtn = document.querySelector('button.bg-yellow-500\\/20') as HTMLElement
    await user.click(confirmBtn)

    await waitFor(() => {
      expect(screen.getByText(/kubectl timeout/i)).toBeInTheDocument()
    })
  })

  it('dismissing action error clears it', async () => {
    mockExecute.mockRejectedValue(new Error('kubectl timeout'))
    const user = userEvent.setup()
    render(<NodeConditions />)

    const allButtons = screen.getAllByRole('button')
    const cordonBtn = allButtons.find(b => b.textContent?.trim() === 'cordon')!
    await user.click(cordonBtn)

    const confirmBtn = document.querySelector('button.bg-yellow-500\\/20') as HTMLElement
    await user.click(confirmBtn)

    await waitFor(() => screen.getByText(/kubectl timeout/i))

    await user.click(screen.getByRole('button', { name: '✕' }))
    expect(screen.queryByText(/kubectl timeout/i)).not.toBeInTheDocument()
  })

  // --- Stale data warning ---------------------------------------------------

  it('shows stale data warning when data exists but fetch is failing', () => {
    mockCachedNodes.mockReturnValue({
      ...defaultNodesReturn,
      isFailed: true,
      isDemoFallback: false,
    })
    render(<NodeConditions />)
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByText(/staleData/)).toBeInTheDocument()
  })

  it('does not show stale warning in demo fallback mode', () => {
    mockCachedNodes.mockReturnValue({
      ...defaultNodesReturn,
      isFailed: true,
      isDemoFallback: true,
    })
    render(<NodeConditions />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  // --- Truncation -----------------------------------------------------------

  it('shows "more nodes" message when >20 nodes match filter', () => {
    const manyNodes = Array.from({ length: 25 }, (_, i) => ({
      name: `node-${i}`,
      cluster: 'big-cluster',
      unschedulable: false,
      conditions: [{ type: 'Ready', status: 'True' }],
    }))
    mockCachedNodes.mockReturnValue({ ...defaultNodesReturn, nodes: manyNodes })

    render(<NodeConditions />)
    // 25 - 20 = 5 more
    expect(screen.getByText(/5 more/)).toBeInTheDocument()
  })
})
