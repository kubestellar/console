import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, X } from 'lucide-react'
import { Slack } from '@/lib/icons'
import { NotificationConfig } from '../../../types/alerts'
import type { TestResultState } from './NotificationSettingsSection'

// Strict Slack incoming webhook URL: https://hooks.slack.com/services/<token>.
// Blocks arbitrary text/URLs from being POSTed to a non-Slack endpoint.
const SLACK_WEBHOOK_REGEX = /^https:\/\/hooks\.slack\.com\/services\/\S+$/

interface SlackNotificationSettingsProps {
  config: NotificationConfig
  updateConfig: (updates: Partial<NotificationConfig>) => void
  testResult: TestResultState | null
  setTestResult: (result: TestResultState | null) => void
  testNotification: (type: 'slack' | 'email' | 'webhook', config: Record<string, unknown>) => Promise<unknown>
  isLoading: boolean
}

/**
 * Slack notification channel configuration.
 * Manages webhook URL, channel, and test notification flow.
 */
export function SlackNotificationSettings({
  config,
  updateConfig,
  testResult,
  setTestResult,
  testNotification,
  isLoading,
}: SlackNotificationSettingsProps) {
  const { t } = useTranslation()
  const [urlError, setUrlError] = useState<string | null>(null)

  const handleUrlChange = (value: string) => {
    updateConfig({ slackWebhookUrl: value })
    const trimmed = value.trim()
    if (trimmed.length > 0 && !SLACK_WEBHOOK_REGEX.test(trimmed)) {
      setUrlError(t('settings.notifications.slack.invalidWebhookUrl'))
    } else {
      setUrlError(null)
    }
  }

  const handleTestSlack = async () => {
    if (!config.slackWebhookUrl) {
      setTestResult({ type: 'slack', success: false, message: t('settings.notifications.slack.configureFirst') })
      return
    }
    if (!SLACK_WEBHOOK_REGEX.test(config.slackWebhookUrl.trim())) {
      setUrlError(t('settings.notifications.slack.invalidWebhookUrl'))
      setTestResult({ type: 'slack', success: false, message: t('settings.notifications.slack.invalidWebhookUrl') })
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

  return (
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
          onChange={e => handleUrlChange(e.target.value)}
          placeholder="https://hooks.slack.com/services/..."
          aria-invalid={!!urlError}
          aria-describedby={urlError ? 'slack-webhook-url-error' : undefined}
          className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-purple-500"
        />
        {urlError && (
          <p id="slack-webhook-url-error" role="alert" className="mt-1 text-xs text-red-400">{urlError}</p>
        )}
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
          className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-purple-500"
        />
        <p className="text-xs text-muted-foreground mt-1">
          {t('settings.notifications.slack.channelHint')}
        </p>
      </div>

      <button
        onClick={handleTestSlack}
        disabled={isLoading || !!urlError}
        className="px-4 py-2 text-sm rounded-lg bg-purple-500 text-white hover:bg-purple-600 transition-colors disabled:opacity-50"
      >
        {isLoading ? t('settings.notifications.slack.testing') : t('settings.notifications.slack.testNotification')}
      </button>

      {testResult && testResult.type === 'slack' && (
        <div
          className={`flex items-start gap-2 p-3 rounded-lg ${
            testResult.success ? 'bg-green-500/20 border border-green-500/20' : 'bg-red-500/20 border border-red-500/20'
          }`}
        >
          {testResult.success ? (
            <Check className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
          ) : (
            <X className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          )}
          <p className={`text-sm ${testResult.success ? 'text-green-400' : 'text-red-400'}`}>
            {testResult.message}
          </p>
        </div>
      )}
    </div>
  )
}
