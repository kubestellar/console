import { useState } from 'react'
import { Save, Coins, RefreshCw } from 'lucide-react'
import type { TokenUsage } from '../../../hooks/useTokenUsage'

interface TokenUsageSectionProps {
  usage: TokenUsage
  updateSettings: (settings: Partial<Omit<TokenUsage, 'used' | 'resetDate'>>) => void
  resetUsage: () => void
}

export function TokenUsageSection({ usage, updateSettings, resetUsage }: TokenUsageSectionProps) {
  const [tokenLimit, setTokenLimit] = useState(usage.limit)
  const [warningThreshold, setWarningThreshold] = useState(usage.warningThreshold * 100)
  const [criticalThreshold, setCriticalThreshold] = useState(usage.criticalThreshold * 100)
  const [saved, setSaved] = useState(false)

  const handleSaveTokenSettings = () => {
    updateSettings({
      limit: tokenLimit,
      warningThreshold: warningThreshold / 100,
      criticalThreshold: criticalThreshold / 100,
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="glass rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-yellow-500/20">
            <Coins className="w-5 h-5 text-yellow-400" />
          </div>
          <div>
            <h2 className="text-lg font-medium text-foreground">Token Usage</h2>
            <p className="text-sm text-muted-foreground">Configure AI token limits and alerts</p>
          </div>
        </div>
        <button
          onClick={resetUsage}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50"
        >
          <RefreshCw className="w-4 h-4" />
          Reset Usage
        </button>
      </div>

      <div className="space-y-4">
        {/* Current usage */}
        <div className="p-4 rounded-lg bg-secondary/30">
          <div className="flex justify-between mb-2">
            <span className="text-sm text-muted-foreground">Current Usage</span>
            <span className="text-sm font-mono text-foreground">
              {usage.used.toLocaleString()} / {usage.limit.toLocaleString()} tokens
            </span>
          </div>
          <div className="h-2 bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full bg-purple-500 transition-all"
              style={{ width: `${Math.min((usage.used / usage.limit) * 100, 100)}%` }}
            />
          </div>
        </div>

        {/* Settings */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label htmlFor="token-limit" className="block text-sm text-muted-foreground mb-1">Monthly Limit</label>
            <input
              id="token-limit"
              type="number"
              value={tokenLimit}
              onChange={(e) => setTokenLimit(parseInt(e.target.value) || 0)}
              aria-label="Monthly token limit"
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground text-sm"
            />
          </div>
          <div>
            <label htmlFor="warning-threshold" className="block text-sm text-muted-foreground mb-1">Warning at (%)</label>
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
          </div>
          <div>
            <label htmlFor="critical-threshold" className="block text-sm text-muted-foreground mb-1">Critical at (%)</label>
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
          </div>
        </div>

        <button
          onClick={handleSaveTokenSettings}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-500 text-white hover:bg-purple-600"
        >
          <Save className="w-4 h-4" />
          {saved ? 'Saved!' : 'Save Token Settings'}
        </button>
      </div>
    </div>
  )
}
