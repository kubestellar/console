import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WatchDetailHeader } from '../WatchDetailHeader'
import type { StellarWatch } from '../../../../types/stellar'

// Mock Tag so CSS-variable inline styles don't interfere with assertions
vi.mock('../WatchDetailPrimitives', () => ({
  Tag: ({ label }: { label: string }) => <span data-testid="tag">{label}</span>,
}))

const BASE_WATCH: StellarWatch = {
  id: 'w1',
  cluster: 'cluster-a',
  namespace: 'default',
  resourceKind: 'Deployment',
  resourceName: 'my-app',
  reason: 'CrashLoopBackOff',
  status: 'active',
  lastUpdate: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

function renderHeader(overrides: Partial<React.ComponentProps<typeof WatchDetailHeader>> = {}) {
  const defaults: React.ComponentProps<typeof WatchDetailHeader> = {
    watch: BASE_WATCH,
    titleId: 'header-title',
    color: 'var(--s-info)',
    dominantSeverity: 'warning',
    isRecurring: false,
    isStale: false,
    canRestart: false,
    watchAgeMs: 90_000, // 1m 30s → formatDuration returns "1m"
    onClose: vi.fn(),
  }
  return render(<WatchDetailHeader {...defaults} {...overrides} />)
}

describe('WatchDetailHeader', () => {
  it('renders without crashing', () => {
    const { container } = renderHeader()
    expect(container.firstChild).toBeTruthy()
  })

  it('displays namespace/resourceName as the title', () => {
    renderHeader()
    expect(screen.getByText('default/my-app')).toBeTruthy()
  })

  it('displays the cluster name', () => {
    renderHeader()
    expect(screen.getByText('cluster-a')).toBeTruthy()
  })

  it('includes resourceKind in the subtitle', () => {
    renderHeader()
    expect(screen.getByText(/Deployment/)).toBeTruthy()
  })

  it('shows the dominantSeverity tag', () => {
    renderHeader({ dominantSeverity: 'critical' })
    const tags = screen.getAllByTestId('tag')
    expect(tags.some(t => t.textContent === 'critical')).toBe(true)
  })

  it('shows the watch status tag', () => {
    renderHeader()
    const tags = screen.getAllByTestId('tag')
    expect(tags.some(t => t.textContent === 'active')).toBe(true)
  })

  it('does not show the "recurring" tag when isRecurring is false', () => {
    renderHeader({ isRecurring: false })
    expect(screen.queryByText('recurring')).toBeNull()
  })

  it('shows the "recurring" tag when isRecurring is true', () => {
    renderHeader({ isRecurring: true })
    expect(screen.getByText('recurring')).toBeTruthy()
  })

  it('shows the "stale" tag when isStale is truthy', () => {
    renderHeader({ isStale: true })
    expect(screen.getByText('stale')).toBeTruthy()
  })

  it('shows the "auto-fixable" tag when canRestart is true', () => {
    renderHeader({ canRestart: true })
    expect(screen.getByText('auto-fixable')).toBeTruthy()
  })

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn()
    renderHeader({ onClose })
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
