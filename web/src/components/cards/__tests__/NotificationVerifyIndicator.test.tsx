import React from 'react'
/**
 * Vitest unit tests for NotificationVerifyIndicator (#21095).
 *
 * Covers:
 * - Returns null when Notification API is unavailable
 * - Returns null when permission is not granted
 * - Returns null when already verified
 * - Renders bell button in idle state when permission granted and not verified
 * - Clicking bell sends test notification and transitions to 'asked' state
 * - 'Yes' button in asked state triggers verification
 * - 'No' button in asked state transitions to 'failed' state
 * - Failed state shows system settings message
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NotificationVerifyIndicator } from '../NotificationVerifyIndicator'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

let mockIsBrowserNotifVerified = false
const mockSetBrowserNotifVerified = vi.fn()

vi.mock('../../../lib/notificationStatus', () => ({
  isBrowserNotifVerified: () => mockIsBrowserNotifVerified,
  setBrowserNotifVerified: (v: boolean) => mockSetBrowserNotifVerified(v),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Sets up window.Notification mock with the given permission */
function mockNotificationPermission(permission: NotificationPermission | null) {
  if (permission === null) {
    // Simulate Notification API being unavailable
    Object.defineProperty(window, 'Notification', {
      value: undefined,
      configurable: true,
      writable: true,
    })
    return
  }

  const NotificationMock = vi.fn()
  Object.defineProperty(NotificationMock, 'permission', {
    value: permission,
    configurable: true,
  })
  Object.defineProperty(window, 'Notification', {
    value: NotificationMock,
    configurable: true,
    writable: true,
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NotificationVerifyIndicator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsBrowserNotifVerified = false
    // Default: permission granted, not verified
    mockNotificationPermission('granted')
  })

  // ---- Hidden / null render cases ----

  describe('when component should not render', () => {
    it('renders nothing when Notification API is unavailable', () => {
      mockNotificationPermission(null)
      const { container } = render(<NotificationVerifyIndicator />)
      expect(container).toBeEmptyDOMElement()
    })

    it('renders nothing when notification permission is "default" (not granted)', () => {
      mockNotificationPermission('default')
      const { container } = render(<NotificationVerifyIndicator />)
      expect(container).toBeEmptyDOMElement()
    })

    it('renders nothing when notification permission is "denied"', () => {
      mockNotificationPermission('denied')
      const { container } = render(<NotificationVerifyIndicator />)
      expect(container).toBeEmptyDOMElement()
    })

    it('renders nothing when notifications are already verified', () => {
      mockIsBrowserNotifVerified = true
      const { container } = render(<NotificationVerifyIndicator />)
      expect(container).toBeEmptyDOMElement()
    })
  })

  // ---- Idle state ----

  describe('idle state (permission granted, not yet verified)', () => {
    it('renders the bell indicator button', () => {
      render(<NotificationVerifyIndicator />)
      expect(screen.getByTitle('activeAlerts.notifNotVerified')).toBeInTheDocument()
    })

    it('shows the amber dot indicating unverified state', () => {
      const { container } = render(<NotificationVerifyIndicator />)
      const dot = container.querySelector('.bg-amber-400')
      expect(dot).toBeInTheDocument()
    })
  })

  // ---- Transition: idle → asked ----

  describe('when the bell button is clicked', () => {
    it('sends a test notification', async () => {
      render(<NotificationVerifyIndicator />)
      await userEvent.click(screen.getByTitle('activeAlerts.notifNotVerified'))
      expect(window.Notification).toHaveBeenCalledWith(
        'KubeStellar Console',
        expect.objectContaining({ body: 'activeAlerts.testNotificationBody' }),
      )
    })

    it('transitions to "asked" state — shows yes/no buttons', async () => {
      render(<NotificationVerifyIndicator />)
      await userEvent.click(screen.getByTitle('activeAlerts.notifNotVerified'))

      expect(screen.getByText('activeAlerts.didYouSeeIt')).toBeInTheDocument()
      expect(screen.getByText('activeAlerts.yes')).toBeInTheDocument()
      expect(screen.getByText('activeAlerts.no')).toBeInTheDocument()
    })

    it('hides the bell button after transitioning to asked state', async () => {
      render(<NotificationVerifyIndicator />)
      await userEvent.click(screen.getByTitle('activeAlerts.notifNotVerified'))
      expect(screen.queryByTitle('activeAlerts.notifNotVerified')).not.toBeInTheDocument()
    })
  })

  // ---- Transition: asked → verified ----

  describe('when "Yes" is clicked in asked state', () => {
    it('calls setBrowserNotifVerified(true)', async () => {
      render(<NotificationVerifyIndicator />)
      await userEvent.click(screen.getByTitle('activeAlerts.notifNotVerified'))
      await userEvent.click(screen.getByText('activeAlerts.yes'))
      expect(mockSetBrowserNotifVerified).toHaveBeenCalledWith(true)
    })

    it('hides the indicator after verification', async () => {
      render(<NotificationVerifyIndicator />)
      await userEvent.click(screen.getByTitle('activeAlerts.notifNotVerified'))
      await userEvent.click(screen.getByText('activeAlerts.yes'))

      expect(screen.queryByText('activeAlerts.didYouSeeIt')).not.toBeInTheDocument()
      expect(screen.queryByText('activeAlerts.yes')).not.toBeInTheDocument()
    })
  })

  // ---- Transition: asked → failed ----

  describe('when "No" is clicked in asked state', () => {
    it('shows the "check system settings" message', async () => {
      render(<NotificationVerifyIndicator />)
      await userEvent.click(screen.getByTitle('activeAlerts.notifNotVerified'))
      await userEvent.click(screen.getByText('activeAlerts.no'))

      expect(screen.getByText('activeAlerts.checkSystemSettings')).toBeInTheDocument()
    })

    it('hides the yes/no buttons after failing', async () => {
      render(<NotificationVerifyIndicator />)
      await userEvent.click(screen.getByTitle('activeAlerts.notifNotVerified'))
      await userEvent.click(screen.getByText('activeAlerts.no'))

      expect(screen.queryByText('activeAlerts.yes')).not.toBeInTheDocument()
      expect(screen.queryByText('activeAlerts.no')).not.toBeInTheDocument()
    })

    it('does not call setBrowserNotifVerified', async () => {
      render(<NotificationVerifyIndicator />)
      await userEvent.click(screen.getByTitle('activeAlerts.notifNotVerified'))
      await userEvent.click(screen.getByText('activeAlerts.no'))

      expect(mockSetBrowserNotifVerified).not.toHaveBeenCalled()
    })
  })

  // ---- Notification constructor error resilience ----

  describe('error resilience', () => {
    it('does not crash when Notification constructor throws', async () => {
      const ThrowingNotification = vi.fn().mockImplementation(() => {
        throw new Error('Notifications disabled by system')
      })
      Object.defineProperty(ThrowingNotification, 'permission', {
        value: 'granted',
        configurable: true,
      })
      Object.defineProperty(window, 'Notification', {
        value: ThrowingNotification,
        configurable: true,
        writable: true,
      })

      render(<NotificationVerifyIndicator />)
      // Should not throw — the catch block in handleSendTestNotif swallows errors
      await userEvent.click(screen.getByTitle('activeAlerts.notifNotVerified'))
      // Still transitions to asked state despite constructor throwing
      expect(screen.getByText('activeAlerts.didYouSeeIt')).toBeInTheDocument()
    })
  })
})
