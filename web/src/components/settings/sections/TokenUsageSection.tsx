import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Save, Coins, RefreshCw } from 'lucide-react'
import type { TokenUsage } from '../../../hooks/useTokenUsage'

interface TokenUsageSectionProps {
  usage: TokenUsage
  updateSettings: (settings: Partial<Omit<TokenUsage, 'used' | 'resetDate'>>) => void
  resetUsage: () => void
  isDemoData: boolean
}

export function TokenUsageSection({ usage, updateSettings, resetUsage, isDemoData }: TokenUsageSectionProps) {
  const { t } = useTranslation()
  const [tokenLimit, setTokenLimit] = useState(usage.limit)
  const [warningThreshold, setWarningThreshold] = useState(usage.warningThreshold * 100)
  const [criticalThreshold, setCriticalThreshold] = useState(usage.criticalThreshold * 100)
  const [saved, setSaved] = useState(false)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    return () => clearTimeout(savedTimerRef.current)
  }, [])

  const handleSaveTokenSettings = () => {
    updateSettings({
      limit: tokenLimit,
      warningThreshold: warningThreshold / 100,
      criticalThreshold: criticalThreshold / 100,
    })
    setSaved(true)
    clearTimeout(savedTimerRef.current)
    savedTimerRef.current = setTimeout(() => setSaved(false), 2000)
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
                <span className="text-xs px-2 py-0.5 bg-yellow-500/20 text-yellow-400 rounded border border-yellow-500/20" role="img" aria-label="Demo mode active">
                  Demo Data
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{t('settings.tokens.subtitle')}</p>
          </div>
        </div>
        <button
          onClick={resetUsage}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50"
        >
          <RefreshCw className="w-4 h-4" />
          {t('settings.tokens.resetUsage')}
        </button>
      </div>

      {isDemoData && (
        <div className="mb-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
          <p className="text-sm text-yellow-400/90">
            <strong className="font-medium">Demo Mode:</strong> Showing simulated token usage data. 
            To see live token consumption from your AI operations, ensure the kc-agent is running and connected.
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
                className={`h-full transition-all ${
                  isDemoData
                    ? 'bg-yellow-500'
                    : (usage.used / usage.limit) >= 0.9
                    ? 'bg-red-500'
                    : (usage.used / usage.limit) >= 0.7
                    ? 'bg-yellow-500'
                    : 'bg-green-500'
                }`}
                style={{ width: `${Math.min((usage.used / usage.limit) * 100, 100)}%` }}
              />
            </div>
            <div className="flex justify-between mt-1">
              <span className={`text-xs font-medium ${
                isDemoData
                  ? 'text-yellow-400'
                  : (usage.used / usage.limit) >= 0.9
                  ? 'text-red-400'
                  : (usage.used / usage.limit) >= 0.7
                  ? 'text-yellow-400'
                  : 'text-green-400'
              }`}>
                {((usage.used / usage.limit) * 100).toFixed(1)}% used
              </span>
              <span className="text-xs text-muted-foreground">
                {Math.max(usage.limit - usage.used, 0).toLocaleString()} remaining
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
              aria-label="Monthly token limit"
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground text-sm"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Maximum tokens per month
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
              Warning at {warningThreshold}% usage
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
              Critical at {criticalThreshold}% usage
            </p>
          </div>
        </div>

        <button
          onClick={handleSaveTokenSettings}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-500 text-white hover:bg-purple-600"
        >
          <Save className="w-4 h-4" />
          {saved ? t('settings.tokens.saved') : t('settings.tokens.saveSettings')}
        </button>
      </div>
    </div>
  )
}
