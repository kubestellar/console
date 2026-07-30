import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ApprovalCard } from './ApprovalCard'
import type { StellarAction } from '../../types/stellar'

const baseAction: StellarAction = {
  id: 'action-1',
  description: 'Restart api-server deployment',
  actionType: 'RestartDeployment',
  parameters: {},
  cluster: 'prod',
  namespace: 'default',
  status: 'pending_approval',
  createdBy: 'stellar',
  createdAt: '2026-06-10T10:00:00Z',
}

describe('ApprovalCard', () => {
  it('renders the action description', () => {
    render(
      <ApprovalCard
        action={baseAction}
        onApprove={vi.fn().mockResolvedValue(undefined)}
        onReject={vi.fn().mockResolvedValue(undefined)}
      />
    )
    expect(screen.getByText('Restart api-server deployment')).toBeInTheDocument()
  })

  it('renders action type and cluster info', () => {
    render(
      <ApprovalCard
        action={baseAction}
        onApprove={vi.fn().mockResolvedValue(undefined)}
        onReject={vi.fn().mockResolvedValue(undefined)}
      />
    )
    expect(screen.getByText(/RestartDeployment/)).toBeInTheDocument()
    expect(screen.getByText(/prod/)).toBeInTheDocument()
  })

  it('calls onApprove with confirmToken when Approve is clicked', async () => {
    const onApprove = vi.fn().mockResolvedValue(undefined)
    const actionWithToken = { ...baseAction, confirmToken: 'tok-abc' }
    render(
      <ApprovalCard
        action={actionWithToken}
        onApprove={onApprove}
        onReject={vi.fn().mockResolvedValue(undefined)}
      />
    )
    fireEvent.click(screen.getByText('Approve'))
    await waitFor(() => expect(onApprove).toHaveBeenCalledWith('tok-abc'))
  })

  it('calls onReject when Reject is clicked', async () => {
    const onReject = vi.fn().mockResolvedValue(undefined)
    render(
      <ApprovalCard
        action={baseAction}
        onApprove={vi.fn().mockResolvedValue(undefined)}
        onReject={onReject}
      />
    )
    fireEvent.click(screen.getByText('Reject'))
    await waitFor(() => expect(onReject).toHaveBeenCalledWith('Rejected by user'))
  })

  it('shows error message when onApprove rejects', async () => {
    const onApprove = vi.fn().mockRejectedValue(new Error('approval failed'))
    render(
      <ApprovalCard
        action={baseAction}
        onApprove={onApprove}
        onReject={vi.fn().mockResolvedValue(undefined)}
      />
    )
    fireEvent.click(screen.getByText('Approve'))
    await waitFor(() => expect(screen.getByText('approval failed')).toBeInTheDocument())
  })

  it('disables buttons while busy', async () => {
    let resolveApprove!: () => void
    const onApprove = vi.fn().mockReturnValue(new Promise<void>(r => { resolveApprove = r }))
    render(
      <ApprovalCard
        action={baseAction}
        onApprove={onApprove}
        onReject={vi.fn().mockResolvedValue(undefined)}
      />
    )
    fireEvent.click(screen.getByText('Approve'))
    await waitFor(() => expect(screen.getByText('...')).toBeInTheDocument())
    expect(screen.getByText('...')).toBeDisabled()
    resolveApprove()
  })
})
