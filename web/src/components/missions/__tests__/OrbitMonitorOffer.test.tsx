import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DEFAULT_MONITOR_KINDS } from '../../../lib/constants/k8sResources'
import type { Mission } from '../../../hooks/useMissions'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => ({
      'missions.orbit.title': 'Want to keep watching this?',
      'missions.orbit.description': 'Set up an orbit to monitor it automatically.',
      'missions.orbit.setupMonitor': 'Set up monitor',
      'missions.orbit.dismiss': 'Dismiss',
    }[key] ?? key),
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}))

import { OrbitMonitorOffer } from '../OrbitMonitorOffer'

function createMission(cluster?: string): Mission {
  return {
    id: 'mission-1',
    title: 'Inspect deployment',
    description: 'Investigate workload health',
    type: 'analyze',
    status: 'completed',
    cluster,
    messages: [],
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
  }
}

describe('OrbitMonitorOffer', () => {
  it('renders the monitoring offer copy and actions', () => {
    render(<OrbitMonitorOffer mission={createMission('cluster-a')} onOpenOrbitDialog={vi.fn()} />)

    expect(screen.getByText('Want to keep watching this?')).toBeInTheDocument()
    expect(screen.getByText('Set up an orbit to monitor it automatically.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Set up monitor' })).toBeInTheDocument()
  })

  it('renders the dismiss action with an accessible label', () => {
    render(<OrbitMonitorOffer mission={createMission('cluster-a')} onOpenOrbitDialog={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument()
  })

  it('does not open the orbit dialog on initial render', () => {
    const onOpenOrbitDialog = vi.fn()

    render(<OrbitMonitorOffer mission={createMission('cluster-a')} onOpenOrbitDialog={onOpenOrbitDialog} />)

    expect(onOpenOrbitDialog).not.toHaveBeenCalled()
  })

  it('opens the orbit dialog when the setup button is pressed', async () => {
    const user = userEvent.setup()
    const onOpenOrbitDialog = vi.fn()

    render(<OrbitMonitorOffer mission={createMission('cluster-a')} onOpenOrbitDialog={onOpenOrbitDialog} />)
    await user.click(screen.getByRole('button', { name: 'Set up monitor' }))

    expect(onOpenOrbitDialog).toHaveBeenCalledTimes(1)
  })

  it('passes the mission cluster as the selected cluster payload', async () => {
    const user = userEvent.setup()
    const onOpenOrbitDialog = vi.fn()

    render(<OrbitMonitorOffer mission={createMission('cluster-a')} onOpenOrbitDialog={onOpenOrbitDialog} />)
    await user.click(screen.getByRole('button', { name: 'Set up monitor' }))

    expect(onOpenOrbitDialog).toHaveBeenCalledWith(expect.objectContaining({ clusters: ['cluster-a'] }))
  })

  it('creates a resource filter entry keyed by the mission cluster', async () => {
    const user = userEvent.setup()
    const onOpenOrbitDialog = vi.fn()

    render(<OrbitMonitorOffer mission={createMission('cluster-a')} onOpenOrbitDialog={onOpenOrbitDialog} />)
    await user.click(screen.getByRole('button', { name: 'Set up monitor' }))

    expect(onOpenOrbitDialog).toHaveBeenCalledWith(expect.objectContaining({
      resourceFilters: expect.objectContaining({
        'cluster-a': expect.any(Array),
      }),
    }))
  })

  it('prefills the default monitor kinds in the orbit dialog payload', async () => {
    const user = userEvent.setup()
    const onOpenOrbitDialog = vi.fn()

    render(<OrbitMonitorOffer mission={createMission('cluster-a')} onOpenOrbitDialog={onOpenOrbitDialog} />)
    await user.click(screen.getByRole('button', { name: 'Set up monitor' }))

    expect(onOpenOrbitDialog).toHaveBeenCalledWith(expect.objectContaining({
      resourceFilters: {
        'cluster-a': DEFAULT_MONITOR_KINDS.map(kind => ({ ...kind })),
      },
    }))
  })

  it('clones each default monitor kind instead of reusing the original objects', async () => {
    const user = userEvent.setup()
    const onOpenOrbitDialog = vi.fn()

    render(<OrbitMonitorOffer mission={createMission('cluster-a')} onOpenOrbitDialog={onOpenOrbitDialog} />)
    await user.click(screen.getByRole('button', { name: 'Set up monitor' }))

    const prefill = onOpenOrbitDialog.mock.calls[0][0] as { resourceFilters: Record<string, typeof DEFAULT_MONITOR_KINDS> }
    prefill.resourceFilters['cluster-a'].forEach((kind, index) => {
      expect(kind).toEqual(DEFAULT_MONITOR_KINDS[index])
      expect(kind).not.toBe(DEFAULT_MONITOR_KINDS[index])
    })
  })

  it('preserves namespaces arrays on copied resource filters', async () => {
    const user = userEvent.setup()
    const onOpenOrbitDialog = vi.fn()

    render(<OrbitMonitorOffer mission={createMission('cluster-a')} onOpenOrbitDialog={onOpenOrbitDialog} />)
    await user.click(screen.getByRole('button', { name: 'Set up monitor' }))

    const prefill = onOpenOrbitDialog.mock.calls[0][0] as { resourceFilters: Record<string, typeof DEFAULT_MONITOR_KINDS> }
    expect(prefill.resourceFilters['cluster-a'].map(kind => kind.namespaces)).toEqual([[], [], []])
  })

  it('passes an empty cluster selection when the mission has no cluster', async () => {
    const user = userEvent.setup()
    const onOpenOrbitDialog = vi.fn()

    render(<OrbitMonitorOffer mission={createMission(undefined)} onOpenOrbitDialog={onOpenOrbitDialog} />)
    await user.click(screen.getByRole('button', { name: 'Set up monitor' }))

    expect(onOpenOrbitDialog).toHaveBeenCalledWith(expect.objectContaining({ clusters: [] }))
  })

  it('passes an empty resource filter map when the mission has no cluster', async () => {
    const user = userEvent.setup()
    const onOpenOrbitDialog = vi.fn()

    render(<OrbitMonitorOffer mission={createMission(undefined)} onOpenOrbitDialog={onOpenOrbitDialog} />)
    await user.click(screen.getByRole('button', { name: 'Set up monitor' }))

    expect(onOpenOrbitDialog).toHaveBeenCalledWith({ clusters: [], resourceFilters: {} })
  })

  it('treats an empty-string cluster as an unscoped mission', async () => {
    const user = userEvent.setup()
    const onOpenOrbitDialog = vi.fn()

    render(<OrbitMonitorOffer mission={createMission('')} onOpenOrbitDialog={onOpenOrbitDialog} />)
    await user.click(screen.getByRole('button', { name: 'Set up monitor' }))

    expect(onOpenOrbitDialog).toHaveBeenCalledWith({ clusters: [], resourceFilters: {} })
  })

  it('hides the offer after the user dismisses it', async () => {
    const user = userEvent.setup()

    render(<OrbitMonitorOffer mission={createMission('cluster-a')} onOpenOrbitDialog={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Dismiss' }))

    expect(screen.queryByText('Want to keep watching this?')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Set up monitor' })).not.toBeInTheDocument()
  })
})
