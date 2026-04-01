/**
 * Deep branch-coverage tests for GettingStartedBanner.tsx
 *
 * Tests visibility logic (dismissed / hints-suppressed), dismiss persistence,
 * action button callbacks, and analytics emissions.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// ── Mocks ────────────────────────────────────────────────────────────
vi.mock('../../../lib/utils/localStorage', () => ({
  safeGetItem: vi.fn().mockReturnValue(null),
  safeSetItem: vi.fn(),
  safeGetJSON: vi.fn().mockReturnValue(null),
  safeSetJSON: vi.fn(),
}))

vi.mock('../../../lib/constants/storage', () => ({
  STORAGE_KEY_GETTING_STARTED_DISMISSED: 'kc-getting-started-dismissed',
  STORAGE_KEY_HINTS_SUPPRESSED: 'kc-hints-suppressed',
  STORAGE_KEY_SEEN_TIPS: 'kc-seen-tips',
}))

vi.mock('../../../lib/analytics', () => ({
  emitGettingStartedShown: vi.fn(),
  emitGettingStartedActioned: vi.fn(),
  emitTipShown: vi.fn(),
}))

vi.mock('../../../config/dashboards/index', () => ({
  DASHBOARD_CONFIGS: { main: {}, clusters: {}, security: {} },
}))

vi.mock('../../../lib/tips', () => ({
  getRandomTip: () => ({ tip: 'Test tip text', id: 'tip-1' }),
}))

import { safeGetItem, safeSetItem } from '../../../lib/utils/localStorage'
import { emitGettingStartedShown, emitGettingStartedActioned, emitTipShown } from '../../../lib/analytics'
import { GettingStartedBanner } from '../GettingStartedBanner'

const defaultProps = {
  onBrowseCards: vi.fn(),
  onTryMission: vi.fn(),
  onExploreDashboards: vi.fn(),
}

describe('GettingStartedBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(safeGetItem).mockReturnValue(null)
  })

  // ── Visibility ──────────────────────────────────────────────────────

  it('renders when not dismissed and hints not suppressed', () => {
    render(<GettingStartedBanner {...defaultProps} />)
    expect(screen.getByText('Welcome to KubeStellar Console')).toBeInTheDocument()
  })

  it('renders nothing when previously dismissed', () => {
    vi.mocked(safeGetItem).mockImplementation((key: string) => {
      if (key === 'kc-getting-started-dismissed') return 'true'
      return null
    })
    const { container } = render(<GettingStartedBanner {...defaultProps} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders nothing when hints are suppressed', () => {
    vi.mocked(safeGetItem).mockImplementation((key: string) => {
      if (key === 'kc-hints-suppressed') return 'true'
      return null
    })
    const { container } = render(<GettingStartedBanner {...defaultProps} />)
    expect(container.innerHTML).toBe('')
  })

  // ── Action buttons ──────────────────────────────────────────────────

  it('renders all three action buttons', () => {
    render(<GettingStartedBanner {...defaultProps} />)
    expect(screen.getByText('Browse Cards')).toBeInTheDocument()
    expect(screen.getByText('Try a Mission')).toBeInTheDocument()
    expect(screen.getByText('Explore More Dashboards')).toBeInTheDocument()
  })

  it('calls onBrowseCards and emits analytics when Browse Cards is clicked', () => {
    render(<GettingStartedBanner {...defaultProps} />)
    fireEvent.click(screen.getByText('Browse Cards'))
    expect(defaultProps.onBrowseCards).toHaveBeenCalledTimes(1)
    expect(emitGettingStartedActioned).toHaveBeenCalledWith('browse_cards')
  })

  it('calls onTryMission and emits analytics when Try a Mission is clicked', () => {
    render(<GettingStartedBanner {...defaultProps} />)
    fireEvent.click(screen.getByText('Try a Mission'))
    expect(defaultProps.onTryMission).toHaveBeenCalledTimes(1)
    expect(emitGettingStartedActioned).toHaveBeenCalledWith('try_mission')
  })

  it('calls onExploreDashboards and emits analytics when Explore Dashboards is clicked', () => {
    render(<GettingStartedBanner {...defaultProps} />)
    fireEvent.click(screen.getByText('Explore More Dashboards'))
    expect(defaultProps.onExploreDashboards).toHaveBeenCalledTimes(1)
    expect(emitGettingStartedActioned).toHaveBeenCalledWith('explore_dashboards')
  })

  // ── Dismiss ─────────────────────────────────────────────────────────

  it('dismisses when X button is clicked', () => {
    render(<GettingStartedBanner {...defaultProps} />)
    const dismissBtn = screen.getByLabelText('Dismiss')
    fireEvent.click(dismissBtn)
    expect(safeSetItem).toHaveBeenCalledWith('kc-getting-started-dismissed', 'true')
    // After dismiss, the component should not render content
    expect(screen.queryByText('Welcome to KubeStellar Console')).not.toBeInTheDocument()
  })

  // ── Analytics ───────────────────────────────────────────────────────

  it('emits shown analytics on first render', () => {
    render(<GettingStartedBanner {...defaultProps} />)
    expect(emitGettingStartedShown).toHaveBeenCalledTimes(1)
  })

  it('emits tip shown analytics on first render', () => {
    render(<GettingStartedBanner {...defaultProps} />)
    expect(emitTipShown).toHaveBeenCalledWith('dashboard', 'Test tip text')
  })

  it('does not emit shown analytics when dismissed', () => {
    vi.mocked(safeGetItem).mockImplementation((key: string) => {
      if (key === 'kc-getting-started-dismissed') return 'true'
      return null
    })
    render(<GettingStartedBanner {...defaultProps} />)
    expect(emitGettingStartedShown).not.toHaveBeenCalled()
  })

  // ── Tip display ─────────────────────────────────────────────────────

  it('displays the random tip text', () => {
    render(<GettingStartedBanner {...defaultProps} />)
    expect(screen.getByText(/Test tip text/)).toBeInTheDocument()
  })

  // ── Dashboard count in description ──────────────────────────────────

  it('shows the correct dashboard count in description', () => {
    render(<GettingStartedBanner {...defaultProps} />)
    // Our mock has 3 dashboards
    expect(screen.getByText(/3 topic-specific dashboards/)).toBeInTheDocument()
  })
})
