import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Save, RefreshCw, Check, X, Github, ExternalLink, Loader2, Server } from 'lucide-react'
import { STORAGE_KEY_GITHUB_TOKEN, STORAGE_KEY_GITHUB_TOKEN_SOURCE, STORAGE_KEY_GITHUB_TOKEN_DISMISSED, FETCH_EXTERNAL_TIMEOUT_MS, LOCAL_AGENT_HTTP_URL } from '../../../lib/constants'
import { emitGitHubTokenConfigured, emitGitHubTokenRemoved, emitConversionStep } from '../../../lib/analytics'
import { UI_FEEDBACK_TIMEOUT_MS, SCROLL_COMPLETE_MS } from '../../../lib/constants/network'
import type { AllSettings } from '../../../lib/settingsTypes'

interface GitHubTokenSectionProps {
  forceVersionCheck: () => void
}

// Helper functions for base64 encoding (obfuscation, not encryption)
const encodeToken = (token: string) => btoa(token)
const decodeToken = (encoded: string) => {
  try {
    return atob(encoded)
  } catch {
    return encoded // Return as-is if not encoded (migration from old format)
  }
}

/** Token source values matching backend GitHubTokenSource constants */
const TOKEN_SOURCE_SETTINGS = 'settings'
const TOKEN_SOURCE_ENV = 'env'

/** Timeout for fetching settings from the local kc-agent */
const AGENT_FETCH_TIMEOUT_MS = 5000

export function GitHubTokenSection({ forceVersionCheck }: GitHubTokenSectionProps) {
  const { t } = useTranslation()
  const [githubToken, setGithubToken] = useState('')
  const [hasGithubToken, setHasGithubToken] = useState(false)
  const [tokenSource, setTokenSource] = useState<string | null>(null)
  const [githubTokenSaved, setGithubTokenSaved] = useState(false)
  const [githubTokenTesting, setGithubTokenTesting] = useState(false)
  const [githubTokenError, setGithubTokenError] = useState<string | null>(null)
  const [githubRateLimit, setGithubRateLimit] = useState<{ limit: number; remaining: number; reset: Date } | null>(null)
  const [isInitializing, setIsInitializing] = useState(true)

  // Load GitHub token status on mount — check localStorage first, then backend
  useEffect(() => {
    const loadToken = async () => {
      const encodedToken = localStorage.getItem(STORAGE_KEY_GITHUB_TOKEN)
      const storedSource = localStorage.getItem(STORAGE_KEY_GITHUB_TOKEN_SOURCE)

      if (encodedToken) {
        // Token exists in localStorage
        setHasGithubToken(true)
        setTokenSource(storedSource)
        const token = decodeToken(encodedToken)
        await testGithubToken(token)
        setIsInitializing(false)
        return
      }

      // No localStorage token — check if backend has one (e.g. from FEEDBACK_GITHUB_TOKEN)
      // Skip if user explicitly dismissed the env token
      if (localStorage.getItem(STORAGE_KEY_GITHUB_TOKEN_DISMISSED) === 'true') {
        setIsInitializing(false)
        return
      }
      try {
        const response = await fetch(`${LOCAL_AGENT_HTTP_URL}/settings`, {
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(AGENT_FETCH_TIMEOUT_MS),
        })
        if (response.ok) {
          const data: AllSettings = await response.json()
          if (data?.githubToken) {
            // Backend has a token — store in localStorage and use it
            localStorage.setItem(STORAGE_KEY_GITHUB_TOKEN, encodeToken(data.githubToken))
            const source = data.githubTokenSource || TOKEN_SOURCE_SETTINGS
            localStorage.setItem(STORAGE_KEY_GITHUB_TOKEN_SOURCE, source)
            window.dispatchEvent(new CustomEvent('kubestellar-settings-changed'))
            setHasGithubToken(true)
            setTokenSource(source)
            await testGithubToken(data.githubToken)
          }
        }
      } catch {
        // Agent unavailable — no token available
      }

      setIsInitializing(false)
    }
    loadToken()
  }, [])

  // Handle deep link focus from hash or search param
  useEffect(() => {
    const hash = window.location.hash
    const params = new URLSearchParams(window.location.search)
    const shouldFocus = hash === '#github-token' || params.get('focus') === 'github-token'

    if (shouldFocus) {
      // Wait for component to render and page to settle
      const timer = setTimeout(() => {
        const section = document.getElementById('github-token-settings')
        const nextSection = document.getElementById('system-updates-settings')
        const input = document.getElementById('github-token') as HTMLInputElement | null

        // Scroll to the NEXT section with block: 'center' so GitHub token is centered
        if (nextSection) {
          nextSection.scrollIntoView({ behavior: 'smooth', block: 'center' })
        } else if (section) {
          // Fallback: scroll to section itself
          section.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }

        // Flash highlight effect on GitHub section
        if (section) {
          setTimeout(() => {
            section.classList.add('ring-2', 'ring-purple-500/50')
            setTimeout(() => section.classList.remove('ring-2', 'ring-purple-500/50'), UI_FEEDBACK_TIMEOUT_MS)
          }, 400)
        }

        if (input) {
          setTimeout(() => input.focus(), SCROLL_COMPLETE_MS) // Focus after scroll completes
        }

        // Clean up URL
        if (hash || params.get('focus')) {
          window.history.replaceState({}, '', window.location.pathname)
        }
      }, 300)

      return () => clearTimeout(timer)
    }
  }, [isInitializing])

  const testGithubToken = async (token: string) => {
    setGithubTokenTesting(true)
    setGithubTokenError(null)
    try {
      const response = await fetch('https://api.github.com/rate_limit', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
        },
        signal: AbortSignal.timeout(FETCH_EXTERNAL_TIMEOUT_MS),
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
      localStorage.setItem(STORAGE_KEY_GITHUB_TOKEN, encodeToken(githubToken.trim()))
      // User-entered tokens always have "settings" source
      localStorage.setItem(STORAGE_KEY_GITHUB_TOKEN_SOURCE, TOKEN_SOURCE_SETTINGS)
      // Clear any previous env-token dismissal
      localStorage.removeItem(STORAGE_KEY_GITHUB_TOKEN_DISMISSED)
      window.dispatchEvent(new CustomEvent('kubestellar-settings-changed'))
      setHasGithubToken(true)
      setTokenSource(TOKEN_SOURCE_SETTINGS)
      setGithubToken('')
      setGithubTokenSaved(true)
      setTimeout(() => setGithubTokenSaved(false), UI_FEEDBACK_TIMEOUT_MS)

      emitGitHubTokenConfigured()
      emitConversionStep(6, 'github_token')

      // Trigger system updates check with the new token
      forceVersionCheck()
    }
    setGithubTokenTesting(false)
  }

  const handleClearGithubToken = () => {
    localStorage.removeItem(STORAGE_KEY_GITHUB_TOKEN)
    localStorage.removeItem(STORAGE_KEY_GITHUB_TOKEN_SOURCE)
    // If clearing an env-sourced token, remember the dismissal so it doesn't reappear
    if (isEnvToken) {
      localStorage.setItem(STORAGE_KEY_GITHUB_TOKEN_DISMISSED, 'true')
    }
    setHasGithubToken(false)
    setTokenSource(null)
    setGithubRateLimit(null)
    setGithubTokenError(null)
    emitGitHubTokenRemoved()
  }

  const isEnvToken = tokenSource === TOKEN_SOURCE_ENV

  return (
    <div id="github-token-settings" className="glass rounded-xl p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg bg-secondary">
          <Github className="w-5 h-5 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-lg font-medium text-foreground">{t('settings.github.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('settings.github.subtitle')}</p>
        </div>
      </div>

      {/* Show loading during initialization */}
      {isInitializing ? (
        <div className="flex items-center justify-center p-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Status */}
          <div className={`p-4 rounded-lg mb-4 ${
        githubTokenError ? 'bg-red-500/10 border border-red-500/20' :
        hasGithubToken ? 'bg-green-500/10 border border-green-500/20' :
        'bg-yellow-500/10 border border-yellow-500/20'
      }`}>
        <div className="flex items-center gap-2 flex-wrap">
          {githubTokenTesting ? (
            <>
              <RefreshCw className="w-5 h-5 text-blue-400 animate-spin" />
              <span className="font-medium text-blue-400">{t('settings.github.testingToken')}</span>
            </>
          ) : githubTokenError ? (
            <>
              <X className="w-5 h-5 text-red-400" />
              <span className="font-medium text-red-400">{t('settings.github.tokenError')}</span>
              <span className="text-muted-foreground">- {githubTokenError}</span>
            </>
          ) : hasGithubToken && githubRateLimit ? (
            <>
              <Check className="w-5 h-5 text-green-400" />
              <span className="font-medium text-green-400">{t('settings.github.tokenValid')}</span>
              <span className="text-muted-foreground">
                - {githubRateLimit.remaining.toLocaleString()}/{githubRateLimit.limit.toLocaleString()} {t('settings.github.requestsRemaining')}
              </span>
              {isEnvToken && <EnvBadge />}
            </>
          ) : hasGithubToken ? (
            <>
              <Check className="w-5 h-5 text-green-400" />
              <span className="font-medium text-green-400">{t('settings.github.tokenConfigured')}</span>
              <span className="text-muted-foreground">- 5,000 {t('settings.github.requestsPerHour')}</span>
              {isEnvToken && <EnvBadge />}
            </>
          ) : (
            <>
              <X className="w-5 h-5 text-yellow-400" />
              <span className="font-medium text-yellow-400">{t('settings.github.noToken')}</span>
              <span className="text-muted-foreground">- {t('settings.github.limitedRequests')}</span>
            </>
          )}
        </div>
        {githubRateLimit && hasGithubToken && !githubTokenError && (
          <p className="text-xs text-muted-foreground mt-2">
            {t('settings.github.rateLimitResets', { time: githubRateLimit.reset.toLocaleTimeString() })}
          </p>
        )}
      </div>

          {/* Token Input */}
          <div className="space-y-4">
            <div>
              <label htmlFor="github-token" className="block text-sm text-muted-foreground mb-2">
                {t('settings.github.personalAccessToken')}
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
                  {githubTokenTesting ? t('settings.github.testing') : githubTokenSaved ? t('settings.github.saved') : t('settings.github.saveAndTest')}
                </button>
                {hasGithubToken && (
                  <button
                    onClick={handleClearGithubToken}
                    className="px-4 py-2 rounded-lg text-red-400 hover:bg-red-500/10"
                  >
                    {t('settings.github.clear')}
                  </button>
                )}
              </div>
            </div>

            {/* Instructions */}
            <div className="p-4 rounded-lg bg-secondary/30 space-y-3">
          <p className="text-sm font-medium text-foreground">{t('settings.github.howToCreate')}</p>

          <div className="space-y-2 text-sm">
            <div className="flex items-start gap-2">
              <span className="text-purple-400 font-medium">{t('settings.github.option1')}</span>
              <div>
                <a
                  href="https://github.com/settings/personal-access-tokens/new"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline inline-flex items-center gap-1"
                >
                  {t('settings.github.createFineGrained')}
                  <ExternalLink className="w-3 h-3" />
                </a>
                <p className="text-muted-foreground text-xs mt-0.5">
                  {t('settings.github.fineGrainedInstructions')}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2">
              <span className="text-purple-400 font-medium">{t('settings.github.option2')}</span>
              <div>
                <a
                  href="https://github.com/settings/tokens/new?description=KubeStellar%20Console&scopes="
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline inline-flex items-center gap-1"
                >
                  {t('settings.github.createClassic')}
                  <ExternalLink className="w-3 h-3" />
                </a>
                <p className="text-muted-foreground text-xs mt-0.5">
                  {t('settings.github.classicInstructions')}
                </p>
              </div>
            </div>
          </div>

            <div className="pt-2 border-t border-border/50">
              <p className="text-xs text-yellow-400/70">
                {t('settings.github.securityWarning')}
              </p>
            </div>
          </div>
        </div>
        </>
      )}
    </div>
  )
}

/** Badge shown when the token was auto-detected from FEEDBACK_GITHUB_TOKEN in .env */
function EnvBadge() {
  const { t } = useTranslation()
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-500/15 text-blue-400 border border-blue-500/25">
      <Server className="w-3 h-3" />
      {t('settings.github.envBadge')}
    </span>
  )
}
