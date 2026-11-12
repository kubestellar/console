import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ReactNode } from 'react'
import {
  GPUReservationsHeader,
  GPUReservationsTabBar,
  GPUReservationsModals,
} from './GPUReservations.parts'
import type { GPUReservationsModalsProps } from './GPUReservations.parts'

vi.mock('../dashboard/AddCardModal', () => ({
  AddCardModal: ({ isOpen, onAddCards }: { isOpen: boolean; onAddCards: (s: unknown[]) => void; onClose: () => void }) =>
    isOpen ? (
      <button data-testid="add-card" onClick={() => onAddCards([{ type: 'gpu_overview' }])}>add-card</button>
    ) : null,
}))

vi.mock('./ReservationFormModal', () => ({
  ReservationFormModal: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div data-testid="reservation-form" /> : null),
}))

vi.mock('../../lib/modals', () => {
  const BaseModal = ({ isOpen, children }: { isOpen: boolean; children: ReactNode }) =>
    isOpen ? <div data-testid="base-modal">{children}</div> : null
  BaseModal.Header = ({ title }: { title: string }) => <h2>{title}</h2>
  BaseModal.Content = ({ children }: { children: ReactNode }) => <div>{children}</div>
  BaseModal.Footer = ({ children }: { children: ReactNode }) => <div>{children}</div>
  return { BaseModal }
})

const t = (key: string) => key

describe('GPUReservationsHeader', () => {
  it('renders title and subtitle without the demo badge', () => {
    render(<GPUReservationsHeader t={t} effectiveDemoMode={false} />)
    expect(screen.getByText('gpuReservations.title')).toBeTruthy()
    expect(screen.getByText('gpuReservations.subtitle')).toBeTruthy()
    expect(screen.queryByText('gpuReservations.demo')).toBeNull()
  })

  it('shows the demo badge in demo mode', () => {
    render(<GPUReservationsHeader t={t} effectiveDemoMode />)
    expect(screen.getByText('gpuReservations.demo')).toBeTruthy()
  })
})

describe('GPUReservationsTabBar', () => {
  function renderBar(overrides: Partial<Parameters<typeof GPUReservationsTabBar>[0]> = {}) {
    const props = {
      t,
      activeTab: 'overview' as const,
      setActiveTab: vi.fn(),
      filteredReservationsCount: 3,
      user: { github_login: 'octocat' },
      showOnlyMine: false,
      toggleShowOnlyMine: vi.fn(),
      openCreateForm: vi.fn(),
      ...overrides,
    }
    render(<GPUReservationsTabBar {...props} />)
    return props
  }

  it('renders all tabs and marks the active one', () => {
    renderBar({ activeTab: 'calendar' })
    expect(screen.getAllByRole('tab')).toHaveLength(5)
    expect(screen.getByRole('tab', { name: /gpuReservations.tabs.calendar/ }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tab', { name: /gpuReservations.tabs.overview/ }).getAttribute('aria-selected')).toBe('false')
  })

  it('shows the reservation count badge only when positive', () => {
    renderBar()
    expect(screen.getByText('3')).toBeTruthy()
  })

  it('omits the count badge when there are no reservations', () => {
    renderBar({ filteredReservationsCount: 0 })
    expect(screen.queryByText('0')).toBeNull()
  })

  it('switches tab on click', () => {
    const props = renderBar()
    fireEvent.click(screen.getByRole('tab', { name: /gpuReservations.tabs.inventory/ }))
    expect(props.setActiveTab).toHaveBeenCalledWith('inventory')
  })

  it('supports arrow key navigation and clamps at the edges', () => {
    const props = renderBar({ activeTab: 'overview' })
    const list = screen.getByRole('tablist')
    fireEvent.keyDown(list, { key: 'ArrowRight' })
    expect(props.setActiveTab).toHaveBeenLastCalledWith('calendar')
    fireEvent.keyDown(list, { key: 'ArrowLeft' })
    expect(props.setActiveTab).toHaveBeenLastCalledWith('overview')
  })

  it('hides the my-reservations filter without a user', () => {
    renderBar({ user: null })
    expect(screen.queryByText('gpuReservations.myReservations')).toBeNull()
  })

  it('toggles the my-reservations filter and opens the create form', () => {
    const props = renderBar()
    fireEvent.click(screen.getByRole('checkbox'))
    expect(props.toggleShowOnlyMine).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByText('gpuReservations.createReservation'))
    expect(props.openCreateForm).toHaveBeenCalledTimes(1)
  })
})

describe('GPUReservationsModals', () => {
  function renderModals(overrides: Partial<GPUReservationsModalsProps> = {}) {
    const props: GPUReservationsModalsProps = {
      t,
      showAddCardModal: false,
      closeAddCardModal: vi.fn(),
      handleAddDashboardCards: vi.fn(),
      dashboardCardTypes: [],
      showReservationForm: false,
      closeReservationForm: vi.fn(),
      editingReservation: null,
      gpuClusters: [],
      rawNodes: [],
      user: null,
      prefillDate: null,
      gpuLiveMode: false,
      knownNamespacesByCluster: {},
      apiCreateReservation: vi.fn(),
      apiUpdateReservation: vi.fn(),
      showToast: vi.fn(),
      deleteConfirmId: null,
      setDeleteConfirmId: vi.fn(),
      deleteConfirmReservation: null,
      handleDeleteReservation: vi.fn(),
      isDeleting: false,
      ...overrides,
    }
    render(<GPUReservationsModals {...props} />)
    return props
  }

  it('renders nothing visible when all modals are closed', () => {
    renderModals()
    expect(screen.queryByTestId('add-card')).toBeNull()
    expect(screen.queryByTestId('reservation-form')).toBeNull()
    expect(screen.queryByTestId('base-modal')).toBeNull()
  })

  it('adds dashboard cards and closes the add-card modal', () => {
    const props = renderModals({ showAddCardModal: true })
    fireEvent.click(screen.getByTestId('add-card'))
    expect(props.handleAddDashboardCards).toHaveBeenCalledWith([{ type: 'gpu_overview' }])
    expect(props.closeAddCardModal).toHaveBeenCalledTimes(1)
  })

  it('shows the reservation form when requested', () => {
    renderModals({ showReservationForm: true })
    expect(screen.getByTestId('reservation-form')).toBeTruthy()
  })

  it('shows delete confirmation with reservation title and handles actions', () => {
    const props = renderModals({
      deleteConfirmId: 'r1',
      deleteConfirmReservation: { id: 'r1', title: 'Training job' } as GPUReservationsModalsProps['deleteConfirmReservation'],
    })
    expect(screen.getByText('Training job')).toBeTruthy()
    fireEvent.click(screen.getByText('gpuReservations.delete.delete'))
    expect(props.handleDeleteReservation).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByText('gpuReservations.delete.cancel'))
    expect(props.setDeleteConfirmId).toHaveBeenCalledWith(null)
  })

  it('disables the delete button while deleting', () => {
    renderModals({ deleteConfirmId: 'r1', isDeleting: true })
    expect((screen.getByText('gpuReservations.delete.delete') as HTMLButtonElement).disabled).toBe(true)
  })
})
