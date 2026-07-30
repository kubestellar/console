import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WatchDetailContent } from '../WatchDetailContent'
import type { StellarWatch, StellarNotification } from '../../../../types/stellar'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../WatchDetailPrimitives', () => ({
  Section: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div data-testid="section" data-title={title}>{children}</div>
  ),
  SectionHeader: ({ title }: { title: string }) => (
    <div data-testid="section-header">{title}</div>
  ),
  Stat: ({ label, value }: { label: string; value: string }) => (
    <div data-testid="stat" data-label={label}>{value}</div>
  ),
  Recommendation: ({
    label,
    onExecute,
  }: {
    label: string
    rationale: string
    confidence: number
    color: string
    onExecute: () => void
  }) => (
    <button data-testid="recommendation" onClick={onExecute}>
      {label}
    </button>
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
    lastUpdate: 'Pod is crashing',
    lastChecked: '2024-01-15T12:00:00Z',
    createdAt: '2024-01-15T00:00:00Z',
    updatedAt: '2024-01-15T00:00:00Z',
    ...overrides,
  }
}

function makeNotification(overrides: Partial<StellarNotification> = {}): StellarNotification {
  return {
    id: 'notif-1',
    type: 'event',
    severity: 'warning',
    title: 'Pod crashed',
    body: 'Pod crashed unexpectedly',
    cluster: 'test-cluster',
    namespace: 'default',
    read: false,
    createdAt: '2024-01-15T00:00:00Z',
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('WatchDetailContent', () => {
  it('renders the reason section when watch has a reason', () => {
    const watch = makeWatch()
    render(
      <WatchDetailContent
        watch={watch}
        relatedEvents={[]}
        attemptSummary={null}
        totalEvents={0}
        last24h={0}
        criticalCount={0}
        warningCount={0}
        color="#fff"
        isStale={false}
        isRecurring={false}
        canRestart={false}
        deploymentName="test-deployment"
        investigatePrompt="Investigate"
        restartPrompt="Restart"
        onClose={vi.fn()}
      />
    )
    expect(screen.getByText('CrashLoopBackOff detected')).toBeTruthy()
  })

  it('renders stats section with correct values', () => {
    const watch = makeWatch()
    render(
      <WatchDetailContent
        watch={watch}
        relatedEvents={[]}
        attemptSummary={null}
        totalEvents={10}
        last24h={5}
        criticalCount={2}
        warningCount={3}
        color="#fff"
        isStale={false}
        isRecurring={false}
        canRestart={false}
        deploymentName="test-deployment"
        investigatePrompt="Investigate"
        restartPrompt="Restart"
        onClose={vi.fn()}
      />
    )
    const stats = screen.getAllByTestId('stat')
    expect(stats[0].textContent).toBe('10')
    expect(stats[1].textContent).toBe('5')
    expect(stats[2].textContent).toBe('2')
    expect(stats[3].textContent).toBe('3')
  })

  it('renders latest observation when watch has lastUpdate', () => {
    const watch = makeWatch({ lastUpdate: 'Pod is crashing' })
    render(
      <WatchDetailContent
        watch={watch}
        relatedEvents={[]}
        attemptSummary={null}
        totalEvents={0}
        last24h={0}
        criticalCount={0}
        warningCount={0}
        color="#fff"
        isStale={false}
        isRecurring={false}
        canRestart={false}
        deploymentName="test-deployment"
        investigatePrompt="Investigate"
        restartPrompt="Restart"
        onClose={vi.fn()}
      />
    )
    expect(screen.getByText('Pod is crashing')).toBeTruthy()
  })

  it('renders recommendations when onAction is provided', () => {
    const watch = makeWatch()
    const onAction = vi.fn()
    render(
      <WatchDetailContent
        watch={watch}
        relatedEvents={[]}
        attemptSummary={null}
        totalEvents={0}
        last24h={0}
        criticalCount={0}
        warningCount={0}
        color="#fff"
        isStale={false}
        isRecurring={false}
        canRestart={false}
        deploymentName="test-deployment"
        investigatePrompt="Investigate"
        restartPrompt="Restart"
        onAction={onAction}
        onClose={vi.fn()}
      />
    )
    expect(screen.getAllByTestId('recommendation').length).toBeGreaterThan(0)
  })

  it('displays event timeline when related events are provided', () => {
    const watch = makeWatch()
    const events = [
      makeNotification({ title: 'Pod crashed' }),
      makeNotification({ id: 'notif-2', severity: 'critical', title: 'Critical failure' }),
    ]
    render(
      <WatchDetailContent
        watch={watch}
        relatedEvents={events}
        attemptSummary={null}
        totalEvents={2}
        last24h={2}
        criticalCount={1}
        warningCount={1}
        color="#fff"
        isStale={false}
        isRecurring={false}
        canRestart={false}
        deploymentName="test-deployment"
        investigatePrompt="Investigate"
        restartPrompt="Restart"
        onClose={vi.fn()}
      />
    )
    // The component renders ev.title in the event timeline
    expect(screen.getByText('Pod crashed')).toBeTruthy()
  })

  it('shows attempt summary section headers when provided', () => {
    const watch = makeWatch()
    const attemptSummary = {
      total: 3,
      resolved: 1,
      escalated: 1,
      paused: 1,
      recent: [],
    }
    render(
      <WatchDetailContent
        watch={watch}
        relatedEvents={[]}
        attemptSummary={attemptSummary}
        totalEvents={0}
        last24h={0}
        criticalCount={0}
        warningCount={0}
        color="#fff"
        isStale={false}
        isRecurring={false}
        canRestart={false}
        deploymentName="test-deployment"
        investigatePrompt="Investigate"
        restartPrompt="Restart"
        onClose={vi.fn()}
      />
    )
    expect(screen.getAllByTestId('section-header').length).toBeGreaterThan(0)
  })
})
