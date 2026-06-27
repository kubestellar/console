import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const { showToast, testNotification } = vi.hoisted(() => ({
  showToast: vi.fn(),
  testNotification: vi.fn(),
}))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}))

vi.mock('../../../../hooks/useNotificationAPI', () => ({
  useNotificationAPI: () => ({ testNotification, isLoading: false }),
}))

vi.mock('../../../ui/Toast', () => ({
  useToast: () => ({ showToast }),
}))

vi.mock('../BrowserNotificationSettings', () => ({
  BrowserNotificationSettings: () => <div data-testid="browser-settings">browser</div>,
}))

vi.mock('../SlackNotificationSettings', () => ({
  SlackNotificationSettings: () => <div data-testid="slack-settings">slack</div>,
}))

vi.mock('../EmailNotificationSettings', () => ({
  EmailNotificationSettings: ({
    config,
    updateConfig,
    isLoading,
  }: {
    config: { emailSMTPHost?: string }
    updateConfig: (updates: { emailSMTPHost: string }) => void
    isLoading: boolean
  }) => (
    <div data-testid="email-settings">
      <span data-testid="email-config">{config.emailSMTPHost ?? 'empty'}</span>
      <span data-testid="email-loading">{String(isLoading)}</span>
      <button type="button" onClick={() => updateConfig({ emailSMTPHost: 'smtp.example.com' })}>
        update-email
      </button>
    </div>
  ),
}))

vi.mock('../PagerDutyNotificationSettings', () => ({
  PagerDutyNotificationSettings: () => <div data-testid="pagerduty-settings">pagerduty</div>,
}))

vi.mock('../OpsGenieNotificationSettings', () => ({
  OpsGenieNotificationSettings: () => <div data-testid="opsgenie-settings">opsgenie</div>,
}))

import { NotificationSettingsSection } from '../NotificationSettingsSection'

const STORAGE_KEY = 'kc_notification_config'

describe('NotificationSettingsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('loads saved notification config from localStorage', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ emailSMTPHost: 'loaded.example.com' }))

    render(<NotificationSettingsSection />)

    expect(screen.getByTestId('browser-settings')).toBeInTheDocument()
    expect(screen.getByTestId('email-config')).toHaveTextContent('loaded.example.com')
    expect(screen.getByTestId('email-loading')).toHaveTextContent('false')
  })

  it('redacts stored notification secrets on load', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      emailSMTPHost: 'loaded.example.com',
      emailPassword: 'super-secret',
    }))

    render(<NotificationSettingsSection />)

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')).toEqual({
      emailSMTPHost: 'loaded.example.com',
      emailPassword: '',
      emailPasswordConfigured: true,
    })
  })

  it('persists config updates and emits a settings changed event', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')

    render(<NotificationSettingsSection />)

    fireEvent.click(screen.getByRole('button', { name: 'update-email' }))

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')).toEqual({ emailSMTPHost: 'smtp.example.com' })
    expect(dispatchSpy).toHaveBeenCalled()
  })

  it('shows a toast when saving notification config fails', () => {
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('storage unavailable')
    })

    render(<NotificationSettingsSection />)

    fireEvent.click(screen.getByRole('button', { name: 'update-email' }))

    expect(showToast).toHaveBeenCalledWith('Failed to save settings', 'error')
  })
})
