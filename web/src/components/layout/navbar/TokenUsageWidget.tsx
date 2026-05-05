import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Coins, Rocket, Stethoscope, Lightbulb, TrendingUp, MoreHorizontal } from 'lucide-react'
import { useTokenUsage, type TokenCategory } from '../../../hooks/useTokenUsage'
import { StatusBadge } from '../../ui/StatusBadge'
import { cn } from '../../../lib/cn'
import { getSettingsWithHash } from '../../../config/routes'
import { UI_FEEDBACK_TIMEOUT_MS } from '../../../lib/constants/network'

const CATEGORY_CONFIG: Record<TokenCategory, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  missions: { label: 'AI Missions', icon: Rocket, color: 'bg-purple-500' },
  diagnose: { label: 'Diagnose', icon: Stethoscope, color: 'bg-blue-500' },
  insights: { label: 'Insights', icon: Lightbulb, color: 'bg-yellow-500' },
  predictions: { label: 'Predictions', icon: TrendingUp, color: 'bg-green-500' },
  other: { label: 'Other', icon: MoreHorizontal, color: 'bg-muted-foreground' },
}

interface TokenUsageWidgetProps {
  /** Force label text to be visible (used in overflow menu) */
  showLabel?: boolean
}

export function TokenUsageWidget({ showLabel = false }: TokenUsageWidgetProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { usage, alertLevel, percentage, remaining, isDemoData } = useTokenUsage()
  const [showTokenDetails, setShowTokenDetails] = useState(false)
  const [tokenAnimating, setTokenAnimating] = useState(false)
  const previousTokensRef = useRef<number>(usage.used)
  const tokenRef = useRef<HTMLDivElement>(null)

  // Animate token icon when usage increases significantly
  useEffect(() => {
    const increase = usage.used - previousTokensRef.current
    // Trigger animation if tokens increased by more than 100 (lowered for better visibility)
    if (increase > 100) {
      setTokenAnimating(true)
      const timer = setTimeout(() => setTokenAnimating(false), UI_FEEDBACK_TIMEOUT_MS)
      return () => clearTimeout(timer)
    }
    previousTokensRef.current = usage.used
  }, [usage.used])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tokenRef.current && !tokenRef.current.contains(event.target as Node)) {
        setShowTokenDetails(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="relative" ref={tokenRef}>
      <button
        data-testid="navbar-token-usage-btn"
        onClick={() => setShowTokenDetails(!showTokenDetails)}
        className={`flex items-center gap-2 px-3 py-1.5 h-9 rounded-lg transition-colors ${
          isDemoData
            ? 'bg-yellow-500/10 border border-yellow-500/20 text-yellow-400'
            : alertLevel === 'stopped'
            ? 'bg-red-500/20 text-red-400'
            : alertLevel === 'critical'
            ? 'bg-red-500/10 text-red-400'
            : alertLevel === 'warning'
            ? 'bg-yellow-500/10 text-yellow-400'
            : 'bg-secondary/50 text-muted-foreground hover:text-foreground'
        }`}
        title={t('layout.navbar.tokenUsageTitle', { percentage: percentage.toFixed(0), suffix: isDemoData ? ` (${t('layout.navbar.demoData')})` : '' })}
      >
        <Coins className={cn("w-4 h-4 transition-transform", tokenAnimating && "animate-bounce text-yellow-400 scale-125")} />
        {isDemoData && (
          <StatusBadge color="yellow" role="img" aria-label={t('layout.navbar.demoModeActive')}>{t('layout.demo')}</StatusBadge>
        )}
        <span className={cn("text-xs font-medium", showLabel ? 'inline' : 'hidden sm:inline')}>{percentage.toFixed(0)}%</span>
        <div className={cn("w-12 h-1.5 bg-secondary rounded-full overflow-hidden", showLabel ? 'block' : 'hidden sm:block')}>
          <div
            className={`h-full transition-all ${
              isDemoData
                ? 'bg-yellow-500'
                : alertLevel === 'stopped' || alertLevel === 'critical'
                ? 'bg-red-500'
                : alertLevel === 'warning'
                ? 'bg-yellow-500'
                : 'bg-green-500'
            }`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </button>

      {/* Token details dropdown */}
      {showTokenDetails && (
        <div data-testid="navbar-token-usage-dropdown" className="absolute top-full right-0 mt-2 w-64 bg-card border border-border rounded-lg shadow-xl p-4 z-toast">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium text-foreground">{t('layout.navbar.tokenUsage')}</h4>
            {isDemoData && (
              <StatusBadge color="yellow" variant="outline">{t('layout.navbar.demoData')}</StatusBadge>
            )}
          </div>
          {isDemoData && (
            <div className="mb-3 p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
              <p className="text-xs text-yellow-400/80">
                {t('layout.navbar.simulatedTokenUsage')}
              </p>
            </div>
          )}
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">{t('common.used')}</span>
              <span className="text-foreground font-mono">{usage.used.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">{t('layout.navbar.limit')}</span>
              <span className="text-foreground font-mono">{usage.limit.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">{t('layout.navbar.remaining')}</span>
              <span className="text-foreground font-mono">{remaining.toLocaleString()}</span>
            </div>
            <div className="h-2 bg-secondary rounded-full overflow-hidden mt-2">
              <div
                className={`h-full transition-all ${
                  isDemoData
                    ? 'bg-yellow-500'
                    : alertLevel === 'stopped' || alertLevel === 'critical'
                    ? 'bg-red-500'
                    : alertLevel === 'warning'
                    ? 'bg-yellow-500'
                    : 'bg-green-500'
                }`}
                style={{ width: `${percentage}%` }}
              />
            </div>
            <div className="flex justify-between text-xs mt-1">
              <span className={`${
                isDemoData
                  ? 'text-yellow-400'
                  : alertLevel === 'stopped'
                  ? 'text-red-400 font-medium'
                  : alertLevel === 'critical'
                  ? 'text-red-400'
                  : alertLevel === 'warning'
                  ? 'text-yellow-400'
                  : 'text-green-400'
              }`}>
                {isDemoData
                  ? t('layout.demoMode')
                  : alertLevel === 'stopped'
                  ? t('layout.navbar.aiDisabled')
                  : alertLevel === 'critical'
                  ? t('common.critical')
                  : alertLevel === 'warning'
                  ? t('common.warning')
                  : t('common.normal')}
              </span>
              <span className="text-muted-foreground">
                {t('layout.navbar.resets', { date: new Date(usage.resetDate).toLocaleDateString() })}
              </span>
            </div>
          </div>
          {/* Category breakdown - always show all features */}
          {usage.byCategory && (
            <div className="mt-3 pt-3 border-t border-border">
              <div className="text-xs text-muted-foreground mb-2">{t('layout.navbar.breakdownByFeature')}</div>
              {/* Category list with token counts */}
              <div className="space-y-1.5">
                {(['missions', 'diagnose', 'insights', 'predictions', 'other'] as TokenCategory[])
                  .map((category) => {
                    const tokens = usage.byCategory[category] || 0
                    const config = CATEGORY_CONFIG[category]
                    const Icon = config.icon
                    // Format tokens: 1.2M, 523k, or exact number
                    const formatTokens = (n: number) => {
                      if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
                      if (n >= 1000) return `${(n / 1000).toFixed(0)}k`
                      return n.toString()
                    }
                    return (
                      <div key={category} className="flex items-center gap-2 text-xs">
                        <div className={`w-2 h-2 rounded-full ${tokens > 0 ? config.color : 'bg-secondary'}`} />
                        <Icon className={`w-3 h-3 ${tokens > 0 ? 'text-foreground' : 'text-muted-foreground/50'}`} />
                        <span className={`flex-1 ${tokens > 0 ? 'text-foreground' : 'text-muted-foreground/50'}`}>
                          {config.label}
                        </span>
                        <span className={`font-mono ${tokens > 0 ? 'text-foreground' : 'text-muted-foreground/50'}`}>
                          {formatTokens(tokens)}
                        </span>
                      </div>
                    )
                  })}
              </div>
              {/* Stacked bar if there's category usage */}
              {Object.values(usage.byCategory).some(v => v > 0) && (
                <div className="h-1.5 bg-secondary rounded-full overflow-hidden flex mt-2">
                  {(Object.entries(usage.byCategory) as [TokenCategory, number][])
                    .filter(([, tokens]) => tokens > 0)
                    .map(([category, tokens]) => {
                      const totalCategoryUsage = Object.values(usage.byCategory).reduce((a, b) => a + b, 0)
                      const pct = totalCategoryUsage > 0 ? (tokens / totalCategoryUsage) * 100 : 0
                      const config = CATEGORY_CONFIG[category]
                      return (
                        <div
                          key={category}
                          className={`h-full ${config.color}`}
                          style={{ width: `${pct}%` }}
                        />
                      )
                    })}
                </div>
              )}
            </div>
          )}
          <div className="mt-3 pt-3 border-t border-border">
            <button
              onClick={() => navigate(getSettingsWithHash('token-usage-settings'))}
              className="w-full text-xs text-purple-400 hover:text-purple-300 text-center"
            >
              {t('layout.navbar.configureLimitsInSettings')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
