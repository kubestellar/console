import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { WatchCard } from './WatchCard'
import type { StellarWatch } from '../../types/stellar'

vi.mock('./lib/derive', () => ({
  deriveWatchTrend: () => ({ trend: 'rising', recent: 3, prior: 1, sparkline: [1, 2, 3] }),
  getWatchAttemptSummary: () => null,
  renderSparkline: () => '▁▃▅',
  trendColor: () => 'var(--s-warning)',
  trendIcon: () => '↑',
}))

const baseWatch: StellarWatch = {
  id: 'watch-1',
  cluster: 'prod',
  namespace: 'default',
  resourceKind: 'Deployment',
  resourceName: 'api-server',
  reason: 'recurring OOM events',
  status: 'active',
  lastUpdate: 'Pods restarting frequently',
  createdAt: '2026-06-10T10:00:00Z',
  updatedAt: '2026-06-10T10:00:00Z',
}

describe('WatchCard', () => {
  it('renders the resource name', () => {
    render(
      <WatchCard
        watch={baseWatch}
        onResolve={vi.fn()}
        onDismiss={vi.fn()}
        onSnooze={vi.fn()}
      />
    )
    expect(screen.getByText('api-server')).toBeInTheDocument()
  })

  it('renders the namespace', () => {
    render(
      <WatchCard
        watch={baseWatch}
        onResolve={vi.fn()}
        onDismiss={vi.fn()}
        onSnooze={vi.fn()}
      />
    )
    expect(screen.getByText('default')).toBeInTheDocument()
  })

  it('renders the resource kind', () => {
    render(
      <WatchCard
        watch={baseWatch}
        onResolve={vi.fn()}
        onDismiss={vi.fn()}
        onSnooze={vi.fn()}
      />
    )
    expect(screen.getByText('Deployment')).toBeInTheDocument()
  })

  it('renders the watch reason', () => {
    render(
      <WatchCard
        watch={baseWatch}
        onResolve={vi.fn()}
        onDismiss={vi.fn()}
        onSnooze={vi.fn()}
      />
    )
    expect(screen.getByText('recurring OOM events')).toBeInTheDocument()
  })

  it('renders lastUpdate text', () => {
    render(
      <WatchCard
        watch={baseWatch}
        onResolve={vi.fn()}
        onDismiss={vi.fn()}
        onSnooze={vi.fn()}
      />
    )
    expect(screen.getByText('Pods restarting frequently')).toBeInTheDocument()
  })

  it('calls onOpenDetail when the card is clicked', () => {
    const onOpenDetail = vi.fn()
    render(
      <WatchCard
        watch={baseWatch}
        onResolve={vi.fn()}
        onDismiss={vi.fn()}
        onSnooze={vi.fn()}
        onOpenDetail={onOpenDetail}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /Open watch details/ }))
    expect(onOpenDetail).toHaveBeenCalledWith(baseWatch)
  })

  it('calls onOpenDetail on Enter key', () => {
    const onOpenDetail = vi.fn()
    render(
      <WatchCard
        watch={baseWatch}
        onResolve={vi.fn()}
        onDismiss={vi.fn()}
        onSnooze={vi.fn()}
        onOpenDetail={onOpenDetail}
      />
    )
    fireEvent.keyDown(screen.getByRole('button', { name: /Open watch details/ }), { key: 'Enter' })
    expect(onOpenDetail).toHaveBeenCalledWith(baseWatch)
  })

  it('shows investigate and restart buttons when onAction is provided', () => {
    render(
      <WatchCard
        watch={baseWatch}
        onResolve={vi.fn()}
        onDismiss={vi.fn()}
        onSnooze={vi.fn()}
        onAction={vi.fn()}
      />
    )
    expect(screen.getByText('🔍 Investigate')).toBeInTheDocument()
    expect(screen.getByText('↻ Restart now')).toBeInTheDocument()
  })

  it('calls onAction with investigate prompt when Investigate is clicked', () => {
    const onAction = vi.fn()
    render(
      <WatchCard
        watch={baseWatch}
        onResolve={vi.fn()}
        onDismiss={vi.fn()}
        onSnooze={vi.fn()}
        onAction={onAction}
      />
    )
    fireEvent.click(screen.getByText('🔍 Investigate'))
    expect(onAction).toHaveBeenCalledWith(expect.stringContaining('api-server'))
  })

  it('renders stale indicator for old lastChecked', () => {
    const staleWatch = {
      ...baseWatch,
      lastChecked: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
    }
    render(
      <WatchCard
        watch={staleWatch}
        onResolve={vi.fn()}
        onDismiss={vi.fn()}
        onSnooze={vi.fn()}
      />
    )
    expect(screen.getByText(/last checked/)).toBeInTheDocument()
  })
})
