/**
 * SlackNotificationSettings component smoke tests
 */
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }),
}))

vi.mock('../../../../lib/demoMode', () => ({
  isDemoMode: () => true, getDemoMode: () => true, isNetlifyDeployment: false,
  isDemoModeForced: false, canToggleDemoMode: () => true, setDemoMode: vi.fn(),
  toggleDemoMode: vi.fn(), subscribeDemoMode: () => () => {},
  isDemoToken: () => true, hasRealToken: () => false, setDemoToken: vi.fn(),
  isFeatureEnabled: () => true,
}))

vi.mock('../../../../hooks/useDemoMode', () => ({
  getDemoMode: () => true, default: () => true,
  useDemoMode: () => ({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }),
  hasRealToken: () => false, isDemoModeForced: false, isNetlifyDeployment: false,
  canToggleDemoMode: () => true, isDemoToken: () => true, setDemoToken: vi.fn(),
  setGlobalDemoMode: vi.fn(),
}))

vi.mock('../../../../lib/analytics', () => ({
  emitNavigate: vi.fn(), emitLogin: vi.fn(), emitEvent: vi.fn(), analyticsReady: Promise.resolve(),
  emitAddCardModalOpened: vi.fn(), emitCardExpanded: vi.fn(), emitCardRefreshed: vi.fn(),
}))

vi.mock('../../../../hooks/useTokenUsage', () => ({
  useTokenUsage: () => ({ usage: { total: 0, remaining: 0, used: 0 }, isLoading: false }),
  tokenUsageTracker: { getUsage: () => ({ total: 0, remaining: 0, used: 0 }), trackRequest: vi.fn(), getSettings: () => ({ enabled: false }) },
}))

import { SlackNotificationSettings } from '../SlackNotificationSettings'

describe('SlackNotificationSettings', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <SlackNotificationSettings
        config={{
          slackEnabled: false,
          slackWebhookUrl: '',
          slackChannel: '',
          emailEnabled: false,
          emailRecipients: '',
          emailSmtpHost: '',
          emailSmtpPort: 587,
          emailFrom: '',
          webhookEnabled: false,
          webhookUrl: '',
          webhookHeaders: {},
          minSeverity: 'warning',
          quietHoursEnabled: false,
          quietHoursStart: '22:00',
          quietHoursEnd: '08:00',
          browserEnabled: false,
        }}
        updateConfig={vi.fn()}
        testResult={null}
        setTestResult={vi.fn()}
        testNotification={vi.fn().mockResolvedValue({})}
        isLoading={false}
      />
    )
    expect(container).toBeTruthy()
  })
})
