import { useState } from 'react'
import { Save, Coins, Cpu, Moon, Sun, Monitor, Gauge, RefreshCw, Plug, Check, X, Copy } from 'lucide-react'
import { useTheme } from '../../hooks/useTheme'
import { useTokenUsage } from '../../hooks/useTokenUsage'
import { useAIMode, AIMode } from '../../hooks/useAIMode'
import { useLocalAgent } from '../../hooks/useLocalAgent'

export function Settings() {
  const { theme, setTheme } = useTheme()
  const { usage, updateSettings, resetUsage } = useTokenUsage()
  const { mode, setMode, description } = useAIMode()
  const { health, isConnected, refresh } = useLocalAgent()

  const [tokenLimit, setTokenLimit] = useState(usage.limit)
  const [warningThreshold, setWarningThreshold] = useState(usage.warningThreshold * 100)
  const [criticalThreshold, setCriticalThreshold] = useState(usage.criticalThreshold * 100)
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)

  const installCommand = 'brew install kubestellar/tap/kkc-agent && kkc-agent'

  const copyInstallCommand = async () => {
    await navigator.clipboard.writeText(installCommand)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

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
    <div className="pt-16 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground">Configure console preferences and AI usage</p>
      </div>

      <div className="space-y-6">
        {/* AI Usage Mode */}
        <div className="glass rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-purple-500/20">
              <Cpu className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h2 className="text-lg font-medium text-foreground">AI Usage Mode</h2>
              <p className="text-sm text-muted-foreground">Balance between AI assistance and direct kubectl</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground w-20">Low AI</span>
              <input
                type="range"
                min="0"
                max="2"
                value={mode === 'low' ? 0 : mode === 'medium' ? 1 : 2}
                onChange={(e) => {
                  const val = parseInt(e.target.value)
                  setMode(val === 0 ? 'low' : val === 1 ? 'medium' : 'high')
                }}
                className="flex-1 h-2 bg-secondary rounded-full appearance-none cursor-pointer
                  [&::-webkit-slider-thumb]:appearance-none
                  [&::-webkit-slider-thumb]:w-4
                  [&::-webkit-slider-thumb]:h-4
                  [&::-webkit-slider-thumb]:bg-purple-500
                  [&::-webkit-slider-thumb]:rounded-full
                  [&::-webkit-slider-thumb]:cursor-pointer"
              />
              <span className="text-sm text-muted-foreground w-20 text-right">High AI</span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {(['low', 'medium', 'high'] as AIMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`p-3 rounded-lg border transition-all ${
                    mode === m
                      ? 'border-purple-500 bg-purple-500/10'
                      : 'border-border hover:border-purple-500/50'
                  }`}
                >
                  <p className={`text-sm font-medium capitalize ${mode === m ? 'text-purple-400' : 'text-foreground'}`}>
                    {m}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {m === 'low' && 'Direct kubectl, minimal tokens'}
                    {m === 'medium' && 'AI for analysis, kubectl for data'}
                    {m === 'high' && 'Full AI assistance'}
                  </p>
                </button>
              ))}
            </div>

            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
        </div>

        {/* Local Agent */}
        <div className="glass rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${isConnected ? 'bg-green-500/20' : 'bg-orange-500/20'}`}>
                <Plug className={`w-5 h-5 ${isConnected ? 'text-green-400' : 'text-orange-400'}`} />
              </div>
              <div>
                <h2 className="text-lg font-medium text-foreground">Local Agent</h2>
                <p className="text-sm text-muted-foreground">Connect to your local kubeconfig and Claude Code</p>
              </div>
            </div>
            <button
              onClick={refresh}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </div>

          {/* Connection Status */}
          <div className={`p-4 rounded-lg mb-4 ${isConnected ? 'bg-green-500/10 border border-green-500/20' : 'bg-orange-500/10 border border-orange-500/20'}`}>
            <div className="flex items-center gap-2">
              {isConnected ? (
                <>
                  <Check className="w-5 h-5 text-green-400" />
                  <span className="font-medium text-green-400">Connected</span>
                  <span className="text-muted-foreground">- Agent v{health?.version}</span>
                </>
              ) : (
                <>
                  <X className="w-5 h-5 text-orange-400" />
                  <span className="font-medium text-orange-400">Not Connected</span>
                  <span className="text-muted-foreground">- Using demo data</span>
                </>
              )}
            </div>
            {isConnected && health && (
              <div className="mt-2 flex gap-4 text-sm text-muted-foreground">
                <span>{health.clusters} clusters</span>
                {health.hasClaude && <span>Claude Code available</span>}
              </div>
            )}
          </div>

          {/* Install Instructions (when not connected) */}
          {!isConnected && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Install the local agent to access your kubeconfig clusters and Claude Code:
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 px-4 py-3 rounded-lg bg-secondary font-mono text-sm select-all overflow-x-auto">
                  {installCommand}
                </code>
                <button
                  onClick={copyInstallCommand}
                  className="shrink-0 flex items-center gap-2 px-4 py-3 rounded-lg bg-purple-500 text-white hover:bg-purple-600"
                >
                  <Copy className="w-4 h-4" />
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <div className="flex gap-4 text-xs text-muted-foreground">
                <span>✓ Access all your clusters</span>
                <span>✓ Real-time token tracking</span>
                <span>✓ Runs locally (secure)</span>
              </div>
            </div>
          )}
        </div>

        {/* Token Usage */}
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
                <label className="block text-sm text-muted-foreground mb-1">Monthly Limit</label>
                <input
                  type="number"
                  value={tokenLimit}
                  onChange={(e) => setTokenLimit(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground text-sm"
                />
              </div>
              <div>
                <label className="block text-sm text-muted-foreground mb-1">Warning at (%)</label>
                <input
                  type="number"
                  value={warningThreshold}
                  onChange={(e) => setWarningThreshold(parseInt(e.target.value) || 0)}
                  min="0"
                  max="100"
                  className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground text-sm"
                />
              </div>
              <div>
                <label className="block text-sm text-muted-foreground mb-1">Critical at (%)</label>
                <input
                  type="number"
                  value={criticalThreshold}
                  onChange={(e) => setCriticalThreshold(parseInt(e.target.value) || 0)}
                  min="0"
                  max="100"
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

        {/* Appearance */}
        <div className="glass rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-blue-500/20">
              <Gauge className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-medium text-foreground">Appearance</h2>
              <p className="text-sm text-muted-foreground">Customize the console look and feel</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-muted-foreground mb-2">Theme</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setTheme('dark')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all ${
                    theme === 'dark'
                      ? 'border-purple-500 bg-purple-500/10 text-foreground'
                      : 'border-border text-muted-foreground hover:border-purple-500/50'
                  }`}
                >
                  <Moon className="w-4 h-4" />
                  Dark
                </button>
                <button
                  onClick={() => setTheme('light')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all ${
                    theme === 'light'
                      ? 'border-purple-500 bg-purple-500/10 text-foreground'
                      : 'border-border text-muted-foreground hover:border-purple-500/50'
                  }`}
                >
                  <Sun className="w-4 h-4" />
                  Light
                </button>
                <button
                  onClick={() => setTheme('system')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all ${
                    theme === 'system'
                      ? 'border-purple-500 bg-purple-500/10 text-foreground'
                      : 'border-border text-muted-foreground hover:border-purple-500/50'
                  }`}
                >
                  <Monitor className="w-4 h-4" />
                  System
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
