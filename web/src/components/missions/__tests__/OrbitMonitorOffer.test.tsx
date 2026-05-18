/**
 * OrbitMonitorOffer unit tests
 *
 * Covers: render, dismiss behaviour, "Set up monitor" click,
 * cluster/resourceFilters payload, and no-cluster edge case.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// ── Module mocks ─────────────────────────────────────────────────────────

vi.mock('../../../lib/constants/k8sResources', () => ({
  DEFAULT_MONITOR_KINDS: [
    { kind: 'Deployment', clusterScoped: false, namespaces: [] },
    { kind: 'Pod', clusterScoped: false, namespaces: [] },
    { kind: 'Service', clusterScoped: false, namespaces: [] },
  ],
}))

import { OrbitMonitorOffer } from '../OrbitMonitorOffer'
import type { Mission } from '../../../hooks/useMissions'

// ── Fixtures ─────────────────────────────────────────────────────────────

function makeMission(overrides: Partial<Mission> = {}): Mission {
  return {
    id: 'mission-1',
    title: 'Debug nginx crash',
    description: 'nginx crashloop',
    cluster: 'prod-cluster',
    status: 'completed',
    agent: 'claude',
    messages: [],
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  } as Mission
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('OrbitMonitorOffer', () => {
  const onOpenOrbitDialog = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Rendering ────────────────────────────────────────────────────────

  it('renders the offer text', () => {
    render(<OrbitMonitorOffer mission={makeMission()} onOpenOrbitDialog={onOpenOrbitDialog} />)
    expect(screen.getByText(/Want to keep watching this/i)).toBeInTheDocument()
  })

  it('renders the subtitle text', () => {
    render(<OrbitMonitorOffer mission={makeMission()} onOpenOrbitDialog={onOpenOrbitDialog} />)
    expect(screen.getByText(/Set up an orbit to monitor it automatically/i)).toBeInTheDocument()
  })

  it('renders the "Set up monitor" button', () => {
    render(<OrbitMonitorOffer mission={makeMission()} onOpenOrbitDialog={onOpenOrbitDialog} />)
    expect(screen.getByRole('button', { name: /Set up monitor/i })).toBeInTheDocument()
  })

  it('renders the dismiss button', () => {
    render(<OrbitMonitorOffer mission={makeMission()} onOpenOrbitDialog={onOpenOrbitDialog} />)
    expect(screen.getByRole('button', { name: /Dismiss/i })).toBeInTheDocument()
  })

  // ── Dismiss ──────────────────────────────────────────────────────────

  it('hides the component when dismiss is clicked', () => {
    const { container } = render(
      <OrbitMonitorOffer mission={makeMission()} onOpenOrbitDialog={onOpenOrbitDialog} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Dismiss/i }))
    expect(container.innerHTML).toBe('')
  })

  it('does not call onOpenOrbitDialog when dismiss is clicked', () => {
    render(<OrbitMonitorOffer mission={makeMission()} onOpenOrbitDialog={onOpenOrbitDialog} />)
    fireEvent.click(screen.getByRole('button', { name: /Dismiss/i }))
    expect(onOpenOrbitDialog).not.toHaveBeenCalled()
  })

  // ── Set up monitor ───────────────────────────────────────────────────

  it('calls onOpenOrbitDialog when "Set up monitor" is clicked', () => {
    render(<OrbitMonitorOffer mission={makeMission()} onOpenOrbitDialog={onOpenOrbitDialog} />)
    fireEvent.click(screen.getByRole('button', { name: /Set up monitor/i }))
    expect(onOpenOrbitDialog).toHaveBeenCalledTimes(1)
  })

  it('passes the mission cluster in the dialog payload', () => {
    render(<OrbitMonitorOffer mission={makeMission({ cluster: 'prod-cluster' })} onOpenOrbitDialog={onOpenOrbitDialog} />)
    fireEvent.click(screen.getByRole('button', { name: /Set up monitor/i }))
    expect(onOpenOrbitDialog).toHaveBeenCalledWith(
      expect.objectContaining({ clusters: ['prod-cluster'] }),
    )
  })

  it('passes resource filters for the mission cluster', () => {
    render(<OrbitMonitorOffer mission={makeMission({ cluster: 'prod-cluster' })} onOpenOrbitDialog={onOpenOrbitDialog} />)
    fireEvent.click(screen.getByRole('button', { name: /Set up monitor/i }))
    const payload = onOpenOrbitDialog.mock.calls[0][0]
    expect(payload.resourceFilters).toHaveProperty('prod-cluster')
    expect(payload.resourceFilters['prod-cluster'].length).toBe(3)
  })

  it('passes empty clusters when mission has no cluster', () => {
    render(
      <OrbitMonitorOffer
        mission={makeMission({ cluster: undefined })}
        onOpenOrbitDialog={onOpenOrbitDialog}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Set up monitor/i }))
    expect(onOpenOrbitDialog).toHaveBeenCalledWith(
      expect.objectContaining({ clusters: [] }),
    )
  })

  it('passes empty resourceFilters when mission has no cluster', () => {
    render(
      <OrbitMonitorOffer
        mission={makeMission({ cluster: undefined })}
        onOpenOrbitDialog={onOpenOrbitDialog}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Set up monitor/i }))
    const payload = onOpenOrbitDialog.mock.calls[0][0]
    expect(payload.resourceFilters).toEqual({})
  })
})
