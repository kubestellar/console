import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { StellarToastBridge } from './StellarToastBridge'
import type { StellarNotification } from '../../types/stellar'

const showToast = vi.fn()
let mockNotifications: StellarNotification[] = []
let mockPathname = '/dashboard'

vi.mock('../../hooks/useStellar', () => ({
  useStellar: () => ({ notifications: mockNotifications }),
}))

vi.mock('../ui/Toast', () => ({
  useToast: () => ({ showToast }),
}))

const navigate = vi.fn()
vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
  useLocation: () => ({ pathname: mockPathname }),
}))

function makeNotification(overrides: Partial<StellarNotification> = {}): StellarNotification {
  return {
    id: 'evt-1',
    type: 'event',
    severity: 'critical',
    title: 'Node NotReady',
    body: 'node-1 stopped reporting',
    read: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('StellarToastBridge', () => {
  beforeEach(() => {
    showToast.mockClear()
    navigate.mockClear()
    mockNotifications = []
    mockPathname = '/dashboard'
  })

  it('renders nothing (it is a headless side-effect component)', () => {
    const { container } = render(<StellarToastBridge />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows a toast for a new critical event when off the Stellar page', () => {
    mockNotifications = [makeNotification({ severity: 'critical', type: 'event' })]
    render(<StellarToastBridge />)

    expect(showToast).toHaveBeenCalledWith('Stellar: Node NotReady', 'error')
  })

  it('shows a warning toast for a new warning-severity action', () => {
    mockNotifications = [makeNotification({ severity: 'warning', type: 'action', id: 'evt-2' })]
    render(<StellarToastBridge />)

    expect(showToast).toHaveBeenCalledWith('Stellar: Node NotReady', 'warning')
  })

  it('does not toast info-severity notifications', () => {
    mockNotifications = [makeNotification({ severity: 'info', id: 'evt-3' })]
    render(<StellarToastBridge />)

    expect(showToast).not.toHaveBeenCalled()
  })

  it('does not toast routine events while already on the Stellar page', () => {
    mockPathname = '/stellar'
    mockNotifications = [makeNotification({ id: 'evt-4' })]
    render(<StellarToastBridge />)

    expect(showToast).not.toHaveBeenCalled()
  })

  it('always toasts auto-fix success events, even while on the Stellar page', () => {
    mockPathname = '/stellar'
    mockNotifications = [
      makeNotification({ id: 'evt-5', title: 'Stellar auto-fixed the deployment', severity: 'info' }),
    ]
    render(<StellarToastBridge />)

    expect(showToast).toHaveBeenCalledWith('Stellar: Stellar auto-fixed the deployment', 'success')
  })

  it('toasts auto-fix failure events as errors', () => {
    mockNotifications = [
      makeNotification({ id: 'evt-6', title: 'Stellar auto-fix failed to restart pod', severity: 'info' }),
    ]
    render(<StellarToastBridge />)

    expect(showToast).toHaveBeenCalledWith('Stellar: Stellar auto-fix failed to restart pod', 'error')
  })

  it('does not re-toast the same notification id across re-renders', () => {
    mockNotifications = [makeNotification({ id: 'evt-7' })]
    const { rerender } = render(<StellarToastBridge />)
    expect(showToast).toHaveBeenCalledTimes(1)

    rerender(<StellarToastBridge />)
    expect(showToast).toHaveBeenCalledTimes(1)
  })
})
