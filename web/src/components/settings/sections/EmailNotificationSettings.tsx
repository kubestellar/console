import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Mail, Check, X } from 'lucide-react'
import { NotificationConfig } from '../../../types/alerts'
import type { TestResultState } from './NotificationSettingsSection'

/** Default SMTP port for email configuration */
const DEFAULT_SMTP_PORT = 587
/** Minimum valid TCP port number (inclusive) */
const MIN_PORT = 1
/** Maximum valid TCP port number (inclusive) */
const MAX_PORT = 65535

interface EmailNotificationSettingsProps {
  config: NotificationConfig
  updateConfig: (updates: Partial<NotificationConfig>) => void
  testResult: TestResultState | null
  setTestResult: (result: TestResultState | null) => void
  testNotification: (type: 'slack' | 'email' | 'webhook', config: Record<string, unknown>) => Promise<unknown>
  isLoading: boolean
}

/**
 * Email notification channel configuration.
 * Manages SMTP settings, addresses, and test notification flow.
 */
export function EmailNotificationSettings({
  config,
  updateConfig,
  testResult,
  setTestResult,
  testNotification,
  isLoading,
}: EmailNotificationSettingsProps) {
  const { t } = useTranslation()
  const [portRaw, setPortRaw] = useState<string>(
    config.emailSMTPPort != null ? String(config.emailSMTPPort) : String(DEFAULT_SMTP_PORT),
  )
  const [portError, setPortError] = useState<string | null>(null)

  const handlePortChange = (value: string) => {
    setPortRaw(value)
    const trimmed = value.trim()
    // Empty, non-integer, or out-of-range values are rejected. We only push a
    // valid integer to the shared config so a cleared field never silently
    // reverts to the default — the user sees an inline error instead.
    if (trimmed.length === 0 || !/^\d+$/.test(trimmed)) {
      setPortError(t('settings.notifications.email.invalidSmtpPort'))
      return
    }
    const parsed = parseInt(trimmed, 10)
    if (parsed < MIN_PORT || parsed > MAX_PORT) {
      setPortError(t('settings.notifications.email.invalidSmtpPort'))
      return
    }
    setPortError(null)
    updateConfig({ emailSMTPPort: parsed })
  }

  const handleTestEmail = async () => {
    if (!config.emailSMTPHost || !config.emailFrom || !config.emailTo) {
      setTestResult({ type: 'email', success: false, message: t('settings.notifications.email.configureFirst') })
      return
    }
    if (portError) {
      setTestResult({ type: 'email', success: false, message: portError })
      return
    }

    setTestResult(null)
    try {
      await testNotification('email', {
        emailSMTPHost: config.emailSMTPHost,
        emailSMTPPort: config.emailSMTPPort || DEFAULT_SMTP_PORT,
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
            className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-purple-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            {t('settings.notifications.email.smtpPort')}
          </label>
          <input
            type="number"
            value={portRaw}
            onChange={e => handlePortChange(e.target.value)}
            placeholder={String(DEFAULT_SMTP_PORT)}
            min={MIN_PORT}
            max={MAX_PORT}
            aria-invalid={!!portError}
            aria-describedby={portError ? 'email-smtp-port-error' : undefined}
            className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-purple-500"
          />
          {portError && (
            <p id="email-smtp-port-error" role="alert" className="mt-1 text-xs text-red-400">{portError}</p>
          )}
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
          className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-purple-500"
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
          className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-purple-500"
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
            className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-purple-500"
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
            className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-purple-500"
          />
        </div>
      </div>

      <button
        onClick={handleTestEmail}
        disabled={isLoading || !!portError}
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
