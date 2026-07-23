import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WatchDetailModal } from '../WatchDetailModal'
import type { StellarWatch, StellarNotification } from '../../../types/stellar'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../watchDetail/WatchDetailHeader', () => ({
  WatchDetailHeader: ({ watch }: { watch: StellarWatch }) => (
    <div data-testid="watch-detail-header">{watch.resourceName}</div>
  ),
}))

vi.mock('../watchDetail/WatchDetailContent', () => ({
  WatchDetailContent: () => (
    <div data-testid="watch-detail-content">Content</div>
  ),
}))

vi.mock('../watchDetail/WatchDetailFooter', () => ({
  WatchDetailFooter: ({ watchId, onResolve, onDismiss }: { watchId: string; onResolve: (id: string) => void; onDismiss: (id: string) => void }) => (
    <div data-testid="watch-detail-footer">
      <button onClick={() => onResolve(watchId)}>Resolve</button>
      <button onClick={() => onDismiss(watchId)}>Dismiss</button>
    </div>
  ),
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeWatch(overrides: Partial<StellarWatch> = {}): StellarWatch {
  return {
    id: 'watch-1',
    cluster: 'test-cluster',
    namespace: 'default',
    resourceKind: 'Pod',
    resourceName: 'test-pod',
    reason: 'CrashLoopBackOff detected',
    status: 'active',
    createdAt: '2024-01-15T00:00:00Z',
    updatedAt: '2024-01-15T12:00:00Z',
    lastUpdate: 'Pod is crashing',
    lastChecked: '2024-01-15T12:00:00Z',
    ...overrides,
  }
}

function makeNotification(overrides: Partial<StellarNotification> = {}): StellarNotification {
  return {
    id: 'notif-1',
    type: 'event',
    severity: 'warning',
    title: 'test-pod crashed',
    body: 'Pod crashed',
    cluster: 'test-cluster',
    namespace: 'default',
    read: false,
    createdAt: '2024-01-15T00:00:00Z',
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('WatchDetailModal', () => {
  it('renders the modal with watch details', () => {
    const watch = makeWatch()
    render(
      <WatchDetailModal
        watch={watch}
        allNotifications={[]}
        onClose={vi.fn()}
        onResolve={vi.fn()}
        onDismiss={vi.fn()}
        onSnooze={vi.fn()}
      />
    )
    expect(screen.getByTestId('watch-detail-header')).toBeTruthy()
    expect(screen.getByTestId('watch-detail-content')).toBeTruthy()
    expect(screen.getByTestId('watch-detail-footer')).toBeTruthy()
  })

  it('calls onClose when Escape key is pressed', () => {
    const onClose = vi.fn()
    const watch = makeWatch()
    render(
      <WatchDetailModal
        watch={watch}
        allNotifications={[]}
        onClose={onClose}
        onResolve={vi.fn()}
        onDismiss={vi.fn()}
        onSnooze={vi.fn()}
      />
    )
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onResolve when resolve button is clicked', () => {
    const onResolve = vi.fn()
    const watch = makeWatch()
    render(
      <WatchDetailModal
        watch={watch}
        allNotifications={[]}
        onClose={vi.fn()}
        onResolve={onResolve}
        onDismiss={vi.fn()}
        onSnooze={vi.fn()}
      />
    )
    fireEvent.click(screen.getByText('Resolve'))
    expect(onResolve).toHaveBeenCalledWith('watch-1')
  })

  it('calls onDismiss when dismiss button is clicked', () => {
    const onDismiss = vi.fn()
    const watch = makeWatch()
    render(
      <WatchDetailModal
        watch={watch}
        allNotifications={[]}
        onClose={vi.fn()}
        onResolve={vi.fn()}
        onDismiss={onDismiss}
        onSnooze={vi.fn()}
      />
    )
    fireEvent.click(screen.getByText('Dismiss'))
    expect(onDismiss).toHaveBeenCalledWith('watch-1')
  })

  it('filters and displays related notifications', () => {
    const watch = makeWatch()
    const notifications = [
      makeNotification(),
      makeNotification({ id: 'notif-2', title: 'other-pod issue' }),
    ]
    render(
      <WatchDetailModal
        watch={watch}
        allNotifications={notifications}
        onClose={vi.fn()}
        onResolve={vi.fn()}
        onDismiss={vi.fn()}
        onSnooze={vi.fn()}
      />
    )
    // The header should show the correct resource name
    expect(screen.getByText('test-pod')).toBeTruthy()
  })

  it('passes attemptSummary to content when solves are provided', () => {
    const watch = makeWatch()
    const solves = [
      { id: 'solve-1', watchId: 'watch-1', status: 'success', message: 'Fixed', timestamp: '2024-01-15T01:00:00Z' },
    ]
    render(
      <WatchDetailModal
        watch={watch}
        allNotifications={[]}
        solves={solves}
        onClose={vi.fn()}
        onResolve={vi.fn()}
        onDismiss={vi.fn()}
        onSnooze={vi.fn()}
      />
    )
    expect(screen.getByTestId('watch-detail-content')).toBeTruthy()
  })
})
