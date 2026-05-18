/**
 * OrbitStatusTracker unit tests
 *
 * Covers: never-run state, next-run display (due-in / overdue), history
 * timeline entries, show-more/show-less, cadence selector dropdown,
 * cadence change callback, and Run Now callback.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// ── Module mocks ─────────────────────────────────────────────────────────

vi.mock('../../../lib/constants/orbit', () => ({
  ORBIT_CADENCE_HOURS: { daily: 24, weekly: 168, monthly: 720 },
}))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (key === 'orbit.title') return 'Orbit Schedule'
      if (key === 'orbit.neverRun') return 'Never run'
      if (key === 'orbit.runNow') return 'Run Now'
      if (key === 'orbit.dueIn') return `Due in ${opts?.time}`
      if (key === 'orbit.overdue') return `Overdue by ${opts?.time}`
      if (key === 'orbit.cadenceDaily') return 'Daily'
      if (key === 'orbit.cadenceWeekly') return 'Weekly'
      if (key === 'orbit.cadenceMonthly') return 'Monthly'
      return key
    },
  }),
}))

import { OrbitStatusTracker } from '../OrbitStatusTracker'
import type { OrbitRunHistoryEntry, OrbitCadence } from '../../../lib/missions/types'

// ── Fixtures ─────────────────────────────────────────────────────────────

const NOW = Date.now()

function makeEntry(result: 'success' | 'warning' | 'failure', hoursAgo: number, summary?: string): OrbitRunHistoryEntry {
  return {
    result,
    timestamp: new Date(NOW - hoursAgo * 3_600_000).toISOString(),
    summary,
  } as OrbitRunHistoryEntry
}

const DEFAULT_PROPS = {
  history: [],
  cadence: 'weekly' as OrbitCadence,
  lastRunAt: null,
  onRunNow: vi.fn(),
  onChangeCadence: vi.fn(),
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('OrbitStatusTracker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Rendering ────────────────────────────────────────────────────────

  it('renders the Orbit Schedule title', () => {
    render(<OrbitStatusTracker {...DEFAULT_PROPS} />)
    expect(screen.getByText('Orbit Schedule')).toBeInTheDocument()
  })

  it('shows "Never run" when no lastRunAt provided', () => {
    render(<OrbitStatusTracker {...DEFAULT_PROPS} lastRunAt={null} />)
    expect(screen.getAllByText('Never run').length).toBeGreaterThan(0)
  })

  it('shows "Never run" in history area when history is empty', () => {
    render(<OrbitStatusTracker {...DEFAULT_PROPS} />)
    expect(screen.getAllByText('Never run').length).toBeGreaterThan(0)
  })

  // ── Next-run display ─────────────────────────────────────────────────

  it('shows "Due in" when next run is in the future', () => {
    // weekly = 168h, ran 100h ago → 68h remaining
    const lastRunAt = new Date(NOW - 100 * 3_600_000).toISOString()
    render(<OrbitStatusTracker {...DEFAULT_PROPS} lastRunAt={lastRunAt} />)
    expect(screen.getByText(/Due in/i)).toBeInTheDocument()
  })

  it('shows "Overdue by" when next run is in the past', () => {
    // weekly = 168h, ran 200h ago → overdue by 32h
    const lastRunAt = new Date(NOW - 200 * 3_600_000).toISOString()
    render(<OrbitStatusTracker {...DEFAULT_PROPS} lastRunAt={lastRunAt} />)
    expect(screen.getByText(/Overdue by/i)).toBeInTheDocument()
  })

  // ── History timeline ─────────────────────────────────────────────────

  it('renders history entries', () => {
    const history = [
      makeEntry('success', 48, 'All pods healthy'),
      makeEntry('warning', 96, 'CPU usage high'),
    ]
    render(<OrbitStatusTracker {...DEFAULT_PROPS} history={history} />)
    expect(screen.getByText('All pods healthy')).toBeInTheDocument()
    expect(screen.getByText('CPU usage high')).toBeInTheDocument()
  })

  it('shows result label for each entry', () => {
    const history = [
      makeEntry('success', 24),
      makeEntry('failure', 48),
    ]
    render(<OrbitStatusTracker {...DEFAULT_PROPS} history={history} />)
    expect(screen.getByText('success')).toBeInTheDocument()
    expect(screen.getByText('failure')).toBeInTheDocument()
  })

  it('shows at most 5 entries by default', () => {
    const history = Array.from({ length: 8 }, (_, i) => makeEntry('success', (i + 1) * 24, `Run ${i + 1}`))
    render(<OrbitStatusTracker {...DEFAULT_PROPS} history={history} />)
    expect(screen.queryByText('Run 6')).not.toBeInTheDocument()
  })

  it('shows "Show N more" button when history exceeds 5', () => {
    const history = Array.from({ length: 7 }, (_, i) => makeEntry('success', (i + 1) * 24))
    render(<OrbitStatusTracker {...DEFAULT_PROPS} history={history} />)
    expect(screen.getByText(/Show 2 more/i)).toBeInTheDocument()
  })

  it('shows all entries after clicking "Show more"', () => {
    const history = Array.from({ length: 7 }, (_, i) => makeEntry('success', (i + 1) * 24, `Entry ${i + 1}`))
    render(<OrbitStatusTracker {...DEFAULT_PROPS} history={history} />)
    fireEvent.click(screen.getByText(/Show 2 more/i))
    expect(screen.getByText('Entry 6')).toBeInTheDocument()
    expect(screen.getByText('Entry 7')).toBeInTheDocument()
  })

  it('shows "Show less" after expanding', () => {
    const history = Array.from({ length: 7 }, (_, i) => makeEntry('success', (i + 1) * 24))
    render(<OrbitStatusTracker {...DEFAULT_PROPS} history={history} />)
    fireEvent.click(screen.getByText(/Show 2 more/i))
    expect(screen.getByText(/Show less/i)).toBeInTheDocument()
  })

  it('collapses back when "Show less" is clicked', () => {
    const history = Array.from({ length: 7 }, (_, i) => makeEntry('success', (i + 1) * 24, `Entry ${i + 1}`))
    render(<OrbitStatusTracker {...DEFAULT_PROPS} history={history} />)
    fireEvent.click(screen.getByText(/Show 2 more/i))
    fireEvent.click(screen.getByText(/Show less/i))
    expect(screen.queryByText('Entry 6')).not.toBeInTheDocument()
  })

  // ── Cadence selector ─────────────────────────────────────────────────

  it('shows the current cadence in the selector button', () => {
    render(<OrbitStatusTracker {...DEFAULT_PROPS} cadence="weekly" />)
    expect(screen.getByText(/Weekly/i)).toBeInTheDocument()
  })

  it('opens cadence dropdown when selector is clicked', () => {
    render(<OrbitStatusTracker {...DEFAULT_PROPS} cadence="weekly" />)
    fireEvent.click(screen.getByText(/Weekly/i))
    expect(screen.getByText('Daily')).toBeInTheDocument()
    expect(screen.getByText('Monthly')).toBeInTheDocument()
  })

  it('calls onChangeCadence when a new cadence is selected', () => {
    const onChangeCadence = vi.fn()
    render(<OrbitStatusTracker {...DEFAULT_PROPS} cadence="weekly" onChangeCadence={onChangeCadence} />)
    fireEvent.click(screen.getByText(/Weekly/i)) // open dropdown
    const dailyOptions = screen.getAllByText('Daily')
    fireEvent.click(dailyOptions[dailyOptions.length - 1]) // click dropdown option
    expect(onChangeCadence).toHaveBeenCalledWith('daily')
  })

  it('closes cadence dropdown after selection', () => {
    render(<OrbitStatusTracker {...DEFAULT_PROPS} cadence="weekly" />)
    fireEvent.click(screen.getByText(/Weekly/i))
    const dailyOptions = screen.getAllByText('Daily')
    fireEvent.click(dailyOptions[dailyOptions.length - 1])
    // The dropdown Daily option should no longer be visible
    expect(screen.queryAllByText('Daily').length).toBeLessThanOrEqual(1)
  })

  // ── Run Now ───────────────────────────────────────────────────────────

  it('renders the Run Now button', () => {
    render(<OrbitStatusTracker {...DEFAULT_PROPS} />)
    expect(screen.getByRole('button', { name: /Run Now/i })).toBeInTheDocument()
  })

  it('calls onRunNow when Run Now is clicked', () => {
    const onRunNow = vi.fn()
    render(<OrbitStatusTracker {...DEFAULT_PROPS} onRunNow={onRunNow} />)
    fireEvent.click(screen.getByRole('button', { name: /Run Now/i }))
    expect(onRunNow).toHaveBeenCalledTimes(1)
  })
})
