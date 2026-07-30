import React from 'react'
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Mission } from '../../../hooks/useMissions'
import type { OrbitCadence, OrbitType } from '../../../lib/missions/types'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (!options) return key
      return `${key}:${Object.entries(options).map(([name, value]) => `${name}=${String(value)}`).join(',')}`
    },
  }),
}))

import { OrbitReminderBanner } from '../OrbitReminderBanner'

const NOW = new Date('2025-01-15T12:00:00Z').getTime()
const HOUR_MS = 3_600_000

function createMission(options: {
  id: string
  title: string
  missionClass?: string
  status?: Mission['status']
  cadence?: OrbitCadence | 'mystery'
  orbitType?: OrbitType
  lastRunHoursAgo?: number
  includeOrbitConfig?: boolean
}): Mission {
  const {
    id,
    title,
    missionClass = 'orbit',
    status = 'saved',
    cadence = 'weekly',
    orbitType = 'health-check',
    lastRunHoursAgo = 168,
    includeOrbitConfig = true,
  } = options

  return {
    id,
    title,
    description: `${title} description`,
    type: 'maintain',
    status,
    messages: [],
    createdAt: new Date(NOW),
    updatedAt: new Date(NOW),
    context: includeOrbitConfig
      ? {
          orbitConfig: {
            cadence,
            orbitType,
            lastRunAt: new Date(NOW - (lastRunHoursAgo * HOUR_MS)).toISOString(),
          },
        }
      : {},
    importedFrom: {
      title,
      description: `${title} import`,
      missionClass,
    },
  }
}

describe('OrbitReminderBanner', () => {
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders nothing when there are no missions', () => {
    const { container } = render(<OrbitReminderBanner missions={[]} onRunMission={vi.fn()} />)

    expect(container.firstChild).toBeNull()
  })

  it('filters out non-orbit missions', () => {
    const missions = [createMission({ id: 'non-orbit', title: 'Non Orbit', missionClass: 'fixer' })]
    const { container } = render(<OrbitReminderBanner missions={missions} onRunMission={vi.fn()} />)

    expect(container.firstChild).toBeNull()
  })

  it('filters out orbit missions that are not saved or completed', () => {
    const missions = [createMission({ id: 'running', title: 'Running orbit', status: 'running' })]
    const { container } = render(<OrbitReminderBanner missions={missions} onRunMission={vi.fn()} />)

    expect(container.firstChild).toBeNull()
  })

  it('filters out orbit missions without orbit configuration', () => {
    const missions = [createMission({ id: 'no-config', title: 'No config', includeOrbitConfig: false })]
    const { container } = render(<OrbitReminderBanner missions={missions} onRunMission={vi.fn()} />)

    expect(container.firstChild).toBeNull()
  })

  it('renders the reminder title and count badge', () => {
    render(
      <OrbitReminderBanner
        missions={[createMission({ id: 'one', title: 'One', lastRunHoursAgo: 170 })]}
        onRunMission={vi.fn()}
      />,
    )

    expect(screen.getByText('orbit.reminderTitle')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('uses the purple styling when reminders are due soon but not overdue', () => {
    const { container } = render(
      <OrbitReminderBanner
        missions={[createMission({ id: 'due-soon', title: 'Due soon', lastRunHoursAgo: 166 })]}
        onRunMission={vi.fn()}
      />,
    )

    expect(container.firstChild).toHaveClass('border-purple-500/30')
    expect(container.firstChild).toHaveClass('bg-purple-500/5')
  })

  it('uses the amber styling when at least one reminder is overdue', () => {
    const { container } = render(
      <OrbitReminderBanner
        missions={[createMission({ id: 'overdue', title: 'Overdue', lastRunHoursAgo: 172 })]}
        onRunMission={vi.fn()}
      />,
    )

    expect(container.firstChild).toHaveClass('border-amber-500/30')
    expect(container.firstChild).toHaveClass('bg-amber-500/5')
  })

  it('shows overdue reminders in hours when the overdue duration is under a day', () => {
    render(
      <OrbitReminderBanner
        missions={[createMission({ id: 'hours', title: 'Hours overdue', lastRunHoursAgo: 170 })]}
        onRunMission={vi.fn()}
      />,
    )

    expect(screen.getByText('orbit.overdue:time=2h')).toBeInTheDocument()
  })

  it('shows overdue reminders in days when the overdue duration is at least a day', () => {
    render(
      <OrbitReminderBanner
        missions={[createMission({ id: 'days', title: 'Days overdue', lastRunHoursAgo: 216 })]}
        onRunMission={vi.fn()}
      />,
    )

    expect(screen.getByText('orbit.overdue:time=2d')).toBeInTheDocument()
  })

  it('shows due-soon reminders as less than one hour when appropriate', () => {
    render(
      <OrbitReminderBanner
        missions={[createMission({ id: 'lt-hour', title: 'Soon', lastRunHoursAgo: 167.6 })]}
        onRunMission={vi.fn()}
      />,
    )

    expect(screen.getByText('orbit.dueIn:time=less than 1 hour')).toBeInTheDocument()
  })

  it('shows due-soon reminders as less than one hour inside the grace window', () => {
    render(
      <OrbitReminderBanner
        missions={[createMission({ id: 'hours-away', title: 'Hours away', lastRunHoursAgo: 166 })]}
        onRunMission={vi.fn()}
      />,
    )

    expect(screen.getByText('orbit.dueIn:time=less than 1 hour')).toBeInTheDocument()
  })

  it('falls back to the weekly cadence when a mission has an unknown cadence', () => {
    render(
      <OrbitReminderBanner
        missions={[createMission({ id: 'unknown-cadence', title: 'Unknown cadence', cadence: 'mystery', lastRunHoursAgo: 170 })]}
        onRunMission={vi.fn()}
      />,
    )

    expect(screen.getByText('orbit.overdue:time=2h')).toBeInTheDocument()
  })

  it('shows at most three reminder rows at a time', () => {
    const missions = [
      createMission({ id: 'one', title: 'Mission One', lastRunHoursAgo: 176 }),
      createMission({ id: 'two', title: 'Mission Two', lastRunHoursAgo: 175 }),
      createMission({ id: 'three', title: 'Mission Three', lastRunHoursAgo: 174 }),
      createMission({ id: 'four', title: 'Mission Four', lastRunHoursAgo: 173 }),
    ]

    render(<OrbitReminderBanner missions={missions} onRunMission={vi.fn()} />)

    expect(screen.getByText('Mission One')).toBeInTheDocument()
    expect(screen.getByText('Mission Two')).toBeInTheDocument()
    expect(screen.getByText('Mission Three')).toBeInTheDocument()
    expect(screen.queryByText('Mission Four')).not.toBeInTheDocument()
  })

  it('shows a +N more indicator when additional reminders are hidden', () => {
    const missions = [
      createMission({ id: 'one', title: 'Mission One', lastRunHoursAgo: 176 }),
      createMission({ id: 'two', title: 'Mission Two', lastRunHoursAgo: 175 }),
      createMission({ id: 'three', title: 'Mission Three', lastRunHoursAgo: 174 }),
      createMission({ id: 'four', title: 'Mission Four', lastRunHoursAgo: 173 }),
    ]

    render(<OrbitReminderBanner missions={missions} onRunMission={vi.fn()} />)

    expect(screen.getByText('+1 more')).toBeInTheDocument()
  })

  it('orders reminders by most overdue first', () => {
    const missions = [
      createMission({ id: 'less-overdue', title: 'Less overdue', lastRunHoursAgo: 170 }),
      createMission({ id: 'most-overdue', title: 'Most overdue', lastRunHoursAgo: 180 }),
      createMission({ id: 'due-soon', title: 'Due soon', lastRunHoursAgo: 166 }),
    ]

    render(<OrbitReminderBanner missions={missions} onRunMission={vi.fn()} />)

    const titles = screen.getAllByText(/^(Most overdue|Less overdue|Due soon)$/).map(element => element.textContent)
    expect(titles).toEqual(['Most overdue', 'Less overdue', 'Due soon'])
  })

  it('calls onRunMission with the first rendered reminder id', async () => {
    const user = userEvent.setup()
    const onRunMission = vi.fn()
    const missions = [
      createMission({ id: 'first', title: 'First', lastRunHoursAgo: 176 }),
      createMission({ id: 'second', title: 'Second', lastRunHoursAgo: 174 }),
    ]

    render(<OrbitReminderBanner missions={missions} onRunMission={onRunMission} />)
    await user.click(screen.getAllByRole('button', { name: 'orbit.runNow' })[0])

    expect(onRunMission).toHaveBeenCalledWith('first')
  })

  it('calls onRunMission with the matching reminder id for later rows', async () => {
    const user = userEvent.setup()
    const onRunMission = vi.fn()
    const missions = [
      createMission({ id: 'first', title: 'First', lastRunHoursAgo: 176 }),
      createMission({ id: 'second', title: 'Second', lastRunHoursAgo: 174 }),
    ]

    render(<OrbitReminderBanner missions={missions} onRunMission={onRunMission} />)
    await user.click(screen.getAllByRole('button', { name: 'orbit.runNow' })[1])

    expect(onRunMission).toHaveBeenCalledWith('second')
  })

  it('hides the banner after the dismiss button is pressed', async () => {
    const user = userEvent.setup()
    const missions = [createMission({ id: 'one', title: 'One', lastRunHoursAgo: 170 })]

    render(<OrbitReminderBanner missions={missions} onRunMission={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'orbit.reminderDismiss' }))

    expect(screen.queryByText('orbit.reminderTitle')).not.toBeInTheDocument()
  })
})
