import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NamespaceQuotasDeleteModal } from '../NamespaceQuotasDeleteModal'
import type { QuotaDeleteTarget } from '../NamespaceQuotas.types'

function renderModal(overrides: Partial<React.ComponentProps<typeof NamespaceQuotasDeleteModal>> = {}) {
  const onClose = vi.fn()
  const onDelete = vi.fn()
  const deleteConfirm: QuotaDeleteTarget = { cluster: 'cluster-1', namespace: 'default', name: 'my-quota' }
  const props: React.ComponentProps<typeof NamespaceQuotasDeleteModal> = {
    deleteConfirm,
    onClose,
    onDelete,
    isLoading: false,
    ...overrides,
  }
  return { onClose, onDelete, ...render(<NamespaceQuotasDeleteModal {...props} />) }
}

describe('NamespaceQuotasDeleteModal', () => {
  it('does not render when deleteConfirm is null', () => {
    renderModal({ deleteConfirm: null })
    expect(screen.queryByText('Delete ResourceQuota?')).not.toBeInTheDocument()
  })

  it('renders the confirmation copy with the target quota, namespace, and cluster', () => {
    renderModal()
    expect(screen.getByText('Delete ResourceQuota?')).toBeInTheDocument()
    expect(screen.getByText('my-quota')).toBeInTheDocument()
    expect(screen.getByText('default')).toBeInTheDocument()
    expect(screen.getByText('cluster-1')).toBeInTheDocument()
  })

  it('calls onClose when Cancel is clicked', async () => {
    const user = userEvent.setup()
    const { onClose } = renderModal()
    await user.click(screen.getByText('Cancel'))
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onDelete with the delete target when Delete is confirmed', async () => {
    const user = userEvent.setup()
    const target: QuotaDeleteTarget = { cluster: 'cluster-2', namespace: 'kube-system', name: 'another-quota' }
    const { onDelete } = renderModal({ deleteConfirm: target })
    await user.click(screen.getByText('Delete'))
    expect(onDelete).toHaveBeenCalledWith(target)
  })

  it('disables the Delete button and shows a loading state while isLoading is true', () => {
    renderModal({ isLoading: true })
    expect(screen.getByText('Delete').closest('button')).toBeDisabled()
  })
})
