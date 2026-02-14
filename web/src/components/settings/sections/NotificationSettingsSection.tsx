import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Bell, Mail, Slack, Check, X } from 'lucide-react'
import { useNotificationAPI } from '../../../hooks/useNotificationAPI'
import { NotificationConfig } from '../../../types/alerts'

const STORAGE_KEY = 'kc_notification_config'

// Load from localStorage
function loadConfig(): NotificationConfig {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch (e) {
    console.error('Failed to load notification config:', e)
  }
  return {}
}

// Save to localStorage
function saveConfig(config: NotificationConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
    window.dispatchEvent(new CustomEvent('kubestellar-settings-changed'))
  } catch (e) {
    console.error('Failed to save notification config:', e)
  }
}

export function NotificationSettingsSection() {
  const { t } = useTranslation()
  const [config, setConfig] = useState<NotificationConfig>(loadConfig())
  const [testResult, setTestResult] = useState<{ type: string; success: boolean; message: string } | null>(null)
  const { testNotification, isLoading } = useNotificationAPI()

  const updateConfig = (updates: Partial<NotificationConfig>) => {
    const newConfig = { ...config, ...updates }
    setConfig(newConfig)
    saveConfig(newConfig)
  }

  const handleTestSlack = async () => {
    if (!config.slackWebhookUrl) {
      setTestResult({ type: 'slack', success: false, message: t('settings.notifications.slack.configureFirst') })
      return
    }

    setTestResult(null)
    try {
      await testNotification('slack', {
        slackWebhookUrl: config.slackWebhookUrl,
        slackChannel: config.slackChannel,
      })
      setTestResult({ type: 'slack', success: true, message: t('settings.notifications.slack.testSuccess') })
    } catch (error) {
      setTestResult({
        type: 'slack',
        success: false,
        message: error instanceof Error ? error.message : t('settings.notifications.slack.testFailed'),
      })
    }
  }

  const handleTestEmail = async () => {
    if (!config.emailSMTPHost || !config.emailFrom || !config.emailTo) {
      setTestResult({ type: 'email', success: false, message: t('settings.notifications.email.configureFirst') })
      return
    }

    setTestResult(null)
    try {
      await testNotification('email', {
        emailSMTPHost: config.emailSMTPHost,
        emailSMTPPort: config.emailSMTPPort || 587,
        emailFrom: config.emailFrom,
        emailTo: config.emailTo,
        emailUsername: config.emailUsername,
        emailPassword: config.emailPassword,
      })
      setTestResult({ type: 'email', success: true, message: t('settings.notifications.email.testSuccess') })
    } catch (error) {
      setTestResult({
        type: 'email',
        success: false,
        message: error instanceof Error ? error.message : t('settings.notifications.email.testFailed'),
      })
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

      {/* Slack Configuration */}
      <div className="space-y-4 mb-6">
        <div className="flex items-center gap-2 pb-2 border-b border-border">
          <Slack className="w-4 h-4 text-foreground" />
          <h3 className="text-sm font-medium text-foreground">{t('settings.notifications.slack.title')}</h3>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            {t('settings.notifications.slack.webhookUrl')}
          </label>
          <input
            type="text"
            value={config.slackWebhookUrl || ''}
            onChange={e => updateConfig({ slackWebhookUrl: e.target.value })}
            placeholder="https://hooks.slack.com/services/..."
            className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <p className="text-xs text-muted-foreground mt-1">
            {t('settings.notifications.slack.webhookHint')}
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            {t('settings.notifications.slack.channel')}
          </label>
          <input
            type="text"
            value={config.slackChannel || ''}
            onChange={e => updateConfig({ slackChannel: e.target.value })}
            placeholder="#alerts"
            className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <p className="text-xs text-muted-foreground mt-1">
            {t('settings.notifications.slack.channelHint')}
          </p>
        </div>

        <button
          onClick={handleTestSlack}
          disabled={isLoading}
          className="px-4 py-2 text-sm rounded-lg bg-purple-500 text-white hover:bg-purple-600 transition-colors disabled:opacity-50"
        >
          {isLoading ? t('settings.notifications.slack.testing') : t('settings.notifications.slack.testNotification')}
        </button>

        {testResult && testResult.type === 'slack' && (
          <div
            className={`flex items-start gap-2 p-3 rounded-lg ${
              testResult.success ? 'bg-green-500/10 border border-green-500/20' : 'bg-red-500/10 border border-red-500/20'
            }`}
          >
            {testResult.success ? (
              <Check className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
            ) : (
              <X className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            )}
            <p className={`text-sm ${testResult.success ? 'text-green-400' : 'text-red-400'}`}>
              {testResult.message}
            </p>
          </div>
        )}
      </div>

      {/* Email Configuration */}
      <div className="space-y-4 mb-6">
        <div className="flex items-center gap-2 pb-2 border-b border-border">
          <Mail className="w-4 h-4 text-foreground" />
          <h3 className="text-sm font-medium text-foreground">{t('settings.notifications.email.title')}</h3>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              {t('settings.notifications.email.smtpHost')}
            </label>
            <input
              type="text"
              value={config.emailSMTPHost || ''}
              onChange={e => updateConfig({ emailSMTPHost: e.target.value })}
              placeholder="smtp.gmail.com"
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              {t('settings.notifications.email.smtpPort')}
            </label>
            <input
              type="number"
              value={config.emailSMTPPort || 587}
              onChange={e => updateConfig({ emailSMTPPort: parseInt(e.target.value) })}
              placeholder="587"
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            {t('settings.notifications.email.fromAddress')}
          </label>
          <input
            type="email"
            value={config.emailFrom || ''}
            onChange={e => updateConfig({ emailFrom: e.target.value })}
            placeholder="alerts@example.com"
            className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            {t('settings.notifications.email.toAddresses')}
          </label>
          <input
            type="text"
            value={config.emailTo || ''}
            onChange={e => updateConfig({ emailTo: e.target.value })}
            placeholder="team@example.com, oncall@example.com"
            className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <p className="text-xs text-muted-foreground mt-1">
            {t('settings.notifications.email.toHint')}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              {t('settings.notifications.email.username')}
            </label>
            <input
              type="text"
              value={config.emailUsername || ''}
              onChange={e => updateConfig({ emailUsername: e.target.value })}
              placeholder="username"
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              {t('settings.notifications.email.password')}
            </label>
            <input
              type="password"
              value={config.emailPassword || ''}
              onChange={e => updateConfig({ emailPassword: e.target.value })}
              placeholder="password"
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
        </div>

        <button
          onClick={handleTestEmail}
          disabled={isLoading}
          className="px-4 py-2 text-sm rounded-lg bg-purple-500 text-white hover:bg-purple-600 transition-colors disabled:opacity-50"
        >
          {isLoading ? t('settings.notifications.email.testing') : t('settings.notifications.email.testNotification')}
        </button>

        {testResult && testResult.type === 'email' && (
          <div
            className={`flex items-start gap-2 p-3 rounded-lg ${
              testResult.success ? 'bg-green-500/10 border border-green-500/20' : 'bg-red-500/10 border border-red-500/20'
            }`}
          >
            {testResult.success ? (
              <Check className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
            ) : (
              <X className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            )}
            <p className={`text-sm ${testResult.success ? 'text-green-400' : 'text-red-400'}`}>
              {testResult.message}
            </p>
          </div>
        )}
      </div>

      {/* Info Box */}
      <div className="mt-6 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
        <p className="text-sm text-blue-400">
          {t('settings.notifications.tip')}
        </p>
      </div>
    </div>
  )
}
