import { useTranslation } from 'react-i18next'
import { Siren, Check, X } from 'lucide-react'
import { NotificationConfig } from '../../../types/alerts'
import type { TestResultState } from './NotificationSettingsSection'
import { cn } from '../../../lib/cn'

interface PagerDutyNotificationSettingsProps {
  config: NotificationConfig
  updateConfig: (updates: Partial<NotificationConfig>) => void
  testResult: TestResultState | null
  setTestResult: (result: TestResultState | null) => void
  testNotification: (type: 'slack' | 'email' | 'webhook' | 'pagerduty' | 'opsgenie', config: Record<string, unknown>) => Promise<unknown>
  isLoading: boolean
}

/**
 * PagerDuty notification channel configuration.
 * Manages routing key and test notification flow.
 */
export function PagerDutyNotificationSettings({
  config,
  updateConfig,
  testResult,
  setTestResult,
  testNotification,
  isLoading,
}: PagerDutyNotificationSettingsProps) {
  const { t } = useTranslation()
  const hasStoredRoutingKey = config.pagerdutyRoutingKeyConfigured === true && !config.pagerdutyRoutingKey

  const handleTestPagerDuty = async () => {
    if (!config.pagerdutyRoutingKey) {
      setTestResult({ type: 'pagerduty', success: false, message: t('settings.notifications.pagerduty.routingKeyRequired') })
      return
    }

    setTestResult(null)
    try {
      await testNotification('pagerduty', {
        pagerdutyRoutingKey: config.pagerdutyRoutingKey,
      })
      setTestResult({ type: 'pagerduty', success: true, message: t('settings.notifications.pagerduty.testSuccess') })
    } catch (error: unknown) {
      setTestResult({
        type: 'pagerduty',
        success: false,
        message: error instanceof Error ? error.message : t('settings.notifications.pagerduty.testFailed'),
      })
    }
  }

  return (
    <div className="space-y-4 mb-6">
      <div className="flex items-center gap-2 pb-2 border-b border-border">
        <Siren className="w-4 h-4 text-foreground" />
        <h3 className="text-sm font-medium text-foreground">{t('settings.notifications.pagerduty.title', 'PagerDuty')}</h3>
      </div>

      <div>
        <label htmlFor="pagerduty-routing-key" className="block text-sm font-medium text-foreground mb-1">
          {t('settings.notifications.pagerduty.routingKey', 'Integration / Routing Key')}
        </label>
        <input
          id="pagerduty-routing-key"
          type="password"
          value={config.pagerdutyRoutingKey || ''}
          onChange={e => updateConfig({
            pagerdutyRoutingKey: e.target.value,
            pagerdutyRoutingKeyConfigured: e.target.value.trim().length > 0,
          })}
          placeholder="e.g. a1b2c3d4e5f6..."
          className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-primary"
        />
        {hasStoredRoutingKey && (
          <p className="mt-1 text-xs text-green-400">
            {t('settings.notifications.secretConfigured')}
          </p>
        )}
        <p className="text-xs text-muted-foreground mt-1">
          {t('settings.notifications.pagerduty.routingKeyHint', 'Find this under Services > Integrations > Events API v2 in PagerDuty')}
        </p>
      </div>

      <button
        onClick={handleTestPagerDuty}
        disabled={isLoading}
        className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
      >
        {isLoading ? t('settings.notifications.pagerduty.testing') : t('settings.notifications.pagerduty.testNotification', 'Test PagerDuty')}
      </button>

      {testResult && testResult.type === 'pagerduty' && (
        <div
          className={`flex items-start gap-2 p-3 rounded-lg border ${
            testResult.success ? 'bg-green-500/10 border-green-500/20' : 'bg-red-500/10 border-red-500/20'
          }`}
        >
          {testResult.success ? (
            <Check className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
          ) : (
            <X className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          )}
          <p className={cn('text-sm', testResult.success ? 'text-green-400' : 'text-red-400')}>
            {testResult.message}
          </p>
        </div>
      )}
    </div>
  )
}
