import { useState } from 'react'
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
  } catch (e) {
    console.error('Failed to save notification config:', e)
  }
}

export function NotificationSettingsSection() {
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
      setTestResult({ type: 'slack', success: false, message: 'Please configure Slack webhook URL first' })
      return
    }

    setTestResult(null)
    try {
      await testNotification('slack', {
        slackWebhookUrl: config.slackWebhookUrl,
        slackChannel: config.slackChannel,
      })
      setTestResult({ type: 'slack', success: true, message: 'Test notification sent successfully!' })
    } catch (error) {
      setTestResult({
        type: 'slack',
        success: false,
        message: error instanceof Error ? error.message : 'Failed to send test notification',
      })
    }
  }

  const handleTestEmail = async () => {
    if (!config.emailSMTPHost || !config.emailFrom || !config.emailTo) {
      setTestResult({ type: 'email', success: false, message: 'Please configure all required email fields first' })
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
      setTestResult({ type: 'email', success: true, message: 'Test email sent successfully!' })
    } catch (error) {
      setTestResult({
        type: 'email',
        success: false,
        message: error instanceof Error ? error.message : 'Failed to send test email',
      })
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <div className="flex items-center gap-3 mb-4">
        <Bell className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-semibold text-foreground">Alert Notifications</h2>
      </div>

      <p className="text-sm text-muted-foreground mb-6">
        Configure notification channels for alert delivery. Alerts will be sent to all enabled channels.
      </p>

      {/* Slack Configuration */}
      <div className="space-y-4 mb-6">
        <div className="flex items-center gap-2 pb-2 border-b border-border">
          <Slack className="w-4 h-4 text-foreground" />
          <h3 className="text-sm font-medium text-foreground">Slack Integration</h3>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            Webhook URL *
          </label>
          <input
            type="text"
            value={config.slackWebhookUrl || ''}
            onChange={e => updateConfig({ slackWebhookUrl: e.target.value })}
            placeholder="https://hooks.slack.com/services/..."
            className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Create a webhook in your Slack workspace settings
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            Channel (optional)
          </label>
          <input
            type="text"
            value={config.slackChannel || ''}
            onChange={e => updateConfig({ slackChannel: e.target.value })}
            placeholder="#alerts"
            className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Override the default channel configured in webhook
          </p>
        </div>

        <button
          onClick={handleTestSlack}
          disabled={isLoading}
          className="px-4 py-2 text-sm rounded-lg bg-purple-500 text-white hover:bg-purple-600 transition-colors disabled:opacity-50"
        >
          {isLoading ? 'Testing...' : 'Test Slack Notification'}
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
          <h3 className="text-sm font-medium text-foreground">Email Integration</h3>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              SMTP Host *
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
              SMTP Port
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
            From Address *
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
            To Address(es) *
          </label>
          <input
            type="text"
            value={config.emailTo || ''}
            onChange={e => updateConfig({ emailTo: e.target.value })}
            placeholder="team@example.com, oncall@example.com"
            className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Comma-separated list of email addresses
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Username
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
              Password
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
          {isLoading ? 'Testing...' : 'Test Email Notification'}
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
          💡 <strong>Tip:</strong> Configure notification channels here, then add them to specific alert rules in the Alert Rules editor.
          Each rule can have multiple notification channels with different configurations.
        </p>
      </div>
    </div>
  )
}
