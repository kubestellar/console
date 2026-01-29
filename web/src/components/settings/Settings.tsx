import { useState, useEffect } from 'react'
import { Save, Coins, Cpu, Moon, Sun, RefreshCw, Plug, Check, X, Copy, Eye, User, ShieldCheck, Palette, ChevronDown, Key, Github, ExternalLink } from 'lucide-react'
import { useAuth } from '../../lib/auth'
import { useTheme } from '../../hooks/useTheme'
import { useTokenUsage } from '../../hooks/useTokenUsage'
import { useAIMode, AIMode } from '../../hooks/useAIMode'
import { useLocalAgent } from '../../hooks/useLocalAgent'
import { useAccessibility } from '../../hooks/useAccessibility'
import { useVersionCheck } from '../../hooks/useVersionCheck'
import { CanIChecker } from '../rbac/CanIChecker'
import { themeGroups } from '../../lib/themes'
import { APIKeySettings } from '../agent/APIKeySettings'
import { UpdateSettings } from './UpdateSettings'

export function Settings() {
  const { user, refreshUser } = useAuth()
  const { themeId, setTheme, themes, currentTheme } = useTheme()
  const { usage, updateSettings, resetUsage } = useTokenUsage()
  const { mode, setMode, description } = useAIMode()
  const { health, isConnected, refresh } = useLocalAgent()
  const { colorBlindMode, setColorBlindMode, reduceMotion, setReduceMotion, highContrast, setHighContrast } = useAccessibility()
  const { forceCheck: forceVersionCheck } = useVersionCheck()
  const [themeDropdownOpen, setThemeDropdownOpen] = useState(false)

  // GitHub token state
  const [githubToken, setGithubToken] = useState('')
  const [hasGithubToken, setHasGithubToken] = useState(false)
  const [githubTokenSaved, setGithubTokenSaved] = useState(false)
  const [githubTokenTesting, setGithubTokenTesting] = useState(false)
  const [githubTokenError, setGithubTokenError] = useState<string | null>(null)
  const [githubRateLimit, setGithubRateLimit] = useState<{ limit: number; remaining: number; reset: Date } | null>(null)

  // Helper functions for base64 encoding (obfuscation, not encryption)
  const encodeToken = (token: string) => btoa(token)
  const decodeToken = (encoded: string) => {
    try {
      return atob(encoded)
    } catch {
      return encoded // Return as-is if not encoded (migration from old format)
    }
  }

  // Load GitHub token status on mount and test existing token
  useEffect(() => {
    const encodedToken = localStorage.getItem('github_token')
    setHasGithubToken(!!encodedToken)
    if (encodedToken) {
      const token = decodeToken(encodedToken)
      testGithubToken(token)
    }
  }, [])

  const testGithubToken = async (token: string) => {
    setGithubTokenTesting(true)
    setGithubTokenError(null)
    try {
      const response = await fetch('https://api.github.com/rate_limit', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      })

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Invalid token - authentication failed')
        }
        throw new Error(`GitHub API error: ${response.status}`)
      }

      const data = await response.json()
      setGithubRateLimit({
        limit: data.rate.limit,
        remaining: data.rate.remaining,
        reset: new Date(data.rate.reset * 1000),
      })
      return true
    } catch (err) {
      setGithubTokenError(err instanceof Error ? err.message : 'Failed to validate token')
      setGithubRateLimit(null)
      return false
    } finally {
      setGithubTokenTesting(false)
    }
  }

  const handleSaveGithubToken = async () => {
    if (!githubToken.trim()) return

    setGithubTokenTesting(true)
    const isValid = await testGithubToken(githubToken.trim())

    if (isValid) {
      // Store base64 encoded (obfuscation)
      localStorage.setItem('github_token', encodeToken(githubToken.trim()))
      setHasGithubToken(true)
      setGithubToken('')
      setGithubTokenSaved(true)
      setTimeout(() => setGithubTokenSaved(false), 2000)

      // Trigger system updates check with the new token
      forceVersionCheck()
    }
    setGithubTokenTesting(false)
  }

  const handleClearGithubToken = () => {
    localStorage.removeItem('github_token')
    setHasGithubToken(false)
    setGithubRateLimit(null)
    setGithubTokenError(null)
  }

  const [tokenLimit, setTokenLimit] = useState(usage.limit)
  const [warningThreshold, setWarningThreshold] = useState(usage.warningThreshold * 100)
  const [criticalThreshold, setCriticalThreshold] = useState(usage.criticalThreshold * 100)
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)
  const [email, setEmail] = useState(user?.email || '')
  const [slackId, setSlackId] = useState(user?.slackId || '')
  const [profileSaved, setProfileSaved] = useState(false)
  const [showAPIKeySettings, setShowAPIKeySettings] = useState(false)

  const installCommand = 'brew install kubestellar/tap/ksc-agent && ksc-agent'

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

  const handleSaveProfile = async () => {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch('/api/me', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ email, slackId }),
      })
      if (!response.ok) {
        throw new Error('Failed to save profile')
      }
      // Refresh user data to update the dropdown
      await refreshUser()
      setProfileSaved(true)
      setTimeout(() => setProfileSaved(false), 2000)
    } catch (error) {
      console.error('Failed to save profile:', error)
    }
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
              <span id="ai-mode-low" className="text-sm text-muted-foreground w-20">Low AI</span>
              <input
                type="range"
                min="0"
                max="2"
                value={mode === 'low' ? 0 : mode === 'medium' ? 1 : 2}
                onChange={(e) => {
                  const val = parseInt(e.target.value)
                  setMode(val === 0 ? 'low' : val === 1 ? 'medium' : 'high')
                }}
                aria-label="AI usage mode"
                aria-valuetext={`${mode} AI mode`}
                aria-describedby="ai-mode-low ai-mode-high"
                className="flex-1 h-2 bg-secondary rounded-full appearance-none cursor-pointer
                  [&::-webkit-slider-thumb]:appearance-none
                  [&::-webkit-slider-thumb]:w-4
                  [&::-webkit-slider-thumb]:h-4
                  [&::-webkit-slider-thumb]:bg-purple-500
                  [&::-webkit-slider-thumb]:rounded-full
                  [&::-webkit-slider-thumb]:cursor-pointer"
              />
              <span id="ai-mode-high" className="text-sm text-muted-foreground w-20 text-right">High AI</span>
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

        {/* Profile */}
        <div className="glass rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-indigo-500/20">
              <User className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-lg font-medium text-foreground">Profile</h2>
              <p className="text-sm text-muted-foreground">Update your contact information</p>
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <label htmlFor="profile-email" className="block text-sm text-muted-foreground mb-1">Email</label>
              <input
                id="profile-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground text-sm"
              />
            </div>
            <div>
              <label htmlFor="profile-slack" className="block text-sm text-muted-foreground mb-1">Slack ID</label>
              <input
                id="profile-slack"
                type="text"
                value={slackId}
                onChange={(e) => setSlackId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground text-sm"
              />
            </div>
            <button
              onClick={handleSaveProfile}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-500 text-white hover:bg-purple-600"
            >
              <Save className="w-4 h-4" />
              {profileSaved ? 'Saved!' : 'Save Profile'}
            </button>
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

          {/* Claude Code Details (when connected and Claude available) */}
          {isConnected && health?.hasClaude && health.claude && (
            <div className="mt-4 p-4 rounded-lg bg-purple-500/10 border border-purple-500/20">
              <div className="flex items-center gap-2 mb-3">
                <Cpu className="w-5 h-5 text-purple-400" />
                <span className="font-medium text-purple-400">Claude Code</span>
                <span className="text-muted-foreground text-sm">v{health.claude.version}</span>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-3 rounded-lg bg-secondary/30">
                  <p className="text-xs text-muted-foreground mb-1">This Session</p>
                  <p className="text-sm font-mono text-foreground">
                    {((health.claude.tokenUsage.session.input + health.claude.tokenUsage.session.output) / 1000).toFixed(1)}k
                  </p>
                  <p className="text-xs text-muted-foreground">tokens</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-secondary/30">
                  <p className="text-xs text-muted-foreground mb-1">Today</p>
                  <p className="text-sm font-mono text-foreground">
                    {((health.claude.tokenUsage.today.input + health.claude.tokenUsage.today.output) / 1000).toFixed(1)}k
                  </p>
                  <p className="text-xs text-muted-foreground">tokens</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-secondary/30">
                  <p className="text-xs text-muted-foreground mb-1">This Month</p>
                  <p className="text-sm font-mono text-foreground">
                    {((health.claude.tokenUsage.thisMonth.input + health.claude.tokenUsage.thisMonth.output) / 1000000).toFixed(2)}M
                  </p>
                  <p className="text-xs text-muted-foreground">tokens</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* GitHub Integration */}
        <div id="github-token-settings" className="glass rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-gray-500/20">
              <Github className="w-5 h-5 text-gray-400" />
            </div>
            <div>
              <h2 className="text-lg font-medium text-foreground">GitHub Integration</h2>
              <p className="text-sm text-muted-foreground">Configure GitHub API access for the GitHub Activity card</p>
            </div>
          </div>

          {/* Status */}
          <div className={`p-4 rounded-lg mb-4 ${
            githubTokenError ? 'bg-red-500/10 border border-red-500/20' :
            hasGithubToken ? 'bg-green-500/10 border border-green-500/20' :
            'bg-yellow-500/10 border border-yellow-500/20'
          }`}>
            <div className="flex items-center gap-2">
              {githubTokenTesting ? (
                <>
                  <RefreshCw className="w-5 h-5 text-blue-400 animate-spin" />
                  <span className="font-medium text-blue-400">Testing token...</span>
                </>
              ) : githubTokenError ? (
                <>
                  <X className="w-5 h-5 text-red-400" />
                  <span className="font-medium text-red-400">Token Error</span>
                  <span className="text-muted-foreground">- {githubTokenError}</span>
                </>
              ) : hasGithubToken && githubRateLimit ? (
                <>
                  <Check className="w-5 h-5 text-green-400" />
                  <span className="font-medium text-green-400">Token Valid</span>
                  <span className="text-muted-foreground">
                    - {githubRateLimit.remaining.toLocaleString()}/{githubRateLimit.limit.toLocaleString()} requests remaining
                  </span>
                </>
              ) : hasGithubToken ? (
                <>
                  <Check className="w-5 h-5 text-green-400" />
                  <span className="font-medium text-green-400">Token Configured</span>
                  <span className="text-muted-foreground">- 5,000 requests/hour</span>
                </>
              ) : (
                <>
                  <X className="w-5 h-5 text-yellow-400" />
                  <span className="font-medium text-yellow-400">No Token</span>
                  <span className="text-muted-foreground">- Limited to 60 requests/hour</span>
                </>
              )}
            </div>
            {githubRateLimit && hasGithubToken && !githubTokenError && (
              <p className="text-xs text-muted-foreground mt-2">
                Rate limit resets at {githubRateLimit.reset.toLocaleTimeString()}
              </p>
            )}
          </div>

          {/* Token Input */}
          <div className="space-y-4">
            <div>
              <label htmlFor="github-token" className="block text-sm text-muted-foreground mb-2">
                Personal Access Token
              </label>
              <div className="flex gap-2">
                <input
                  id="github-token"
                  type="password"
                  value={githubToken}
                  onChange={(e) => setGithubToken(e.target.value)}
                  placeholder={hasGithubToken ? '••••••••••••••••' : 'ghp_... or github_pat_...'}
                  className="flex-1 px-3 py-2 rounded-lg bg-secondary border border-border text-foreground text-sm"
                />
                <button
                  onClick={handleSaveGithubToken}
                  disabled={!githubToken.trim() || githubTokenTesting}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-500 text-white hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {githubTokenTesting ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  {githubTokenTesting ? 'Testing...' : githubTokenSaved ? 'Saved!' : 'Save & Test'}
                </button>
                {hasGithubToken && (
                  <button
                    onClick={handleClearGithubToken}
                    className="px-4 py-2 rounded-lg text-red-400 hover:bg-red-500/10"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Instructions */}
            <div className="p-4 rounded-lg bg-secondary/30 space-y-3">
              <p className="text-sm font-medium text-foreground">How to create a token:</p>

              <div className="space-y-2 text-sm">
                <div className="flex items-start gap-2">
                  <span className="text-purple-400 font-medium">Option 1:</span>
                  <div>
                    <a
                      href="https://github.com/settings/personal-access-tokens/new"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline inline-flex items-center gap-1"
                    >
                      Create Fine-grained Token (Recommended)
                      <ExternalLink className="w-3 h-3" />
                    </a>
                    <p className="text-muted-foreground text-xs mt-0.5">
                      Set expiration, select "Public repositories (read-only)". No additional permissions needed for public repos.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <span className="text-purple-400 font-medium">Option 2:</span>
                  <div>
                    <a
                      href="https://github.com/settings/tokens/new?description=KubeStellar%20Console&scopes="
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline inline-flex items-center gap-1"
                    >
                      Create Classic Token
                      <ExternalLink className="w-3 h-3" />
                    </a>
                    <p className="text-muted-foreground text-xs mt-0.5">
                      No scopes needed for public repos. For private repos, check the "repo" scope.
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-border/50">
                <p className="text-xs text-yellow-400/70">
                  ⚠️ Token is stored in browser localStorage (not encrypted). Use a token with minimal permissions and set an expiration date.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* System Updates */}
        <UpdateSettings />

        {/* API Keys */}
        <div className="glass rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/20">
                <Key className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h2 className="text-lg font-medium text-foreground">AI Provider Keys</h2>
                <p className="text-sm text-muted-foreground">Configure API keys for Claude, OpenAI, and Gemini</p>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-lg bg-secondary/30 mb-4">
            <p className="text-sm text-muted-foreground">
              API keys are stored securely on your local machine in <code className="px-1 py-0.5 rounded bg-secondary text-foreground">~/.ksc/config.yaml</code> and are never sent to our servers.
            </p>
          </div>

          <button
            onClick={() => setShowAPIKeySettings(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-500 text-white hover:bg-purple-600"
          >
            <Key className="w-4 h-4" />
            Manage API Keys
          </button>
        </div>

        <APIKeySettings isOpen={showAPIKeySettings} onClose={() => setShowAPIKeySettings(false)} />

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

        {/* Appearance - Theme Selection */}
        <div className="glass rounded-xl p-6 overflow-visible relative z-30" style={{ isolation: 'isolate' }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20">
              <Palette className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h2 className="text-lg font-medium text-foreground">Appearance</h2>
              <p className="text-sm text-muted-foreground">Choose your theme - inspired by oh-my-zsh</p>
            </div>
          </div>

          <div className="space-y-4">
            {/* Current Theme Display */}
            <div className="p-4 rounded-lg bg-secondary/30 border border-border">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">{currentTheme.name}</p>
                  <p className="text-xs text-muted-foreground">{currentTheme.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  {currentTheme.dark ? (
                    <Moon className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <Sun className="w-4 h-4 text-yellow-400" />
                  )}
                  {/* Color preview dots */}
                  <div className="flex gap-1">
                    <div
                      className="w-3 h-3 rounded-full border border-border"
                      style={{ backgroundColor: currentTheme.colors.brandPrimary }}
                    />
                    <div
                      className="w-3 h-3 rounded-full border border-border"
                      style={{ backgroundColor: currentTheme.colors.brandSecondary }}
                    />
                    <div
                      className="w-3 h-3 rounded-full border border-border"
                      style={{ backgroundColor: currentTheme.colors.brandTertiary }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Theme Selector Dropdown */}
            <div className="relative z-20">
              <label className="block text-sm text-muted-foreground mb-2">Select Theme</label>
              <button
                onClick={() => setThemeDropdownOpen(!themeDropdownOpen)}
                className="w-full flex items-center justify-between px-4 py-3 rounded-lg bg-secondary border border-border text-foreground hover:bg-secondary/80 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="flex gap-1">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: currentTheme.colors.brandPrimary }}
                    />
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: currentTheme.colors.brandSecondary }}
                    />
                  </div>
                  <span>{currentTheme.name}</span>
                  {currentTheme.author && (
                    <span className="text-xs text-muted-foreground">by {currentTheme.author}</span>
                  )}
                </div>
                <ChevronDown className={`w-4 h-4 transition-transform ${themeDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Dropdown Menu */}
              {themeDropdownOpen && (
                <div className="absolute z-[9999] mt-2 w-full max-h-[400px] overflow-y-auto rounded-lg bg-card border border-border shadow-xl" style={{ transform: 'translateZ(0)' }}>
                  {themeGroups.map((group) => (
                    <div key={group.name}>
                      <div className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider bg-secondary/50 sticky top-0">
                        {group.name}
                      </div>
                      {group.themes.map((tid) => {
                        const t = themes.find((th) => th.id === tid)
                        if (!t) return null
                        const isSelected = themeId === tid
                        return (
                          <button
                            key={tid}
                            onClick={() => {
                              setTheme(tid)
                              setThemeDropdownOpen(false)
                            }}
                            className={`w-full flex items-center justify-between px-4 py-3 hover:bg-secondary/50 transition-colors ${
                              isSelected ? 'bg-primary/10' : ''
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className="flex gap-1">
                                <div
                                  className="w-3 h-3 rounded-full border border-border/50"
                                  style={{ backgroundColor: t.colors.brandPrimary }}
                                />
                                <div
                                  className="w-3 h-3 rounded-full border border-border/50"
                                  style={{ backgroundColor: t.colors.brandSecondary }}
                                />
                                <div
                                  className="w-3 h-3 rounded-full border border-border/50"
                                  style={{ backgroundColor: t.colors.brandTertiary }}
                                />
                              </div>
                              <div className="text-left">
                                <p className={`text-sm ${isSelected ? 'text-primary font-medium' : 'text-foreground'}`}>
                                  {t.name}
                                </p>
                                <p className="text-xs text-muted-foreground">{t.description}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {t.dark ? (
                                <Moon className="w-3 h-3 text-muted-foreground" />
                              ) : (
                                <Sun className="w-3 h-3 text-yellow-400" />
                              )}
                              {isSelected && <Check className="w-4 h-4 text-primary" />}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Quick Theme Buttons */}
            <div>
              <label className="block text-sm text-muted-foreground mb-2">Quick Select</label>
              <div className="grid grid-cols-4 gap-2">
                {['kubestellar', 'batman', 'dracula', 'nord', 'tokyo-night', 'cyberpunk', 'matrix', 'kubestellar-light'].map((tid) => {
                  const t = themes.find((th) => th.id === tid)
                  if (!t) return null
                  const isSelected = themeId === tid
                  return (
                    <button
                      key={tid}
                      onClick={() => setTheme(tid)}
                      title={t.description}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-all ${
                        isSelected
                          ? 'border-primary bg-primary/10'
                          : 'border-border hover:border-primary/50 hover:bg-secondary/30'
                      }`}
                    >
                      <div className="flex gap-0.5">
                        <div
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: t.colors.brandPrimary }}
                        />
                        <div
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: t.colors.brandSecondary }}
                        />
                        <div
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: t.colors.brandTertiary }}
                        />
                      </div>
                      <span className={`text-xs ${isSelected ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                        {t.name}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Theme Features */}
            <div className="flex flex-wrap gap-2 pt-2">
              {currentTheme.starField && (
                <span className="px-2 py-1 text-xs rounded bg-purple-500/20 text-purple-400">
                  ✨ Star Field
                </span>
              )}
              {currentTheme.glowEffects && (
                <span className="px-2 py-1 text-xs rounded bg-blue-500/20 text-blue-400">
                  💫 Glow Effects
                </span>
              )}
              {currentTheme.gradientAccents && (
                <span className="px-2 py-1 text-xs rounded bg-pink-500/20 text-pink-400">
                  🌈 Gradients
                </span>
              )}
              <span className="px-2 py-1 text-xs rounded bg-secondary text-muted-foreground">
                Font: {currentTheme.font.family.split(',')[0].replace(/'/g, '')}
              </span>
            </div>
          </div>
        </div>

        {/* Accessibility */}
        <div className="glass rounded-xl p-6 relative z-0">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-teal-500/20">
              <Eye className="w-5 h-5 text-teal-400" />
            </div>
            <div>
              <h2 className="text-lg font-medium text-foreground">Accessibility</h2>
              <p className="text-sm text-muted-foreground">Customize accessibility features</p>
            </div>
          </div>

          <div className="space-y-4">
            {/* Color Blind Mode */}
            <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/30">
              <div>
                <p className="text-sm font-medium text-foreground">Color Blind Mode</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Use icons and patterns instead of colors alone
                </p>
              </div>
              <button
                onClick={() => setColorBlindMode(!colorBlindMode)}
                role="switch"
                aria-checked={colorBlindMode}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  colorBlindMode ? 'bg-purple-500' : 'bg-secondary'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    colorBlindMode ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Reduce Motion */}
            <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/30">
              <div>
                <p className="text-sm font-medium text-foreground">Reduce Motion</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Minimize animations and transitions
                </p>
              </div>
              <button
                onClick={() => setReduceMotion(!reduceMotion)}
                role="switch"
                aria-checked={reduceMotion}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  reduceMotion ? 'bg-purple-500' : 'bg-secondary'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    reduceMotion ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* High Contrast */}
            <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/30">
              <div>
                <p className="text-sm font-medium text-foreground">High Contrast</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Increase contrast for better visibility
                </p>
              </div>
              <button
                onClick={() => setHighContrast(!highContrast)}
                role="switch"
                aria-checked={highContrast}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  highContrast ? 'bg-purple-500' : 'bg-secondary'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    highContrast ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Permissions Checker */}
        <div className="glass rounded-xl p-6 relative z-0">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-emerald-500/20">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-lg font-medium text-foreground">Permissions</h2>
              <p className="text-sm text-muted-foreground">Check your Kubernetes RBAC permissions</p>
            </div>
          </div>
          <CanIChecker />
        </div>
      </div>
    </div>
  )
}
