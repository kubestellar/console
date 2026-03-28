import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Bell } from 'lucide-react'
import { useNotificationAPI } from '../../../hooks/useNotificationAPI'
import { NotificationConfig } from '../../../types/alerts'
import { BrowserNotificationSettings } from './BrowserNotificationSettings'
import { SlackNotificationSettings } from './SlackNotificationSettings'
import { EmailNotificationSettings } from './EmailNotificationSettings'
import { PagerDutyNotificationSettings } from './PagerDutyNotificationSettings'
import { OpsGenieNotificationSettings } from './OpsGenieNotificationSettings'
import { useToast } from '../../ui/Toast'

const STORAGE_KEY = 'kc_notification_config'

// Load from localStorage
function loadConfig(): NotificationConfig {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch {
    // Silently fall back to empty object {} (e.g. corrupted storage)
  }
  return {}
}

// Save to localStorage - returns true on success, false on failure
function saveConfig(config: NotificationConfig): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
    window.dispatchEvent(new CustomEvent('kubestellar-settings-changed'))
    return true
  } catch {
    return false
  }
}

/** Result of a test notification attempt */
export interface TestResultState {
  type: string
  success: boolean
  message: string
}

export function NotificationSettingsSection() {
  const { t } = useTranslation()
  const { showToast } = useToast()
  const [config, setConfig] = useState<NotificationConfig>(loadConfig())
  const [testResult, setTestResult] = useState<TestResultState | null>(null)
  const { testNotification, isLoading } = useNotificationAPI()

  const updateConfig = (updates: Partial<NotificationConfig>) => {
    const newConfig = { ...config, ...updates }
    setConfig(newConfig)
    if (!saveConfig(newConfig)) {
      showToast(t('settings.notifications.saveFailed', 'Failed to save settings'), 'error')
    }
  }

  return (
    <div id="notifications-settings" className="rounded-lg border border-border bg-card p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg bg-secondary">
          <Bell className="w-5 h-5 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-lg font-medium text-foreground">{t('settings.notifications.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('settings.notifications.subtitle')}</p>
        </div>
      </div>

      <p className="text-sm text-muted-foreground mb-6">
        {t('settings.notifications.description')}
      </p>

      {/* Browser Notifications */}
      <BrowserNotificationSettings />

      {/* Slack Configuration */}
      <SlackNotificationSettings
        config={config}
        updateConfig={updateConfig}
        testResult={testResult}
        setTestResult={setTestResult}
        testNotification={testNotification}
        isLoading={isLoading}
      />

      {/* Email Configuration */}
      <EmailNotificationSettings
        config={config}
        updateConfig={updateConfig}
        testResult={testResult}
        setTestResult={setTestResult}
        testNotification={testNotification}
        isLoading={isLoading}
      />

      {/* PagerDuty Configuration */}
      <PagerDutyNotificationSettings
        config={config}
        updateConfig={updateConfig}
        testResult={testResult}
        setTestResult={setTestResult}
        testNotification={testNotification}
        isLoading={isLoading}
      />

      {/* OpsGenie Configuration */}
      <OpsGenieNotificationSettings
        config={config}
        updateConfig={updateConfig}
        testResult={testResult}
        setTestResult={setTestResult}
        testNotification={testNotification}
        isLoading={isLoading}
      />

      {/* Info Box */}
      <div className="mt-6 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
        <p className="text-sm text-blue-400">
          {t('settings.notifications.tip')}
        </p>
      </div>
    </div>
  )
}
