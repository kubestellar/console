import React from 'react'
/**
 * Unit tests for NotificationVerifyIndicator (part of #21095 / #21094).
 *
 * The indicator drives the browser-notification verification flow shown in
 * the ActiveAlerts card header. It has four states (idle / asked / verified
 * / failed) that gate rendering, and it persists confirmation via
 * `notificationStatus`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}))

const isBrowserNotifVerified = vi.fn()
const setBrowserNotifVerified = vi.fn()

vi.mock('../../../lib/notificationStatus', () => ({
  isBrowserNotifVerified: (...args: unknown[]) => isBrowserNotifVerified(...args),
  setBrowserNotifVerified: (...args: unknown[]) => setBrowserNotifVerified(...args),
}))

// Import after mocks so the component picks them up.
import { NotificationVerifyIndicator } from '../NotificationVerifyIndicator'

type NotificationCtor = typeof globalThis.Notification

interface NotificationInstanceStub {
  title: string
  options?: unknown
}

interface MockNotificationCtor {
  (title: string, options?: unknown): NotificationInstanceStub
  permission: NotificationPermission
  requestPermission?: () => Promise<NotificationPermission>
}

function installNotification(permission: NotificationPermission | null, opts: { throwOnConstruct?: boolean } = {}) {
  if (permission === null) {
    // Simulate a browser without the Notification API.
    // @ts-expect-error intentional undefined for feature-detection branch
    delete (globalThis as { Notification?: NotificationCtor }).Notification
    return { instances: [] as NotificationInstanceStub[] }
  }
  const instances: NotificationInstanceStub[] = []
  const ctor = function (this: NotificationInstanceStub, title: string, options?: unknown) {
    if (opts.throwOnConstruct) {
      throw new Error('notification blocked')
    }
    this.title = title
    this.options = options
    instances.push(this)
    return this
  } as unknown as MockNotificationCtor
  ctor.permission = permission
  ctor.requestPermission = async () => permission
  ;(globalThis as unknown as { Notification: MockNotificationCtor }).Notification = ctor
  return { instances }
}

describe('NotificationVerifyIndicator', () => {
  const originalNotification = (globalThis as { Notification?: unknown }).Notification

  beforeEach(() => {
    isBrowserNotifVerified.mockReset().mockReturnValue(false)
    setBrowserNotifVerified.mockReset().mockReturnValue(true)
  })

  afterEach(() => {
    cleanup()
    if (originalNotification === undefined) {
      // @ts-expect-error cleanup
      delete (globalThis as { Notification?: unknown }).Notification
    } else {
      ;(globalThis as { Notification?: unknown }).Notification = originalNotification
    }
  })

  it('renders nothing when the Notification API is unavailable', () => {
    installNotification(null)
    const { container } = render(<NotificationVerifyIndicator />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when Notification permission is "default" (not yet granted)', () => {
    installNotification('default')
    const { container } = render(<NotificationVerifyIndicator />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when Notification permission is not granted', () => {
    installNotification('denied')
    const { container } = render(<NotificationVerifyIndicator />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when the user has already verified notifications', () => {
    installNotification('granted')
    isBrowserNotifVerified.mockReturnValue(true)
    const { container } = render(<NotificationVerifyIndicator />)
    expect(container.firstChild).toBeNull()
  })

  it('renders the bell button in the idle state when permission is granted but unverified', () => {
    installNotification('granted')
    render(<NotificationVerifyIndicator />)
    const button = screen.getByTitle('activeAlerts.notifNotVerified')
    expect(button).toBeTruthy()
    expect(button.tagName).toBe('BUTTON')
  })

  it('shows the amber dot indicating unverified state', () => {
    installNotification('granted')
    const { container } = render(<NotificationVerifyIndicator />)
    const dot = container.querySelector('.bg-amber-400')
    expect(dot).toBeTruthy()
  })

  it('sends a test notification and advances to the asked state on click', async () => {
    const { instances } = installNotification('granted')
    const user = userEvent.setup()
    render(<NotificationVerifyIndicator />)
    await user.click(screen.getByTitle('activeAlerts.notifNotVerified'))
    expect(instances).toHaveLength(1)
    expect(instances[0].title).toBe('KubeStellar Console')
    expect(screen.getByText('activeAlerts.didYouSeeIt')).toBeTruthy()
    expect(screen.getByText('activeAlerts.yes')).toBeTruthy()
    expect(screen.getByText('activeAlerts.no')).toBeTruthy()
  })

  it('still transitions to the asked state when the Notification constructor throws', async () => {
    installNotification('granted', { throwOnConstruct: true })
    const user = userEvent.setup()
    render(<NotificationVerifyIndicator />)
    await user.click(screen.getByTitle('activeAlerts.notifNotVerified'))
    expect(screen.getByText('activeAlerts.didYouSeeIt')).toBeTruthy()
  })

  it('persists verification and hides the indicator when the user confirms yes', async () => {
    installNotification('granted')
    const user = userEvent.setup()
    const { container } = render(<NotificationVerifyIndicator />)
    await user.click(screen.getByTitle('activeAlerts.notifNotVerified'))
    await user.click(screen.getByText('activeAlerts.yes'))
    expect(setBrowserNotifVerified).toHaveBeenCalledWith(true)
    expect(container.firstChild).toBeNull()
  })

  it('surfaces the check-settings hint when the user confirms no', async () => {
    installNotification('granted')
    const user = userEvent.setup()
    render(<NotificationVerifyIndicator />)
    await user.click(screen.getByTitle('activeAlerts.notifNotVerified'))
    await user.click(screen.getByText('activeAlerts.no'))
    expect(setBrowserNotifVerified).not.toHaveBeenCalled()
    expect(screen.getByText('activeAlerts.checkSystemSettings')).toBeTruthy()
  })
})
