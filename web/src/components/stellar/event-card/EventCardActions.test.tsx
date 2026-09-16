import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EventCardActions } from './EventCardActions'
import type { StellarNotification } from '../../../types/stellar'
import type { SolveStatus } from '../lib/derive'

const baseNotification: StellarNotification = {
  id: 'evt-1',
  type: 'event',
  severity: 'warning',
  title: 'Pod CrashLoopBackOff',
  body: 'pod is crashing',
  read: false,
  createdAt: new Date().toISOString(),
  namespace: 'default',
  cluster: 'cluster-a',
}

function makeSolveStatus(overrides: Partial<SolveStatus> = {}): SolveStatus {
  return {
    label: 'Investigating',
    color: '#0af',
    isActive: true,
    percent: 20,
    phase: 'investigating',
    ...overrides,
  }
}

describe('EventCardActions', () => {
  it('always renders a dismiss button that calls onDismiss', async () => {
    const onDismiss = vi.fn()
    const user = userEvent.setup()
    render(
      <EventCardActions
        notification={baseNotification}
        hints={[]}
        showRollback={false}
        onDismiss={onDismiss}
      />
    )

    await user.click(screen.getByText('actions.dismiss'))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('renders a rollback button when showRollback is true and onRollback is provided', async () => {
    const onRollback = vi.fn()
    const user = userEvent.setup()
    render(
      <EventCardActions
        notification={baseNotification}
        hints={[]}
        showRollback={true}
        onDismiss={vi.fn()}
        onRollback={onRollback}
      />
    )

    await user.click(screen.getByRole('button', { name: /undoThis/ }))
    expect(onRollback).toHaveBeenCalledTimes(1)
  })

  it('does not render a rollback button when showRollback is false', () => {
    render(
      <EventCardActions
        notification={baseNotification}
        hints={[]}
        showRollback={false}
        onDismiss={vi.fn()}
        onRollback={vi.fn()}
      />
    )
    expect(screen.queryByText('stellar.eventCard.undoThis')).not.toBeInTheDocument()
  })

  it('renders hint action buttons and invokes onAction with a built prompt', async () => {
    const onAction = vi.fn()
    const user = userEvent.setup()
    render(
      <EventCardActions
        notification={baseNotification}
        hints={['restart']}
        showRollback={false}
        onDismiss={vi.fn()}
        onAction={onAction}
      />
    )

    await user.click(screen.getByText('stellar.eventCard.actions.restart'))
    expect(onAction).toHaveBeenCalledTimes(1)
    expect(onAction.mock.calls[0][1]).toMatchObject({
      actionType: 'RestartDeployment',
      cluster: 'cluster-a',
      namespace: 'default',
    })
  })

  it('hides manual action hints while Stellar is actively auto-handling', () => {
    render(
      <EventCardActions
        notification={baseNotification}
        solveStatus={makeSolveStatus({ isActive: true, phase: 'investigating' })}
        hints={['restart']}
        showRollback={false}
        onDismiss={vi.fn()}
      />
    )
    expect(screen.queryByText('stellar.eventCard.actions.restart')).not.toBeInTheDocument()
    expect(screen.getByText('stellar.eventCard.autoHandling')).toBeVisible()
  })

  it('shows a "try AI mission" button when escalated and onSolve is provided', async () => {
    const onSolve = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(
      <EventCardActions
        notification={baseNotification}
        solveStatus={makeSolveStatus({ isActive: false, phase: 'escalated' })}
        hints={[]}
        showRollback={false}
        onDismiss={vi.fn()}
        onSolve={onSolve}
      />
    )

    const tryButton = screen.getByText('stellar.eventCard.tryAiMission')
    expect(tryButton).toBeVisible()
    await user.click(tryButton)
    expect(onSolve).toHaveBeenCalledWith('evt-1')
  })
})
