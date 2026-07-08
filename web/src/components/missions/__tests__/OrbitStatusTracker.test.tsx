import React from 'react'
import type { ComponentProps } from 'react'
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { OrbitCadence, OrbitRunHistoryEntry } from '../../../lib/missions/types'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (!options) return key
      return `${key}:${Object.entries(options).map(([name, value]) => `${name}=${String(value)}`).join(',')}`
    },
  }),
}))

import { OrbitStatusTracker } from '../OrbitStatusTracker'

const NOW = new Date('2025-01-15T12:00:00Z').getTime()
const HOUR_MS = 3_600_000

function historyEntry(hoursAgo: number, result: OrbitRunHistoryEntry['result'], summary?: string): OrbitRunHistoryEntry {
  return {
    timestamp: new Date(NOW - (hoursAgo * HOUR_MS)).toISOString(),
    result,
    summary,
  }
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(res => {
    resolve = res
  })
  return { promise, resolve }
}

function renderComponent(overrides?: Partial<ComponentProps<typeof OrbitStatusTracker>>) {
  const onRunNow = vi.fn()
  const onChangeCadence = vi.fn()

  const props: ComponentProps<typeof OrbitStatusTracker> = {
    history: [],
    cadence: 'weekly',
    lastRunAt: null,
    onRunNow,
    onChangeCadence,
    ...overrides,
  }

  const view = render(<OrbitStatusTracker {...props} />)
  return { ...view, onRunNow, onChangeCadence }
}

describe('OrbitStatusTracker', () => {
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the never-run state when there is no last run or history', () => {
    renderComponent()

    expect(screen.getAllByText('orbit.neverRun')).toHaveLength(2)
  })

  it('shows the next run in hours when the orbit is due later today', () => {
    renderComponent({ cadence: 'daily', lastRunAt: new Date(NOW - (22 * HOUR_MS)).toISOString() })

    expect(screen.getByText('orbit.dueIn:time=2h')).toBeInTheDocument()
  })

  it('shows the next run in days when the orbit is due on a later day', () => {
    renderComponent({ cadence: 'monthly', lastRunAt: new Date(NOW - (24 * HOUR_MS)).toISOString() })

    expect(screen.getByText('orbit.dueIn:time=29d')).toBeInTheDocument()
  })

  it('shows overdue time in hours when the orbit missed its cadence today', () => {
    renderComponent({ cadence: 'daily', lastRunAt: new Date(NOW - (26 * HOUR_MS)).toISOString() })

    expect(screen.getByText('orbit.overdue:time=2h')).toBeInTheDocument()
  })

  it('shows overdue time in days when the orbit missed its cadence by multiple days', () => {
    renderComponent({ cadence: 'weekly', lastRunAt: new Date(NOW - (216 * HOUR_MS)).toISOString() })

    expect(screen.getByText('orbit.overdue:time=2d')).toBeInTheDocument()
  })

  it('renders success history entries', () => {
    renderComponent({ history: [historyEntry(1, 'success', 'Success summary')] })

    expect(screen.getByText('success')).toBeInTheDocument()
  })

  it('renders warning history entries', () => {
    renderComponent({ history: [historyEntry(1, 'warning', 'Warning summary')] })

    expect(screen.getByText('warning')).toBeInTheDocument()
  })

  it('renders failure history entries', () => {
    renderComponent({ history: [historyEntry(1, 'failure', 'Failure summary')] })

    expect(screen.getByText('failure')).toBeInTheDocument()
  })

  it('shows entry summaries when provided', () => {
    renderComponent({ history: [historyEntry(1, 'success', 'Summary text')] })

    expect(screen.getByText('Summary text')).toBeInTheDocument()
  })

  it('omits the summary paragraph when an entry has no summary', () => {
    renderComponent({ history: [historyEntry(1, 'success')] })

    expect(screen.queryByText('Summary text')).not.toBeInTheDocument()
  })

  it('shows only the first five history entries by default', () => {
    const history = Array.from({ length: 7 }, (_, index) => historyEntry(index + 1, 'success', `summary-${index + 1}`))
    renderComponent({ history })

    expect(screen.getByText('summary-1')).toBeInTheDocument()
    expect(screen.getByText('summary-5')).toBeInTheDocument()
    expect(screen.queryByText('summary-6')).not.toBeInTheDocument()
    expect(screen.queryByText('summary-7')).not.toBeInTheDocument()
  })

  it('does not show a history toggle when there are five or fewer entries', () => {
    const history = Array.from({ length: 5 }, (_, index) => historyEntry(index + 1, 'success', `summary-${index + 1}`))
    renderComponent({ history })

    expect(screen.queryByRole('button', { name: /Show .* more/ })).not.toBeInTheDocument()
  })

  it('shows the hidden history count in the show-more label', () => {
    const history = Array.from({ length: 7 }, (_, index) => historyEntry(index + 1, 'success', `summary-${index + 1}`))
    renderComponent({ history })

    expect(screen.getByRole('button', { name: 'Show 2 more' })).toBeInTheDocument()
  })

  it('reveals additional history entries when show more is clicked', async () => {
    const user = userEvent.setup()
    const history = Array.from({ length: 7 }, (_, index) => historyEntry(index + 1, 'success', `summary-${index + 1}`))
    renderComponent({ history })

    await user.click(screen.getByRole('button', { name: 'Show 2 more' }))

    expect(screen.getByText('summary-6')).toBeInTheDocument()
    expect(screen.getByText('summary-7')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show less' })).toBeInTheDocument()
  })

  it('collapses the extra history entries when show less is clicked', async () => {
    const user = userEvent.setup()
    const history = Array.from({ length: 7 }, (_, index) => historyEntry(index + 1, 'success', `summary-${index + 1}`))
    renderComponent({ history })

    await user.click(screen.getByRole('button', { name: 'Show 2 more' }))
    await user.click(screen.getByRole('button', { name: 'Show less' }))

    expect(screen.queryByText('summary-6')).not.toBeInTheDocument()
    expect(screen.queryByText('summary-7')).not.toBeInTheDocument()
  })

  it('shows the current cadence in the cadence button', () => {
    renderComponent({ cadence: 'monthly' })

    expect(screen.getByRole('button', { name: 'orbit.cadenceMonthly' })).toBeInTheDocument()
  })

  it('opens the cadence menu with every cadence option', async () => {
    const user = userEvent.setup()
    renderComponent({ cadence: 'weekly' })

    await user.click(screen.getByRole('button', { name: 'orbit.cadenceWeekly' }))

    expect(screen.getByRole('button', { name: 'orbit.cadenceDaily' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'orbit.cadenceWeekly' })).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'orbit.cadenceMonthly' })).toBeInTheDocument()
  })

  it('calls onChangeCadence and closes the cadence menu when an option is selected', async () => {
    const user = userEvent.setup()
    const { onChangeCadence } = renderComponent({ cadence: 'weekly' })

    await user.click(screen.getByRole('button', { name: 'orbit.cadenceWeekly' }))
    await user.click(screen.getByRole('button', { name: 'orbit.cadenceDaily' }))

    expect(onChangeCadence).toHaveBeenCalledWith('daily')
    expect(screen.queryByRole('button', { name: 'orbit.cadenceDaily' })).not.toBeInTheDocument()
  })

  it('calls onRunNow when the run-now action is pressed', async () => {
    const user = userEvent.setup()
    const { onRunNow } = renderComponent()

    await user.click(screen.getByRole('button', { name: 'orbit.runNow' }))

    expect(onRunNow).toHaveBeenCalledTimes(1)
  })

  it('shows a loading state while running now', async () => {
    const user = userEvent.setup()
    const deferred = createDeferred<void>()
    const onRunNow = vi.fn(() => deferred.promise)

    render(
      <OrbitStatusTracker
        history={[]}
        cadence="weekly"
        lastRunAt={null}
        onRunNow={onRunNow}
        onChangeCadence={vi.fn()}
      />,
    )

    const button = screen.getByRole('button', { name: 'orbit.runNow' })
    await user.click(button)

    expect(onRunNow).toHaveBeenCalledTimes(1)
    expect(button).toBeDisabled()
    expect(button.querySelector('.animate-spin')).not.toBeNull()

    deferred.resolve()

    await waitFor(() => expect(screen.getByRole('button', { name: 'orbit.runNow' })).not.toBeDisabled())
  })
})
