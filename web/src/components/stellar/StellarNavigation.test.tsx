import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { StellarNotification } from '../../types/stellar'
import { StellarSidebar } from './StellarSidebar'
import { StellarPage } from './StellarPage'
import {
  STELLAR_NAV_HREF,
  STELLAR_NAVIGATION_EVENT,
} from './navigation'

const mockNavigate = vi.fn()
const mockLocation = vi.hoisted(() => ({
  pathname: '/',
  hash: '',
  search: '',
  state: null,
  key: 'stellar-test',
}))
const mockUseStellar = vi.hoisted(() => vi.fn())

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => mockLocation,
  }
})

vi.mock('../../hooks/useStellar', () => ({
  useStellar: () => mockUseStellar(),
}))

vi.mock('./EventsPanel', () => ({ EventsPanel: () => <div>Events panel</div> }))
vi.mock('./ChatPanel', () => ({ ChatPanel: () => <div>Chat panel</div> }))
vi.mock('./StellarHeader', () => ({ StellarHeader: () => <div>Header</div> }))
vi.mock('./TasksPanel', () => ({ TasksPanel: () => <div>Tasks panel</div> }))
vi.mock('./WatchesPanel', () => ({ WatchesPanel: () => <div>Watches panel</div> }))
vi.mock('./RecommendedTasksPanel', () => ({ RecommendedTasksPanel: () => <div>Recommended tasks</div> }))
vi.mock('./StellarActivityPanel', () => ({ StellarActivityPanel: () => <div>Stellar log</div> }))
vi.mock('./StellarAuditLogSection', () => ({ StellarAuditLogSection: () => <div>Audit log</div> }))

const baseNotification: StellarNotification = {
  id: 'n1',
  type: 'event',
  severity: 'warning',
  title: 'Warning event',
  body: 'details',
  createdAt: '2026-05-16T00:00:00.000Z',
  read: false,
  dedupeKey: 'warning-event',
}

function buildStellarState(overrides: Record<string, unknown> = {}) {
  return {
    isConnected: true,
    unreadCount: 3,
    state: { clustersWatching: ['alpha'], unreadCount: 3, pendingActionCount: 0 },
    notifications: [baseNotification],
    pendingActions: [],
    tasks: [],
    watches: [],
    nudge: null,
    catchUp: null,
    providerSession: null,
    setProviderSession: vi.fn(),
    acknowledgeNotification: vi.fn(),
    dismissAllNotifications: vi.fn(),
    approveAction: vi.fn(),
    rejectAction: vi.fn(),
    updateTaskStatus: vi.fn(),
    createTask: vi.fn().mockResolvedValue(undefined),
    dismissNudge: vi.fn(),
    resolveWatch: vi.fn(),
    dismissWatch: vi.fn(),
    snoozeWatch: vi.fn(),
    dismissCatchUp: vi.fn(),
    solves: [],
    solveProgress: {},
    startSolve: vi.fn(),
    activity: [],
    ...overrides,
  }
}

describe('Stellar navigation', () => {
  beforeEach(() => {
    mockNavigate.mockReset()
    Object.assign(mockLocation, {
      pathname: '/',
      hash: '',
      search: '',
      state: null,
      key: 'stellar-test',
    })
    mockUseStellar.mockReturnValue(buildStellarState())
  })

  it('routes rail buttons to the intended Stellar destinations', () => {
    render(<StellarSidebar />)

    fireEvent.click(screen.getByRole('button', { name: 'Open Stellar overview' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open Stellar activity log' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open Stellar events' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open Stellar chat' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open Stellar audit log' }))

    expect(mockNavigate.mock.calls).toEqual([
      [STELLAR_NAV_HREF.OVERVIEW],
      [STELLAR_NAV_HREF.ACTIVITY],
      [STELLAR_NAV_HREF.EVENTS],
      [STELLAR_NAV_HREF.CHAT],
      [STELLAR_NAV_HREF.AUDIT],
    ])
  })

  it('renders icon buttons instead of text initials in the Stellar rail', () => {
    render(<StellarSidebar />)

    for (const key of ['overview', 'activity', 'chat', 'audit'] as const) {
      const button = screen.getByTestId(`stellar-rail-${key}`)
      expect(button.querySelector('svg')).not.toBeNull()
      expect(button).toHaveTextContent(/^$/)
    }

    const eventsButton = screen.getByTestId('stellar-rail-events')
    expect(eventsButton.querySelector('svg')).not.toBeNull()
    expect(eventsButton).toHaveTextContent(/^3$/)
  })

  it('replays section actions when the current Stellar target is clicked again', () => {
    Object.assign(mockLocation, {
      pathname: '/stellar',
      hash: '#stellar-events',
    })
    const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent')

    render(<StellarSidebar />)
    fireEvent.click(screen.getByRole('button', { name: 'Open Stellar events' }))

    expect(mockNavigate).not.toHaveBeenCalled()
    expect(dispatchEventSpy).toHaveBeenCalledWith(expect.objectContaining({
      type: STELLAR_NAVIGATION_EVENT,
    }))
  })

  it('focuses the requested Stellar section from the route hash', async () => {
    Object.assign(mockLocation, {
      pathname: '/stellar',
      hash: '#stellar-chat',
    })

    render(<StellarPage />)

    await waitFor(() => {
      expect(screen.getByTestId('stellar-section-chat')).toHaveFocus()
    })
  })
})
