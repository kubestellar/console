import { useTranslation } from 'react-i18next'
import { ShieldAlert, Check, X } from 'lucide-react'
import { NotificationConfig } from '../../../types/alerts'
import type { TestResultState } from './NotificationSettingsSection'

interface OpsGenieNotificationSettingsProps {
  config: NotificationConfig
  updateConfig: (updates: Partial<NotificationConfig>) => void
  testResult: TestResultState | null
  setTestResult: (result: TestResultState | null) => void
  testNotification: (type: 'slack' | 'email' | 'webhook' | 'pagerduty' | 'opsgenie', config: Record<string, unknown>) => Promise<unknown>
  isLoading: boolean
}

/**
 * OpsGenie notification channel configuration.
 * Manages API key and test notification flow.
 */
export function OpsGenieNotificationSettings({
  config,
  updateConfig,
  testResult,
  setTestResult,
  testNotification,
  isLoading,
}: OpsGenieNotificationSettingsProps) {
  const { t } = useTranslation()

  const handleTestOpsGenie = async () => {
    if (!config.opsgenieApiKey) {
      setTestResult({ type: 'opsgenie', success: false, message: t('settings.notifications.opsgenie.apiKeyRequired') })
      return
    }

    setTestResult(null)
    try {
      await testNotification('opsgenie', {
        opsgenieApiKey: config.opsgenieApiKey,
      })
      setTestResult({ type: 'opsgenie', success: true, message: t('settings.notifications.opsgenie.testSuccess') })
    } catch (error) {
      setTestResult({
        type: 'opsgenie',
        success: false,
        message: error instanceof Error ? error.message : t('settings.notifications.opsgenie.testFailed'),
      })
    }
  }

  return (
    <div className="space-y-4 mb-6">
      <div className="flex items-center gap-2 pb-2 border-b border-border">
        <ShieldAlert className="w-4 h-4 text-foreground" />
        <h3 className="text-sm font-medium text-foreground">{t('settings.notifications.opsgenie.title', 'OpsGenie')}</h3>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-1">
          {t('settings.notifications.opsgenie.apiKey', 'API Key')}
        </label>
        <input
          type="password"
          value={config.opsgenieApiKey || ''}
          onChange={e => updateConfig({ opsgenieApiKey: e.target.value })}
          placeholder="e.g. xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
        <p className="text-xs text-muted-foreground mt-1">
          {t('settings.notifications.opsgenie.apiKeyHint', 'Find this under Settings > API key management in OpsGenie')}
        </p>
      </div>

      <button
        onClick={handleTestOpsGenie}
        disabled={isLoading}
        className="px-4 py-2 text-sm rounded-lg bg-purple-500 text-white hover:bg-purple-600 transition-colors disabled:opacity-50"
      >
        {isLoading ? t('settings.notifications.opsgenie.testing') : t('settings.notifications.opsgenie.testNotification', 'Test OpsGenie')}
      </button>

      {testResult && testResult.type === 'opsgenie' && (
        <div
          className={`flex items-start gap-2 p-3 rounded-lg ${
            testResult.success ? 'bg-green-500/20 border border-green-500/20' : 'bg-red-500/20 border border-red-500/20'
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
  )
}
