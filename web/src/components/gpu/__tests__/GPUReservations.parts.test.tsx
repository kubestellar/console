import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GPUReservationsHeader, GPUReservationsTabBar, GPUReservationsModals } from '../GPUReservations.parts'
import type { GPUReservationsModalsProps } from '../GPUReservations.parts'
import type { GPUReservation } from '../../../hooks/useGPUReservations'

vi.mock('../../dashboard/AddCardModal', () => ({
  AddCardModal: ({ isOpen, onAddCards }: { isOpen: boolean; onAddCards: (items: Array<{ type: string; title: string; visualization: string; config: Record<string, unknown> }>) => void }) => isOpen && <button onClick={() => onAddCards([{ type: 'gpu', title: 'GPU', visualization: 'stat', config: {} }])}>Add cards</button>,
}))
vi.mock('../ReservationFormModal', () => ({
  ReservationFormModal: ({ isOpen, onSave, onActivate, onSaved, onError }: { isOpen: boolean; onSave: (input: never) => Promise<string>; onActivate: (id: string) => Promise<void>; onSaved: () => void; onError: (message: string) => void }) => isOpen && <div>
    <button onClick={() => void onSave({ title: 'Training' } as never)}>Save form</button>
    <button onClick={() => void onActivate('res-1')}>Activate</button>
    <button onClick={onSaved}>Saved</button>
    <button onClick={() => onError('Failure')}>Error</button>
  </div>,
}))
vi.mock('../../../lib/modals', () => {
  const BaseModal = ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) => isOpen ? <div>{children}</div> : null
  BaseModal.Header = ({ title }: { title: string }) => <h2>{title}</h2>
  BaseModal.Content = ({ children }: { children: React.ReactNode }) => <div>{children}</div>
  BaseModal.Footer = ({ children }: { children: React.ReactNode }) => <div>{children}</div>
  return { BaseModal }
})

const t = (key: string) => key

describe('GPU reservation header and tabs', () => {
  it('shows demo badge only in demo mode', () => {
    const { rerender } = render(<GPUReservationsHeader t={t} effectiveDemoMode />)
    expect(screen.getByText('gpuReservations.demo')).toBeInTheDocument()
    rerender(<GPUReservationsHeader t={t} effectiveDemoMode={false} />)
    expect(screen.queryByText('gpuReservations.demo')).not.toBeInTheDocument()
  })

  it('navigates tabs by click and bounded arrow keys, and exposes actions for signed-in users', () => {
    const setActiveTab = vi.fn(), toggleShowOnlyMine = vi.fn(), openCreateForm = vi.fn()
    const props = { t, activeTab: 'overview' as const, setActiveTab, filteredReservationsCount: 3, user: { github_login: 'dev' }, showOnlyMine: false, toggleShowOnlyMine, openCreateForm }
    const { rerender } = render(<GPUReservationsTabBar {...props} />)
    expect(screen.getByRole('tab', { name: 'gpuReservations.tabs.overview' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: /gpuReservations.tabs.reservations/ })).toHaveTextContent('3')
    fireEvent.click(screen.getByRole('tab', { name: 'gpuReservations.tabs.calendar' }))
    expect(setActiveTab).toHaveBeenLastCalledWith('calendar')
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowLeft' })
    expect(setActiveTab).toHaveBeenLastCalledWith('overview')
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' })
    expect(setActiveTab).toHaveBeenLastCalledWith('calendar')
    fireEvent.click(screen.getByRole('checkbox', { name: 'gpuReservations.myReservations' }))
    fireEvent.click(screen.getByRole('button', { name: 'gpuReservations.createReservation' }))
    expect(toggleShowOnlyMine).toHaveBeenCalledOnce()
    expect(openCreateForm).toHaveBeenCalledOnce()
    rerender(<GPUReservationsTabBar {...props} activeTab="dashboard" user={null} filteredReservationsCount={0} />)
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' })
    expect(setActiveTab).toHaveBeenLastCalledWith('dashboard')
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'gpuReservations.tabs.reservations' })).not.toHaveTextContent('3')
  })
})

describe('GPU reservation modals', () => {
  const reservation = { id: 'res-1', title: 'Training' } as GPUReservation
  function makeProps(): GPUReservationsModalsProps {
    return {
      t, showAddCardModal: true, closeAddCardModal: vi.fn(), handleAddDashboardCards: vi.fn(), dashboardCardTypes: [],
      showReservationForm: true, closeReservationForm: vi.fn(), editingReservation: null, gpuClusters: [], rawNodes: [], user: null,
      prefillDate: null, gpuLiveMode: false, knownNamespacesByCluster: {},
      apiCreateReservation: vi.fn().mockResolvedValue(reservation), apiUpdateReservation: vi.fn().mockResolvedValue(reservation),
      showToast: vi.fn(), deleteConfirmId: 'res-1', setDeleteConfirmId: vi.fn(), deleteConfirmReservation: reservation,
      handleDeleteReservation: vi.fn(), isDeleting: false,
    }
  }


  it('handles delete confirmation state', () => {
    const props = makeProps()
    const { rerender } = render(<GPUReservationsModals {...props} />)
    expect(screen.getByText('Training')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'gpuReservations.delete.cancel' }))
    expect(props.setDeleteConfirmId).toHaveBeenCalledWith(null)
    fireEvent.click(screen.getByRole('button', { name: 'gpuReservations.delete.delete' }))
    expect(props.handleDeleteReservation).toHaveBeenCalledOnce()
    rerender(<GPUReservationsModals {...props} isDeleting />)
    expect(screen.getByRole('button', { name: 'gpuReservations.delete.delete' })).toBeDisabled()
    rerender(<GPUReservationsModals {...props} deleteConfirmId={null} />)
    expect(screen.queryByText('gpuReservations.delete.confirmMessage')).not.toBeInTheDocument()
  })
})
