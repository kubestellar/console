import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NamespaceQuotasDeleteModal } from './NamespaceQuotasDeleteModal'
import type { QuotaDeleteTarget } from './NamespaceQuotas.types'

const deleteTarget: QuotaDeleteTarget = {
  cluster: 'cluster-1',
  namespace: 'team-a',
  name: 'quota-1',
}

describe('NamespaceQuotasDeleteModal', () => {
  let mockOnClose: () => void
  let mockOnDelete: (target: QuotaDeleteTarget) => void

  beforeEach(() => {
    mockOnClose = vi.fn()
    mockOnDelete = vi.fn()
  })

  it('does not render content when deleteConfirm is null', () => {
    render(
      <NamespaceQuotasDeleteModal
        deleteConfirm={null}
        onClose={mockOnClose}
        onDelete={mockOnDelete}
        isLoading={false}
      />
    )
    expect(screen.queryByText('Delete ResourceQuota?')).not.toBeInTheDocument()
  })

  it('renders the quota name, namespace, and cluster to delete', () => {
    render(
      <NamespaceQuotasDeleteModal
        deleteConfirm={deleteTarget}
        onClose={mockOnClose}
        onDelete={mockOnDelete}
        isLoading={false}
      />
    )
    expect(screen.getByText('Delete ResourceQuota?')).toBeInTheDocument()
    expect(screen.getByText('quota-1')).toBeInTheDocument()
    expect(screen.getByText('team-a')).toBeInTheDocument()
    expect(screen.getByText('cluster-1')).toBeInTheDocument()
  })

  it('calls onClose when Cancel is clicked', async () => {
    const user = userEvent.setup()
    render(
      <NamespaceQuotasDeleteModal
        deleteConfirm={deleteTarget}
        onClose={mockOnClose}
        onDelete={mockOnDelete}
        isLoading={false}
      />
    )
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(mockOnClose).toHaveBeenCalledTimes(1)
  })

  it('calls onDelete with the delete target when Delete is clicked', async () => {
    const user = userEvent.setup()
    render(
      <NamespaceQuotasDeleteModal
        deleteConfirm={deleteTarget}
        onClose={mockOnClose}
        onDelete={mockOnDelete}
        isLoading={false}
      />
    )
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(mockOnDelete).toHaveBeenCalledWith(deleteTarget)
  })

  it('disables the Delete button while isLoading is true', () => {
    render(
      <NamespaceQuotasDeleteModal
        deleteConfirm={deleteTarget}
        onClose={mockOnClose}
        onDelete={mockOnDelete}
        isLoading={true}
      />
    )
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled()
  })
})
