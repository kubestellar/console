import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ReservationFormModal } from '../ReservationFormModal'
import type { GPUReservation } from '../../../hooks/useGPUReservations'
import type { GPUClusterInfo } from '../ReservationFormModal'
import type { GPUNode } from '../../../hooks/mcp/types.gpu'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../../lib/modals', () => {
  const BaseModal = ({
    isOpen,
    children,
    onClose,
  }: {
    isOpen?: boolean
    children: React.ReactNode
    onClose: () => void
  }) => {
    if (isOpen === false) return null
    return (
      <div
        data-testid="base-modal"
        onClick={onClose}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') onClose()
        }}
      >
        {children}
      </div>
    )
  }
  BaseModal.Header = ({ title, children }: { title?: React.ReactNode; children?: React.ReactNode }) => (
    <div data-testid="base-modal-header">
      {title}
      {children}
    </div>
  )
  BaseModal.Content = ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="base-modal-content">{children}</div>
  )
  BaseModal.Footer = ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="base-modal-footer">{children}</div>
  )
  return {
    BaseModal,
    ConfirmDialog: ({ isOpen, children }: { isOpen?: boolean; children?: React.ReactNode }) =>
      isOpen ? <div data-testid="confirm-dialog">{children}</div> : null,
  }
})

vi.mock('../../../hooks/useMCP', () => ({
  useNamespaces: vi.fn(() => ({
    namespaces: ['my-app', 'production'],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  })),
  createOrUpdateResourceQuota: vi.fn(() => Promise.resolve()),
  deleteResourceQuota: vi.fn(() => Promise.resolve()),
  COMMON_RESOURCE_TYPES: {
    CPU: 'cpu',
    MEMORY: 'memory',
  },
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

const defaultCluster: GPUClusterInfo = {
  name: 'test-cluster',
  totalGPUs: 8,
  allocatedGPUs: 0,
  availableGPUs: 8,
  gpuTypes: ['nvidia-a100'],
}

const makeEditingReservation = (): GPUReservation => ({
  id: 'test-id',
  user_id: 'test-user-id',
  user_name: 'test-user',
  title: 'Test Reservation',
  description: '',
  cluster: 'test-cluster',
  namespace: 'my-app',
  gpu_count: 2,
  gpu_type: 'nvidia-a100',
  start_date: '2024-01-15T00:00:00Z',
  duration_hours: 24,
  notes: '',
  status: 'active',
  quota_name: '',
  quota_enforced: false,
  created_at: '2024-01-15T00:00:00Z',
})

const makeNode = (gpuType = 'nvidia-a100'): GPUNode => ({
  name: 'node1',
  cluster: 'test-cluster',
  gpuType,
  gpuCount: 4,
  gpuAllocated: 0,
})

function renderModal(
  overrides: Partial<{
    isOpen: boolean
    editingReservation: GPUReservation | null
    gpuClusters: GPUClusterInfo[]
    allNodes: GPUNode[]
    onClose: () => void
    onSave: (input: unknown) => Promise<void>
    onActivate: (id: string) => Promise<void>
    onSaved: () => void
    onError: (msg: string) => void
  }> = {},
) {
  const defaults = {
    isOpen: true,
    editingReservation: null,
    gpuClusters: [defaultCluster],
    allNodes: [makeNode()],
    user: null,
    onClose: vi.fn(),
    onSave: vi.fn(() => Promise.resolve()),
    onActivate: vi.fn(() => Promise.resolve()),
    onSaved: vi.fn(),
    onError: vi.fn(),
  }
  return render(<ReservationFormModal {...defaults} {...overrides} />)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ReservationFormModal', () => {
  it('does not render when isOpen is false', () => {
    renderModal({ isOpen: false })
    expect(screen.queryByTestId('base-modal')).not.toBeInTheDocument()
  })

  it('renders the modal when isOpen is true', () => {
    renderModal()
    expect(screen.getByTestId('base-modal')).toBeInTheDocument()
  })

  it('shows "Create Reservation" title when editingReservation is null', () => {
    renderModal()
    // t('gpuReservations.form.createTitle') returns the key in test env
    expect(screen.getByText('gpuReservations.form.createTitle')).toBeTruthy()
  })

  it('shows "Edit Reservation" title when editingReservation is provided', () => {
    renderModal({ editingReservation: makeEditingReservation() })
    // t('gpuReservations.form.editTitle') returns the key in test env
    expect(screen.getByText('gpuReservations.form.editTitle')).toBeTruthy()
  })

  it('calls onClose when the modal backdrop is clicked', () => {
    const onClose = vi.fn()
    renderModal({ onClose })
    fireEvent.click(screen.getByTestId('base-modal'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('shows GPU type label in the form', () => {
    const allNodes = [makeNode('nvidia-a100'), makeNode('nvidia-h100')]
    renderModal({
      editingReservation: makeEditingReservation(),
      allNodes,
    })
    // t('gpuReservations.form.fields.gpuTypeLabel') returns the key
    expect(screen.getByText('gpuReservations.form.fields.gpuTypeLabel')).toBeTruthy()
  })

  it('shows a validation error when submitting with no cluster selected', () => {
    renderModal()
    // Click the create/save button — t('gpuReservations.form.buttons.create') → key
    const submitButton = screen.getByText('gpuReservations.form.buttons.create')
    fireEvent.click(submitButton)
    // Validation: cluster is required first
    expect(screen.getByText('gpuReservations.form.errors.selectCluster')).toBeTruthy()
  })

  it('shows cancel and save buttons', () => {
    renderModal()
    expect(screen.getByText('gpuReservations.form.buttons.cancel')).toBeTruthy()
    expect(screen.getByText('gpuReservations.form.buttons.create')).toBeTruthy()
  })

  it('shows namespace label in the form', () => {
    renderModal({ editingReservation: makeEditingReservation() })
    expect(screen.getByText('gpuReservations.form.fields.namespaceLabel')).toBeTruthy()
  })
})
