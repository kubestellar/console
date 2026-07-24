import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ReservationFormModal } from '../ReservationFormModal'
import type { ReservationFormModalProps } from '../ReservationFormModal'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../../lib/modals', () => ({
  BaseModal: ({ children, onClose }: { children: React.ReactNode; onClose: () => void }) => (
    <div data-testid="base-modal" onClick={onClose}>{children}</div>
  ),
  ConfirmDialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div data-testid="confirm-dialog">{children}</div> : null,
}))

vi.mock('../../../hooks/useMCP', () => ({
  useNamespaces: vi.fn(() => ({
    namespaces: ['default', 'kube-system'],
    loading: false,
  })),
  createOrUpdateResourceQuota: vi.fn(() => Promise.resolve()),
  deleteResourceQuota: vi.fn(() => Promise.resolve()),
  COMMON_RESOURCE_TYPES: {
    CPU: 'cpu',
    MEMORY: 'memory',
  },
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderModal(overrides: Partial<ReservationFormModalProps> = {}) {
  const defaults: ReservationFormModalProps = {
    open: true,
    editingReservation: null,
    currentCluster: 'test-cluster',
    nodes: [],
    onClose: vi.fn(),
    onCreate: vi.fn(() => Promise.resolve()),
    onUpdate: vi.fn(() => Promise.resolve()),
  }
  return render(<ReservationFormModal {...defaults} {...overrides} />)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ReservationFormModal', () => {
  it('does not render when open is false', () => {
    renderModal({ open: false })
    expect(screen.queryByTestId('base-modal')).not.toBeInTheDocument()
  })

  it('renders the modal when open is true', () => {
    renderModal()
    expect(screen.getByTestId('base-modal')).toBeInTheDocument()
  })

  it('shows "Create Reservation" title when editingReservation is null', () => {
    renderModal()
    expect(screen.getByText('gpuReservations.form.createTitle')).toBeTruthy()
  })

  it('shows "Edit Reservation" title when editingReservation is provided', () => {
    const editingReservation = {
      id: 'test-id',
      user: 'test-user',
      cluster: 'test-cluster',
      namespace: 'default',
      title: 'Test',
      gpuType: 'nvidia-a100',
      count: 2,
      start_date: '2024-01-15T00:00:00Z',
      duration_hours: 24,
      purpose: 'testing',
      status: 'active' as const,
      createdAt: '2024-01-15T00:00:00Z',
      updatedAt: '2024-01-15T00:00:00Z',
    }
    renderModal({ editingReservation })
    expect(screen.getByText('gpuReservations.form.editTitle')).toBeTruthy()
  })

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn()
    renderModal({ onClose })
    fireEvent.click(screen.getByTestId('base-modal'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('shows GPU type selector with available options', () => {
    const nodes = [
      { name: 'node1', gpuType: 'nvidia-a100', gpuCount: 4, allocatableGPU: 4, requestedGPU: 0, status: 'Ready' },
      { name: 'node2', gpuType: 'nvidia-h100', gpuCount: 8, allocatableGPU: 8, requestedGPU: 0, status: 'Ready' },
    ]
    renderModal({ nodes })
    expect(screen.getByLabelText('gpuReservations.form.gpuType')).toBeTruthy()
  })

  it('validates required fields and shows error messages', () => {
    renderModal()
    const submitButton = screen.getByText('gpuReservations.form.submit')
    fireEvent.click(submitButton)
    expect(screen.getByText('gpuReservations.form.titleRequired')).toBeTruthy()
  })

  it('calls onCreate with form data when submitting a new reservation', async () => {
    const onCreate = vi.fn(() => Promise.resolve())
    renderModal({ onCreate })
    
    fireEvent.change(screen.getByLabelText('gpuReservations.form.title'), { target: { value: 'Test Reservation' } })
    fireEvent.change(screen.getByLabelText('gpuReservations.form.namespace'), { target: { value: 'default' } })
    
    const submitButton = screen.getByText('gpuReservations.form.submit')
    fireEvent.click(submitButton)
    
    // onCreate should eventually be called after validation passes
    expect(onCreate).toHaveBeenCalled()
  })

  it('displays namespace dropdown with available namespaces', () => {
    renderModal()
    expect(screen.getByLabelText('gpuReservations.form.namespace')).toBeTruthy()
    expect(screen.getByText('default')).toBeTruthy()
    expect(screen.getByText('kube-system')).toBeTruthy()
  })
})
