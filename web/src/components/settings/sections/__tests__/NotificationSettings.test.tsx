/**
 * Notification Settings Section Tests
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))

/** Timeout for importing heavy modules */
const IMPORT_TIMEOUT_MS = 30000

describe('NotificationSettingsSection', () => {
  it('exports NotificationSettingsSection', async () => {
    const mod = await import('../NotificationSettingsSection')
    expect(mod.NotificationSettingsSection).toBeDefined()
  }, IMPORT_TIMEOUT_MS)
})

describe('BrowserNotificationSettings', () => {
  it('exports BrowserNotificationSettings', async () => {
    const mod = await import('../BrowserNotificationSettings')
    expect(mod.BrowserNotificationSettings).toBeDefined()
  }, IMPORT_TIMEOUT_MS)
})

describe('EmailNotificationSettings', () => {
  it('exports EmailNotificationSettings', async () => {
    const mod = await import('../EmailNotificationSettings')
    expect(mod.EmailNotificationSettings).toBeDefined()
  }, IMPORT_TIMEOUT_MS)
})

describe('SlackNotificationSettings', () => {
  it('exports SlackNotificationSettings', async () => {
    const mod = await import('../SlackNotificationSettings')
    expect(mod.SlackNotificationSettings).toBeDefined()
  }, IMPORT_TIMEOUT_MS)
})

describe('PagerDutyNotificationSettings', () => {
  it('exports PagerDutyNotificationSettings', async () => {
    const mod = await import('../PagerDutyNotificationSettings')
    expect(mod.PagerDutyNotificationSettings).toBeDefined()
  }, IMPORT_TIMEOUT_MS)
})

describe('OpsGenieNotificationSettings', () => {
  it('exports OpsGenieNotificationSettings', async () => {
    const mod = await import('../OpsGenieNotificationSettings')
    expect(mod.OpsGenieNotificationSettings).toBeDefined()
  }, IMPORT_TIMEOUT_MS)
})
