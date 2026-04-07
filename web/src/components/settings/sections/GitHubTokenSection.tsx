import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Save, RefreshCw, Check, X, ExternalLink, Loader2, Server } from 'lucide-react'
import { Github } from '@/lib/icons'
import { STORAGE_KEY_TOKEN, STORAGE_KEY_FEEDBACK_GITHUB_TOKEN_SOURCE, STORAGE_KEY_FEEDBACK_GITHUB_TOKEN_DISMISSED, FETCH_EXTERNAL_TIMEOUT_MS } from '../../../lib/constants'
import { emitGitHubTokenConfigured, emitGitHubTokenRemoved, emitConversionStep } from '../../../lib/analytics'
import { UI_FEEDBACK_TIMEOUT_MS, SCROLL_COMPLETE_MS } from '../../../lib/constants/network'
import { GITHUB_TOKEN_CREATE_URL, GITHUB_TOKEN_CLASSIC_URL } from '../../../lib/constants/github-token'
import { ConfirmDialog } from '../../../lib/modals'
import { safeGetItem, safeSetItem, safeRemoveItem } from '../../../lib/utils/localStorage'

interface GitHubTokenSectionProps {
  forceVersionCheck: () => void
}

/** Token source values matching backend GitHubTokenSource constants */
const TOKEN_SOURCE_SETTINGS = 'settings'
const TOKEN_SOURCE_ENV = 'env'

/** Timeout for fetching settings from the backend */
const AGENT_FETCH_TIMEOUT_MS = 5000

/** Delay before applying deep link highlight effect */
const HIGHLIGHT_DELAY_MS = 400

/** Delay before trying to render deep-link scroll */
const DEEP_LINK_RENDER_DELAY_MS = 300

/** Build JWT auth headers for backend proxy requests */
function authHeaders(): Record<string, string> {
  const token = safeGetItem(STORAGE_KEY_TOKEN)
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export function GitHubTokenSection({ forceVersionCheck }: GitHubTokenSectionProps) {
  const { t } = useTranslation()
  const [tokenInput, setTokenInput] = useState('')
  const [hasToken, setHasToken] = useState(false)
  const [tokenSource, setTokenSource] = useState<string | null>(null)
  const [tokenSaved, setTokenSaved] = useState(false)
  const [tokenTesting, setTokenTesting] = useState(false)
  const [tokenError, setTokenError] = useState<string | null>(null)
  const [rateLimit, setRateLimit] = useState<{ limit: number; remaining: number; reset: Date } | null>(null)
  const [isInitializing, setIsInitializing] = useState(true)
  const [showClearConfirm, setShowClearConfirm] = useState(false)

  // Load GitHub token status on mount
  useEffect(() => {
    const loadToken = async () => {
      // Skip if user explicitly dismissed the env token
      if (safeGetItem(STORAGE_KEY_FEEDBACK_GITHUB_TOKEN_DISMISSED) === 'true') {
        setIsInitializing(false)
        return
      }

      try {
        const response = await fetch('/api/github/token/status', {
          headers: authHeaders(),
          signal: AbortSignal.timeout(AGENT_FETCH_TIMEOUT_MS),
        })
        if (response.ok) {
          const data = await response.json() as { hasToken: boolean; source: string }
          if (data.hasToken) {
            const source = data.source || TOKEN_SOURCE_SETTINGS
            safeSetItem(STORAGE_KEY_FEEDBACK_GITHUB_TOKEN_SOURCE, source)
            window.dispatchEvent(new CustomEvent('kubestellar-settings-changed'))
            setHasToken(true)
            setTokenSource(source)
            await validateViaProxy()
          }
        }
      } catch {
        // Backend unavailable — no token available
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
          }, HIGHLIGHT_DELAY_MS)
        }

        if (input) {
          setTimeout(() => input.focus(), SCROLL_COMPLETE_MS) // Focus after scroll completes
        }

        // Clean up URL
        if (hash || params.get('focus')) {
          window.history.replaceState({}, '', window.location.pathname)
        }
      }, DEEP_LINK_RENDER_DELAY_MS)

      return () => clearTimeout(timer)
    }
  }, [isInitializing])

  /** Validate the token stored on the backend via the proxy */
  const validateViaProxy = async () => {
    setTokenTesting(true)
    setTokenError(null)
    try {
      const response = await fetch('/api/github/rate_limit', {
        headers: {
          ...authHeaders(),
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
      setRateLimit({
        limit: data.rate.limit,
        remaining: data.rate.remaining,
        reset: new Date(data.rate.reset * 1000),
      })
      return true
    } catch (err) {
      setTokenError(err instanceof Error ? err.message : 'Failed to validate token')
      setRateLimit(null)
      return false
    } finally {
      setTokenTesting(false)
    }
  }

  const handleSaveToken = async () => {
    if (!tokenInput.trim()) return

    setTokenTesting(true)
    setTokenError(null)

    try {
      // Save token to backend (encrypted storage)
      const saveResponse = await fetch('/api/github/token', {
        method: 'POST',
        headers: {
          ...authHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token: tokenInput.trim() }),
        signal: AbortSignal.timeout(FETCH_EXTERNAL_TIMEOUT_MS),
      })

      if (!saveResponse.ok) {
        throw new Error(`Failed to save token: ${saveResponse.status}`)
      }

      // Validate via proxy (backend injects the saved token)
      const isValid = await validateViaProxy()

      if (isValid) {
        if (!safeSetItem(STORAGE_KEY_FEEDBACK_GITHUB_TOKEN_SOURCE, TOKEN_SOURCE_SETTINGS)) {
          console.warn('Token saved to backend but localStorage write failed — settings may not persist')
        }
        // Clear any previous env-token dismissal
        safeRemoveItem(STORAGE_KEY_FEEDBACK_GITHUB_TOKEN_DISMISSED)
        window.dispatchEvent(new CustomEvent('kubestellar-settings-changed'))
        setHasToken(true)
        setTokenSource(TOKEN_SOURCE_SETTINGS)
        setTokenInput('') // Clear from input field
        setTokenSaved(true)
        setTimeout(() => setTokenSaved(false), UI_FEEDBACK_TIMEOUT_MS)

        emitGitHubTokenConfigured()
        emitConversionStep(6, 'github_token')

        // Trigger system updates check with the new token
        forceVersionCheck()
      }
    } catch (err) {
      setTokenError(err instanceof Error ? err.message : 'Failed to save token')
    } finally {
      setTokenTesting(false)
    }
  }

  const handleClearToken = async () => {
    try {
      // Remove token from backend
      await fetch('/api/github/token', {
        method: 'DELETE',
        headers: authHeaders(),
        signal: AbortSignal.timeout(FETCH_EXTERNAL_TIMEOUT_MS),
      })
    } catch {
      // Best-effort — clear local state regardless
    }

    safeRemoveItem(STORAGE_KEY_FEEDBACK_GITHUB_TOKEN_SOURCE)
    if (isEnvToken) {
      safeSetItem(STORAGE_KEY_FEEDBACK_GITHUB_TOKEN_DISMISSED, 'true')
    }
    setHasToken(false)
    setTokenSource(null)
    setRateLimit(null)
    setTokenError(null)
    window.dispatchEvent(new CustomEvent('kubestellar-settings-changed'))
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
          {/* Token Status */}
          <div className={`p-4 rounded-lg mb-4 ${
            tokenError ? 'bg-red-500/10 border border-red-500/20' :
            hasToken ? 'bg-green-500/10 border border-green-500/20' :
            'bg-yellow-500/10 border border-yellow-500/20'
          }`}>
            <div className="flex items-center gap-2 flex-wrap">
              {tokenTesting ? (
                <>
                  <RefreshCw className="w-5 h-5 text-blue-400 animate-spin" />
                  <span className="font-medium text-blue-400">{t('settings.github.testingToken')}</span>
                </>
              ) : tokenError ? (
                <>
                  <X className="w-5 h-5 text-red-400" />
                  <span className="font-medium text-red-400">{t('settings.github.tokenError')}</span>
                  <span className="text-muted-foreground">- {tokenError}</span>
                </>
              ) : hasToken && rateLimit ? (
                <>
                  <Check className="w-5 h-5 text-green-400" />
                  <span className="font-medium text-green-400">{t('settings.github.tokenValid')}</span>
                  <span className="text-muted-foreground">
                    - {rateLimit.remaining.toLocaleString()}/{rateLimit.limit.toLocaleString()} {t('settings.github.requestsRemaining')}
                  </span>
                  {isEnvToken && <EnvBadge />}
                </>
              ) : hasToken ? (
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
            {rateLimit && hasToken && !tokenError && (
              <p className="text-xs text-muted-foreground mt-2">
                {t('settings.github.rateLimitResets', { time: rateLimit.reset.toLocaleTimeString() })}
              </p>
            )}
          </div>

          {/* Token Input */}
          <div className="space-y-4">
            <div>
              <label htmlFor="github-token" className="block text-sm text-muted-foreground mb-2">
                {t('settings.github.feedbackToken')}
              </label>
              <div className="flex gap-2">
                <input
                  id="github-token"
                  type="password"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder={hasToken ? '••••••••••••••••' : 'ghp_... or github_pat_...'}
                  className="flex-1 px-3 py-2 rounded-lg bg-secondary border border-border text-foreground text-sm"
                />
                <button
                  onClick={handleSaveToken}
                  disabled={!tokenInput.trim() || tokenTesting}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-500 text-white hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {tokenTesting ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  {tokenTesting ? t('settings.github.testing') : tokenSaved ? t('settings.github.saved') : t('settings.github.saveAndTest')}
                </button>
                {hasToken && (
                  <button
                    onClick={() => setShowClearConfirm(true)}
                    className="px-4 py-2 rounded-lg text-red-400 hover:bg-red-500/10"
                  >
                    {t('settings.github.clear')}
                  </button>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {t('settings.github.feedbackTokenDescription')}
                {isEnvToken ? ` ${t('settings.github.feedbackTokenEnvSource')}` : ''}
              </p>
              {!hasToken && (
                <p className="text-xs text-yellow-400/70 mt-2">
                  {t('settings.github.feedbackTokenSetupHint')}
                </p>
              )}
            </div>

            {/* Instructions */}
            <div className="p-4 rounded-lg bg-secondary/30 space-y-3">
              <p className="text-sm font-medium text-foreground">{t('settings.github.howToCreate')}</p>

              <div className="space-y-2 text-sm">
                <div className="flex items-start gap-2">
                  <span className="text-purple-400 font-medium">{t('settings.github.option1')}</span>
                  <div>
                    <a
                      href={GITHUB_TOKEN_CLASSIC_URL}
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

                <div className="flex items-start gap-2">
                  <span className="text-purple-400 font-medium">{t('settings.github.option2')}</span>
                  <div>
                    <a
                      href={GITHUB_TOKEN_CREATE_URL}
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

      <ConfirmDialog
        isOpen={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        onConfirm={() => {
          setShowClearConfirm(false)
          handleClearToken()
        }}
        title={t('settings.github.clear')}
        message={t('settings.github.clearConfirm')}
        confirmLabel={t('actions.delete')}
        variant="danger"
      />
    </div>
  )
}

/** Badge shown when the token was auto-detected from environment variable in .env */
function EnvBadge() {
  const { t } = useTranslation()
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-medium bg-blue-500/15 text-blue-400 border border-blue-500/25">
      <Server className="w-3 h-3" />
      {t('settings.github.envBadge')}
    </span>
  )
}
