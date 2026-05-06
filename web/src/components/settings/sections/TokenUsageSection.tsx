import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Save, Coins, RefreshCw } from 'lucide-react'
import { StatusBadge } from '../../../components/ui/StatusBadge'
import { Button } from '../../../components/ui/Button'
import { getTokenAlertLevel, type TokenUsage, type TokenAlertLevel } from '../../../hooks/useTokenUsage'
import { UI_FEEDBACK_TIMEOUT_MS } from '../../../lib/constants/network'

interface TokenUsageSectionProps {
  usage: TokenUsage
  updateSettings: (settings: Partial<Omit<TokenUsage, 'used' | 'resetDate'>>) => void
  resetUsage: () => void
  isDemoData: boolean
}

const TOKEN_ALERT_TEXT_STYLES: Record<TokenAlertLevel, string> = {
  normal: 'text-green-400',
  warning: 'text-yellow-400',
  critical: 'text-red-400',
  stopped: 'text-red-400 font-medium',
}

const TOKEN_ALERT_BAR_STYLES: Record<TokenAlertLevel, string> = {
  normal: 'bg-green-500',
  warning: 'bg-yellow-500',
  critical: 'bg-red-500',
  stopped: 'bg-red-500',
}

export function TokenUsageSection({ usage, updateSettings, resetUsage, isDemoData }: TokenUsageSectionProps) {
  const { t } = useTranslation()
  const [tokenLimit, setTokenLimit] = useState(usage.limit)
  const [warningThreshold, setWarningThreshold] = useState(usage.warningThreshold * 100)
  const [criticalThreshold, setCriticalThreshold] = useState(usage.criticalThreshold * 100)
  const [saved, setSaved] = useState(false)
  const [thresholdError, setThresholdError] = useState<string | null>(null)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const usagePercent = usage.limit > 0 ? Math.min((usage.used / usage.limit) * 100, 100) : 0
  const alertLevel = getTokenAlertLevel(usage)
  const usageBarClass = isDemoData ? 'bg-yellow-500' : TOKEN_ALERT_BAR_STYLES[alertLevel]
  const usageTextClass = isDemoData ? 'text-yellow-400' : TOKEN_ALERT_TEXT_STYLES[alertLevel]

  // Token limit value that effectively disables all AI operations
  const DISABLED_TOKEN_LIMIT = 0

  useEffect(() => {
    return () => clearTimeout(savedTimerRef.current)
  }, [])

  const handleSaveTokenSettings = () => {
    // #8869: warning must be strictly less than critical, otherwise alert semantics invert
    if (warningThreshold >= criticalThreshold) {
      setThresholdError(t('settings.tokens.validation.warningMustBeLower'))
      return
    }
    setThresholdError(null)

    // #8870: a limit of 0 silently disables all AI operations; require explicit confirmation
    if (tokenLimit === DISABLED_TOKEN_LIMIT) {
      const confirmed = window.confirm(t('settings.tokens.validation.limitZeroConfirm'))
      if (!confirmed) return
    }

    updateSettings({
      limit: tokenLimit,
      warningThreshold: warningThreshold / 100,
      criticalThreshold: criticalThreshold / 100,
    })
    setSaved(true)
    clearTimeout(savedTimerRef.current)
    savedTimerRef.current = setTimeout(() => setSaved(false), UI_FEEDBACK_TIMEOUT_MS)
  }

  return (
    <div id="token-usage-settings" className={`glass rounded-xl p-6 ${isDemoData ? 'border border-yellow-500/20' : ''}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-secondary">
            <Coins className="w-5 h-5 text-muted-foreground" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-medium text-foreground">{t('settings.tokens.title')}</h2>
              {isDemoData && (
                <StatusBadge color="yellow" variant="outline" role="img" aria-label={t('settings.tokens.demoBadgeAriaLabel')}>
                  {t('settings.tokens.demoBadge')}
                </StatusBadge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{t('settings.tokens.subtitle')}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="md"
          icon={<RefreshCw className="w-4 h-4" />}
          onClick={resetUsage}
        >
          {t('settings.tokens.resetUsage')}
        </Button>
      </div>

      {isDemoData && (
        <div className="mb-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
          <p className="text-sm text-yellow-400/90">
            <strong className="font-medium">{t('settings.tokens.demoModeLabel')}</strong> {t('settings.tokens.demoModeMessage')}
          </p>
        </div>
      )}

      <div className="space-y-4">
        {/* Current usage */}
        <div className="p-4 rounded-lg bg-secondary/30">
          <div className="flex justify-between mb-2">
            <span className="text-sm text-muted-foreground">{t('settings.tokens.currentUsage')}</span>
            <span className="text-sm font-mono text-foreground">
              {usage.used.toLocaleString()} / {usage.limit.toLocaleString()} {t('settings.tokens.tokensLabel')}
            </span>
          </div>
          <div className="relative">
            <div className="h-2 bg-secondary rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${usageBarClass}`}
                style={{ width: `${usagePercent}%` }}
              />
            </div>
            <div className="flex justify-between mt-1">
              <span className={`text-xs font-medium ${usageTextClass}`}>
                {t('settings.tokens.percentUsed', { percent: usagePercent.toFixed(1) })}
              </span>
              <span className="text-xs text-muted-foreground">
                {t('settings.tokens.remaining', { count: Math.max(usage.limit - usage.used, 0).toLocaleString() })}
              </span>
            </div>
          </div>
        </div>

        {/* Settings */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label htmlFor="token-limit" className="block text-sm text-muted-foreground mb-1">{t('settings.tokens.monthlyLimit')}</label>
            <input
              id="token-limit"
              type="number"
              value={tokenLimit}
              onChange={(e) => setTokenLimit(parseInt(e.target.value) || 0)}
              aria-label={t('settings.tokens.monthlyLimit')}
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground text-sm"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {t('settings.tokens.monthlyLimitHint')}
            </p>
          </div>
          <div>
            <label htmlFor="warning-threshold" className="block text-sm text-muted-foreground mb-1">{t('settings.tokens.warningAt')}</label>
            <div className="relative">
              <input
                id="warning-threshold"
                type="number"
                value={warningThreshold}
                onChange={(e) => setWarningThreshold(parseInt(e.target.value) || 0)}
                min="0"
                max="100"
                aria-label="Warning threshold percentage"
                className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground text-sm"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-yellow-400 text-sm" aria-hidden="true">%</span>
            </div>
            <p className="mt-1 text-xs text-yellow-400/70">
              {t('settings.tokens.warningAtHint', { percent: warningThreshold })}
            </p>
          </div>
          <div>
            <label htmlFor="critical-threshold" className="block text-sm text-muted-foreground mb-1">{t('settings.tokens.criticalAt')}</label>
            <div className="relative">
              <input
                id="critical-threshold"
                type="number"
                value={criticalThreshold}
                onChange={(e) => setCriticalThreshold(parseInt(e.target.value) || 0)}
                min="0"
                max="100"
                aria-label="Critical threshold percentage"
                className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground text-sm"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-red-400 text-sm" aria-hidden="true">%</span>
            </div>
            <p className="mt-1 text-xs text-red-400/70">
              {t('settings.tokens.criticalAtHint', { percent: criticalThreshold })}
            </p>
          </div>
        </div>

        {thresholdError && (
          <p role="alert" className="text-sm text-red-400">
            {thresholdError}
          </p>
        )}

        <button
          onClick={handleSaveTokenSettings}
          disabled={saved}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-500 text-white hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Save className="w-4 h-4" />
          {saved ? t('settings.tokens.saved') : t('settings.tokens.saveSettings')}
        </button>
      </div>
    </div>
  )
}
