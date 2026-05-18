/**
 * OrbitReminderBanner unit tests
 *
 * Covers: null when no orbit missions, null when dismissed, overdue/due-in
 * display, badge count, 3-item cap with "+N more", dismiss button,
 * run-now callback, and sorting by overdue hours.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// ── Module mocks ─────────────────────────────────────────────────────────

vi.mock('../../../lib/constants/orbit', () => ({
  ORBIT_CADENCE_HOURS: { daily: 24, weekly: 168, monthly: 720 },
  ORBIT_OVERDUE_GRACE_HOURS: 4,
}))

vi.mock('../../../lib/constants/time', () => ({
  HOURS_PER_DAY: 24,
}))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (key === 'orbit.reminderTitle') return 'Orbit Reminders'
      if (key === 'orbit.reminderDismiss') return 'Dismiss reminders'
      if (key === 'orbit.runNow') return 'Run Now'
      if (key === 'orbit.overdue') return `Overdue by ${opts?.time}`
      if (key === 'orbit.dueIn') return `Due in ${opts?.time}`
      return key
    },
  }),
}))

import { OrbitReminderBanner } from '../OrbitReminderBanner'
import type { Mission } from '../../../hooks/useMissions'

// ── Fixtures ─────────────────────────────────────────────────────────────

const NOW = Date.now()

function makeOrbitMission(overrides: {
  id?: string
  title?: string
  cadence?: 'daily' | 'weekly' | 'monthly'
  lastRunAtHoursAgo?: number
  status?: string
}): Mission {
  const { id = 'orbit-1', title = 'Health Check', cadence = 'weekly', lastRunAtHoursAgo = 200, status = 'saved' } = overrides
  const lastRunAt = new Date(NOW - lastRunAtHoursAgo * 3_600_000).toISOString()
  return {
    id,
    title,
    status,
    description: '',
    agent: 'claude',
    cluster: 'prod',
    messages: [],
    createdAt: new Date(NOW - 3 * 24 * 3_600_000).toISOString(),
    importedFrom: { missionClass: 'orbit' },
    context: {
      orbitConfig: {
        orbitType: 'health-check',
        cadence,
        lastRunAt,
        autoRun: false,
        projects: [],
        clusters: ['prod'],
        resourceFilters: {},
      },
    },
  } as unknown as Mission
}

function makeNonOrbitMission(): Mission {
  return {
    id: 'plain-1',
    title: 'Plain mission',
    status: 'completed',
    description: '',
    agent: 'claude',
    cluster: 'prod',
    messages: [],
    createdAt: new Date().toISOString(),
  } as unknown as Mission
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('OrbitReminderBanner', () => {
  const onRunMission = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Null states ───────────────────────────────────────────────────────

  it('renders nothing when missions list is empty', () => {
    const { container } = render(<OrbitReminderBanner missions={[]} onRunMission={onRunMission} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders nothing when no missions qualify as orbit reminders', () => {
    const { container } = render(
      <OrbitReminderBanner missions={[makeNonOrbitMission()]} onRunMission={onRunMission} />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders nothing when dismissed', () => {
    const { container } = render(
      <OrbitReminderBanner missions={[makeOrbitMission({ lastRunAtHoursAgo: 200 })]} onRunMission={onRunMission} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Dismiss reminders/i }))
    expect(container.innerHTML).toBe('')
  })

  // ── Rendering ────────────────────────────────────────────────────────

  it('renders the reminder title', () => {
    render(<OrbitReminderBanner missions={[makeOrbitMission({ lastRunAtHoursAgo: 200 })]} onRunMission={onRunMission} />)
    expect(screen.getByText('Orbit Reminders')).toBeInTheDocument()
  })

  it('shows the mission title', () => {
    render(
      <OrbitReminderBanner
        missions={[makeOrbitMission({ title: 'Health Check', lastRunAtHoursAgo: 200 })]}
        onRunMission={onRunMission}
      />,
    )
    expect(screen.getByText('Health Check')).toBeInTheDocument()
  })

  it('shows the reminder count badge', () => {
    const missions = [
      makeOrbitMission({ id: '1', lastRunAtHoursAgo: 200 }),
      makeOrbitMission({ id: '2', lastRunAtHoursAgo: 300 }),
    ]
    render(<OrbitReminderBanner missions={missions} onRunMission={onRunMission} />)
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('shows Run Now button for each reminder', () => {
    const missions = [
      makeOrbitMission({ id: '1', lastRunAtHoursAgo: 200 }),
      makeOrbitMission({ id: '2', lastRunAtHoursAgo: 300 }),
    ]
    render(<OrbitReminderBanner missions={missions} onRunMission={onRunMission} />)
    const buttons = screen.getAllByRole('button', { name: /Run Now/i })
    expect(buttons.length).toBe(2)
  })

  // ── Overdue vs due-in display ─────────────────────────────────────────

  it('shows "Overdue by" when mission is past cadence', () => {
    // weekly = 168h, ran 200h ago → overdue by 32h
    render(
      <OrbitReminderBanner
        missions={[makeOrbitMission({ cadence: 'weekly', lastRunAtHoursAgo: 200 })]}
        onRunMission={onRunMission}
      />,
    )
    expect(screen.getByText(/Overdue by/i)).toBeInTheDocument()
  })

  it('shows "Due in" when mission is within grace period but not yet overdue', () => {
    // weekly = 168h, grace = 4h → run 165h ago means overdue = -3 → within grace → shows as due
    render(
      <OrbitReminderBanner
        missions={[makeOrbitMission({ cadence: 'weekly', lastRunAtHoursAgo: 165 })]}
        onRunMission={onRunMission}
      />,
    )
    expect(screen.getByText(/Due in/i)).toBeInTheDocument()
  })

  // ── 3-item cap ────────────────────────────────────────────────────────

  it('shows at most 3 reminders', () => {
    const missions = [
      makeOrbitMission({ id: '1', title: 'Mission 1', lastRunAtHoursAgo: 500 }),
      makeOrbitMission({ id: '2', title: 'Mission 2', lastRunAtHoursAgo: 400 }),
      makeOrbitMission({ id: '3', title: 'Mission 3', lastRunAtHoursAgo: 300 }),
      makeOrbitMission({ id: '4', title: 'Mission 4', lastRunAtHoursAgo: 200 }),
    ]
    render(<OrbitReminderBanner missions={missions} onRunMission={onRunMission} />)
    expect(screen.queryByText('Mission 4')).not.toBeInTheDocument()
    expect(screen.getByText('+1 more')).toBeInTheDocument()
  })

  it('shows "+N more" text for all items beyond 3', () => {
    const missions = Array.from({ length: 6 }, (_, i) =>
      makeOrbitMission({ id: `m-${i}`, title: `Mission ${i}`, lastRunAtHoursAgo: 200 + i * 10 }),
    )
    render(<OrbitReminderBanner missions={missions} onRunMission={onRunMission} />)
    expect(screen.getByText('+3 more')).toBeInTheDocument()
  })

  // ── Callbacks ────────────────────────────────────────────────────────

  it('calls onRunMission with the correct missionId when Run Now is clicked', () => {
    render(
      <OrbitReminderBanner
        missions={[makeOrbitMission({ id: 'orbit-abc', lastRunAtHoursAgo: 200 })]}
        onRunMission={onRunMission}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Run Now/i }))
    expect(onRunMission).toHaveBeenCalledWith('orbit-abc')
  })

  it('calls onRunMission with the right id when multiple missions shown', () => {
    const missions = [
      makeOrbitMission({ id: 'first', title: 'First', lastRunAtHoursAgo: 500 }),
      makeOrbitMission({ id: 'second', title: 'Second', lastRunAtHoursAgo: 200 }),
    ]
    render(<OrbitReminderBanner missions={missions} onRunMission={onRunMission} />)
    const buttons = screen.getAllByRole('button', { name: /Run Now/i })
    fireEvent.click(buttons[0])
    expect(onRunMission).toHaveBeenCalledWith('first')
  })

  // ── Filtering ────────────────────────────────────────────────────────

  it('ignores missions not of missionClass orbit', () => {
    const { container } = render(
      <OrbitReminderBanner
        missions={[makeNonOrbitMission(), makeNonOrbitMission()]}
        onRunMission={onRunMission}
      />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('ignores orbit missions with status other than saved or completed', () => {
    const mission = makeOrbitMission({ status: 'running', lastRunAtHoursAgo: 200 })
    const { container } = render(
      <OrbitReminderBanner missions={[mission]} onRunMission={onRunMission} />,
    )
    expect(container.innerHTML).toBe('')
  })
})
