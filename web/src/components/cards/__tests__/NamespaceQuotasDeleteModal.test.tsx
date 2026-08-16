/**
 * Tests for NamespaceQuotasDeleteModal (#22502, part of #22484).
 *
 * Covers: hidden-when-no-target, confirmation copy, cancel flow, delete
 * flow (with the correct target payload), and the disabled/loading state
 * of the delete button.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NamespaceQuotasDeleteModal } from '../NamespaceQuotasDeleteModal'
import type { QuotaDeleteTarget } from '../NamespaceQuotas.types'

const TARGET: QuotaDeleteTarget = { cluster: 'cluster-a', namespace: 'team-a', name: 'default-quota' }

describe('NamespaceQuotasDeleteModal', () => {
  it('renders nothing visible when deleteConfirm is null', () => {
    render(
      <NamespaceQuotasDeleteModal
        deleteConfirm={null}
        onClose={vi.fn()}
        onDelete={vi.fn()}
        isLoading={false}
      />
    )

    expect(screen.queryByText('Delete ResourceQuota?')).not.toBeInTheDocument()
  })

  it('renders the confirmation copy with the target cluster/namespace/name', () => {
    render(
      <NamespaceQuotasDeleteModal
        deleteConfirm={TARGET}
        onClose={vi.fn()}
        onDelete={vi.fn()}
        isLoading={false}
      />
    )

    expect(screen.getByText('Delete ResourceQuota?')).toBeInTheDocument()
    expect(screen.getByText(TARGET.name)).toBeInTheDocument()
    expect(screen.getByText(TARGET.namespace)).toBeInTheDocument()
    expect(screen.getByText(TARGET.cluster)).toBeInTheDocument()
    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument()
  })

  it('calls onClose when Cancel is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <NamespaceQuotasDeleteModal
        deleteConfirm={TARGET}
        onClose={onClose}
        onDelete={vi.fn()}
        isLoading={false}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onDelete with the delete target when Delete is clicked', async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn()
    render(
      <NamespaceQuotasDeleteModal
        deleteConfirm={TARGET}
        onClose={vi.fn()}
        onDelete={onDelete}
        isLoading={false}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onDelete).toHaveBeenCalledWith(TARGET)
  })

  it('disables the Delete button while isLoading is true', () => {
    render(
      <NamespaceQuotasDeleteModal
        deleteConfirm={TARGET}
        onClose={vi.fn()}
        onDelete={vi.fn()}
        isLoading={true}
      />
    )

    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled()
  })
})
