import React from 'react'
/**
 * Unit tests for ACMMLevel card component.
 * Covers: loading skeleton, happy-path level gauge, level ladder rows,
 * prerequisites indicator, next-level upgrade block, progress bar,
 * and snapshot.
 *
 * Closes #21103
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ACMMLevel } from './ACMMLevel'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUseACMM = vi.fn()
vi.mock('../acmm/ACMMProvider', () => ({
  useACMM: () => mockUseACMM(),
}))

const mockUseCardLoadingState = vi.fn()
vi.mock('./CardDataContext', () => ({
  useCardLoadingState: (opts: Record<string, unknown>) => mockUseCardLoadingState(opts),
}))

vi.mock('../../lib/cards/CardComponents', () => ({
  CardSkeleton: ({ type }: { type: string }) => (
    <div data-testid="card-skeleton" data-type={type} />
  ),
}))

vi.mock('../../lib/acmm/sources/acmm', () => ({
  acmmSource: {
    levels: [
      { n: 1, name: 'Managed', role: 'Executor', characteristic: 'Uses tools.' },
      { n: 2, name: 'Adaptive', role: 'Rule-writer', characteristic: 'Writes rules.' },
      { n: 3, name: 'Proactive', role: 'Analyst', characteristic: 'Analyses data.' },
      { n: 4, name: 'Governing', role: 'Governor', characteristic: 'Governs systems.' },
      { n: 5, name: 'Operating', role: 'Operator', characteristic: 'Operates clusters.' },
      { n: 6, name: 'Strategic', role: 'Strategist', characteristic: 'Sets strategy.' },
    ],
  },
}))

vi.mock('../../lib/cn', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}))

vi.mock('../../lib/utils/layouts', () => ({
  LAYOUTS: {
    CENTER_GAP_1: 'flex items-center gap-1',
    CENTER_GAP_2: 'flex items-center gap-2',
  },
}))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const defaultScan = {
  level: {
    level: 2,
    levelName: 'Adaptive / Managed',
    role: 'Rule-writer',
    characteristic: 'Writes rules and adapts.',
    prerequisites: { total: 3, met: 2 },
    requiredByLevel: { 3: 5 },
    detectedByLevel: { 3: 3 },
    nextTransitionTrigger: 'When feedback loops are automated.',
  },
  isLoading: false,
  isRefreshing: false,
  isDemoData: false,
  isFailed: false,
  consecutiveFailures: 0,
  lastRefresh: null,
  data: { detectedIds: ['crit-1', 'crit-2'] },
}

function setup(overrides = {}) {
  mockUseACMM.mockReturnValue({
    repo: 'kubestellar/console',
    scan: { ...defaultScan, ...overrides },
  })
  mockUseCardLoadingState.mockReturnValue({ showSkeleton: false })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ACMMLevel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setup()
  })

  // 1. Loading skeleton
  it('renders CardSkeleton when showSkeleton is true', () => {
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: true })
    render(<ACMMLevel />)
    expect(screen.getByTestId('card-skeleton')).toBeInTheDocument()
    expect(screen.getByTestId('card-skeleton').getAttribute('data-type')).toBe('metric')
  })

  // 2. Repo name shown
  it('renders repo name', () => {
    render(<ACMMLevel />)
    expect(screen.getByText('kubestellar/console')).toBeInTheDocument()
  })

  // 3. Current level gauge
  it('renders current level label', () => {
    render(<ACMMLevel />)
    // 'L2' appears in both the gauge and the ladder row — use getAllByText
    expect(screen.getAllByText('L2')[0]).toBeInTheDocument()
  })

  it('renders role label', () => {
    render(<ACMMLevel />)
    expect(screen.getByText('Rule-writer')).toBeInTheDocument()
  })

  it('renders characteristic text', () => {
    render(<ACMMLevel />)
    expect(screen.getByText('Writes rules and adapts.')).toBeInTheDocument()
  })

  // 4. Prerequisites indicator
  it('renders prerequisite met/total', () => {
    render(<ACMMLevel />)
    expect(screen.getByText('2/3')).toBeInTheDocument()
  })

  // 5. Next level upgrade block
  it('renders Why move to L3 block', () => {
    render(<ACMMLevel />)
    expect(screen.getByText(/Why move to L3/i)).toBeInTheDocument()
  })

  it('renders next transition trigger', () => {
    render(<ACMMLevel />)
    expect(screen.getByText('When feedback loops are automated.')).toBeInTheDocument()
  })

  // 6. Level ladder
  it('renders all 6 level rows', () => {
    render(<ACMMLevel />)
    for (let n = 1; n <= 6; n++) {
      // 'L2' also appears in the gauge — getAllByText is safe for all n
      expect(screen.getAllByText(`L${n}`)[0]).toBeInTheDocument()
    }
  })

  it('highlights current level row', () => {
    render(<ACMMLevel />)
    // getAllByText('L2'): [0] = gauge div, [1] = ladder span
    const l2 = screen.getAllByText('L2')[1].closest('div')
    expect(l2?.className).toContain('bg-primary/15')
  })

  // 7. Progress bar
  it('renders progress to next level', () => {
    render(<ACMMLevel />)
    expect(screen.getByText('3/5')).toBeInTheDocument()
  })

  it('renders max-level card without next level block when at L6', () => {
    setup({ level: { ...defaultScan.level, level: 6, levelName: 'Strategic', role: 'Strategist', prerequisites: { total: 0, met: 0 }, requiredByLevel: {}, detectedByLevel: {} } })
    render(<ACMMLevel />)
    expect(screen.queryByText(/Why move to/i)).not.toBeInTheDocument()
  })

  // 8. Snapshot
  it('matches snapshot', () => {
    const { asFragment } = render(<ACMMLevel />)
    expect(asFragment()).toMatchSnapshot()
  })
})
