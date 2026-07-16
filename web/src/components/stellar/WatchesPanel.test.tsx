import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { WatchesPanel } from './WatchesPanel'
import type { StellarWatch } from '../../types/stellar'

vi.mock('./WatchCard', () => ({
  WatchCard: ({ watch }: { watch: StellarWatch }) => (
    <div data-testid={`watch-card-${watch.id}`}>{watch.resourceName}</div>
  ),
}))

vi.mock('./WatchDetailModal', () => ({
  WatchDetailModal: ({ watch, onClose }: { watch: StellarWatch; onClose: () => void }) => (
    <div data-testid="watch-detail-modal">
      <span>{watch.resourceName}</span>
      <button onClick={onClose}>Close</button>
    </div>
  ),
}))

const makeWatch = (overrides: Partial<StellarWatch> = {}): StellarWatch => ({
  id: 'watch-1',
  cluster: 'prod',
  namespace: 'default',
  resourceKind: 'Deployment',
  resourceName: 'my-app',
  reason: 'High restart count',
  status: 'active',
  lastUpdate: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
})

describe('WatchesPanel', () => {
  it('returns null when there are no active watches', () => {
    const { container } = render(
      <WatchesPanel
        watches={[makeWatch({ status: 'resolved' })]}
        onResolve={() => {}}
        onDismiss={() => {}}
        onSnooze={() => {}}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders the Watching header', () => {
    render(
      <WatchesPanel
        watches={[makeWatch()]}
        onResolve={() => {}}
        onDismiss={() => {}}
        onSnooze={() => {}}
      />
    )
    expect(screen.getByText('Watching')).toBeInTheDocument()
  })

  it('shows active watch count badge', () => {
    render(
      <WatchesPanel
        watches={[makeWatch(), makeWatch({ id: 'watch-2', resourceName: 'other-app' })]}
        onResolve={() => {}}
        onDismiss={() => {}}
        onSnooze={() => {}}
      />
    )
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('renders WatchCard for each active watch', () => {
    render(
      <WatchesPanel
        watches={[makeWatch()]}
        onResolve={() => {}}
        onDismiss={() => {}}
        onSnooze={() => {}}
      />
    )
    expect(screen.getByTestId('watch-card-watch-1')).toBeInTheDocument()
    expect(screen.getByText('my-app')).toBeInTheDocument()
  })

  it('collapses watch list when header is clicked', () => {
    render(
      <WatchesPanel
        watches={[makeWatch()]}
        onResolve={() => {}}
        onDismiss={() => {}}
        onSnooze={() => {}}
      />
    )
    fireEvent.click(screen.getByText('Watching').closest('div') as HTMLElement)
    expect(screen.queryByTestId('watch-card-watch-1')).not.toBeInTheDocument()
  })
})
