import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { HelmActionFeedbackBanner, HelmConfirmActionBanner } from './HelmActionBanner'
import type { ConfirmActionState } from './types'

describe('HelmActionFeedbackBanner', () => {
  it('renders nothing without feedback', () => {
    const { container } = render(<HelmActionFeedbackBanner actionFeedback={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders success styling', () => {
    render(<HelmActionFeedbackBanner actionFeedback={{ success: true, message: 'Rolled back' }} />)
    expect(screen.getByText('Rolled back')).toHaveClass('text-green-400')
  })

  it('renders failure styling', () => {
    render(<HelmActionFeedbackBanner actionFeedback={{ success: false, message: 'Boom' }} />)
    expect(screen.getByText('Boom')).toHaveClass('text-red-400')
  })
})

describe('HelmConfirmActionBanner', () => {
  const rollback: ConfirmActionState = { type: 'rollback', label: 'Confirm Rollback', revision: 2 }
  const uninstall: ConfirmActionState = { type: 'uninstall', label: 'Confirm Uninstall' }

  function renderBanner(confirmAction: ConfirmActionState | null, helmActionLoading = false) {
    const handlers = { onCancel: vi.fn(), onConfirmRollback: vi.fn(), onConfirmUninstall: vi.fn() }
    const { container } = render(
      <HelmConfirmActionBanner
        confirmAction={confirmAction}
        releaseName="my-rel"
        namespace="prod"
        helmActionLoading={helmActionLoading}
        {...handlers}
      />,
    )
    return { container, ...handlers }
  }

  it('renders nothing without a pending action', () => {
    const { container } = renderBanner(null)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows rollback message and confirms with the revision', async () => {
    const { onConfirmRollback, onConfirmUninstall } = renderBanner(rollback)
    expect(screen.getByText(/Roll back "my-rel" to revision 2/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Confirm Rollback' }))
    expect(onConfirmRollback).toHaveBeenCalledWith(2)
    expect(onConfirmUninstall).not.toHaveBeenCalled()
  })

  it('shows uninstall message and confirms uninstall', async () => {
    const { onConfirmRollback, onConfirmUninstall } = renderBanner(uninstall)
    expect(screen.getByText(/Uninstall "my-rel" from prod/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Confirm Uninstall' }))
    expect(onConfirmUninstall).toHaveBeenCalledTimes(1)
    expect(onConfirmRollback).not.toHaveBeenCalled()
  })

  it('does not confirm rollback without a revision', async () => {
    const { onConfirmRollback } = renderBanner({ type: 'rollback', label: 'Go' })
    await userEvent.click(screen.getByRole('button', { name: 'Go' }))
    expect(onConfirmRollback).not.toHaveBeenCalled()
  })

  it('calls onCancel when cancel is clicked', async () => {
    const { onCancel } = renderBanner(rollback)
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('shows processing state and disables confirm while loading', () => {
    renderBanner(rollback, true)
    expect(screen.getByRole('button', { name: 'Processing...' })).toBeDisabled()
  })
})
