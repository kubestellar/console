import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Save, RefreshCw, Check, X, ExternalLink, Loader2, Server } from 'lucide-react'
import { Github } from '@/lib/icons'
import { UI_FEEDBACK_TIMEOUT_MS, SCROLL_COMPLETE_MS } from '../../../lib/constants/network'
import { GITHUB_TOKEN_CREATE_URL, GITHUB_TOKEN_CLASSIC_URL } from '../../../lib/constants/github-token'
import { ConfirmDialog } from '../../../lib/modals'
import { useGitHubToken } from './useGitHubToken'

export { buildGitHubTokenSaveError, buildGitHubTokenValidationError } from './useGitHubToken'

interface GitHubTokenSectionProps {
  forceVersionCheck: () => void
}

/** Delay before applying deep link highlight effect */
const HIGHLIGHT_DELAY_MS = 400

/** Delay before trying to render deep-link scroll */
const DEEP_LINK_RENDER_DELAY_MS = 300

const GITHUB_TOKEN_FOCUS_TARGET = 'github-token'
const GITHUB_TOKEN_INPUT_ID = 'github-token'
const GITHUB_TOKEN_SECTION_ID = 'github-token-settings'

export function GitHubTokenSection({ forceVersionCheck }: GitHubTokenSectionProps) {
  const { t } = useTranslation()
  const {
    tokenInput,
    setTokenInput,
    hasToken,
    tokenSaved,
    tokenTesting,
    tokenError,
    rateLimit,
    isInitializing,
    isEnvToken,
    handleSaveToken,
    handleClearToken,
  } = useGitHubToken(forceVersionCheck)
  const [showClearConfirm, setShowClearConfirm] = useState(false)

  // Handle deep link focus from hash or search param
  useEffect(() => {
    const hash = window.location.hash
    const params = new URLSearchParams(window.location.search)
    const shouldFocus = hash === `#${GITHUB_TOKEN_FOCUS_TARGET}` || params.get('focus') === GITHUB_TOKEN_FOCUS_TARGET

    if (shouldFocus) {
      // Wait for component to render and page to settle
      const timer = setTimeout(() => {
        const section = document.getElementById(GITHUB_TOKEN_SECTION_ID)
        const input = document.getElementById(GITHUB_TOKEN_INPUT_ID) as HTMLInputElement | null

        if (section) {
          section.scrollIntoView({ behavior: 'smooth', block: 'center' })
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

  return (
    <div id={GITHUB_TOKEN_SECTION_ID} className="glass rounded-xl p-6">
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
                  id={GITHUB_TOKEN_INPUT_ID}
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
                    <RefreshCw className={`w-4 h-4 ${tokenTesting ? 'animate-spin' : ''}`} />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  {tokenTesting ? t('settings.github.testing') : tokenSaved ? t('settings.github.saved') : t('settings.github.saveAndTest')}
                </button>
                {hasToken && (
                  <button
                    onClick={() => setShowClearConfirm(true)}
                    disabled={tokenTesting}
                    className="px-4 py-2 rounded-lg text-red-400 hover:bg-red-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
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
        isLoading={tokenTesting}
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
