import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Check, CheckCircle2, ChevronDown, ChevronRight, Copy, ExternalLink, KeyRound, Settings } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { LoginOptions } from '../../lib/devLogin'
import { useBranding } from '../../hooks/useBranding'
import { checkOAuthConfiguredWithRetry } from '../../lib/api'
import { emitLogin } from '../../lib/analytics'
import { UI_FEEDBACK_TIMEOUT_MS } from '../../lib/constants/network'
import { copyToClipboard } from '../../lib/clipboard'
import { sanitizeUrl } from '@/lib/utils/sanitizeUrl'
import { LogoWithStar } from '../ui/LogoWithStar'
import { Button } from '../ui/Button'
import { OIDCLoginButton } from './OIDCLoginButton'
import { SSOProviderList } from './SSOProviderList'

const GITHUB_DEVELOPER_SETTINGS_URL = 'https://github.com/settings/developers'
const DEFAULT_OAUTH_CALLBACK = 'http://localhost:8080/auth/github/callback'

const OAUTH_SETUP_STEPS = [
  { label: 'Go to', link: GITHUB_DEVELOPER_SETTINGS_URL, linkText: 'GitHub Developer Settings' },
  { label: 'Click "New OAuth App" and fill in:' },
  { label: 'Application name:', value: 'KubeStellar Console' },
  { label: 'Homepage URL:', value: 'http://localhost:8080' },
  { label: 'Callback URL:', value: DEFAULT_OAUTH_CALLBACK },
  { label: 'Click "Register application", then copy the Client ID and generate a Client Secret' },
  { label: 'Create a .env file in the project root:', command: 'GITHUB_CLIENT_ID=<your-client-id>\nGITHUB_CLIENT_SECRET=<your-client-secret>' },
  { label: 'Restart the console:', command: 'curl -sSL https://raw.githubusercontent.com/kubestellar/console/main/start.sh | bash' },
]

interface OAuthErrorEntry {
  title: string
  message: string
  steps: string[]
}

const OAUTH_ERROR_INFO: Record<string, OAuthErrorEntry> = {
  exchange_failed: {
    title: 'GitHub OAuth Token Exchange Failed',
    message: 'The console was unable to complete the login with GitHub. This usually means your OAuth app is misconfigured.',
    steps: [
      'Check that GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET are set in your .env file',
      'Verify the Client Secret in your GitHub OAuth app matches what\'s in .env (regenerate if unsure)',
      'Confirm the "Authorization callback URL" in your GitHub OAuth app is set to: http://localhost:8080/auth/github/callback',
      'Restart the console after updating .env',
    ] },
  invalid_client: {
    title: 'Invalid OAuth Client Credentials',
    message: 'GitHub rejected the client ID or client secret. Your OAuth app may be misconfigured or the credentials may have been rotated.',
    steps: [
      'Open your GitHub OAuth app settings and copy a fresh Client ID and Client Secret',
      'Update GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in your .env file',
      'If using GitHub Enterprise, verify GITHUB_URL points to the correct instance',
      'Restart the console after updating .env',
    ] },
  redirect_mismatch: {
    title: 'OAuth Callback URL Mismatch',
    message: 'The callback URL configured in the console does not match the one registered in your GitHub OAuth app.',
    steps: [
      'Open your GitHub OAuth app settings',
      'Set "Authorization callback URL" to: http://localhost:8080/auth/github/callback',
      'If using a custom BACKEND_URL, make sure the callback URL matches: <BACKEND_URL>/auth/github/callback',
      'Restart the console after updating the GitHub OAuth app',
    ] },
  network_error: {
    title: 'Network Error',
    message: 'The console backend could not reach GitHub to complete authentication. This is usually a connectivity issue.',
    steps: [
      'Check your internet connection',
      'If behind a corporate proxy or firewall, ensure github.com and api.github.com are reachable',
      'Try again in a few moments — GitHub may be experiencing an outage',
      'Check https://www.githubstatus.com for service status',
    ] },
  csrf_validation_failed: {
    title: 'Login Session Expired',
    message: 'The login session timed out or was interrupted. This can happen with Safari or slow networks.',
    steps: [
      'Try logging in again — click "Continue with GitHub" below',
      'If using Safari, try Chrome or Firefox instead',
      'Clear your browser cookies for localhost and try again',
    ] },
  missing_code: {
    title: 'GitHub Login Incomplete',
    message: 'GitHub did not return an authorization code. The OAuth flow may have been interrupted.',
    steps: [
      'Try logging in again — click "Continue with GitHub" below',
      'Check that your GitHub OAuth app is not suspended or deleted',
      'Verify the "Homepage URL" in your GitHub OAuth app settings',
    ] },
  access_denied: {
    title: 'Access Denied',
    message: 'You denied the GitHub authorization request, or the OAuth app does not have permission to access your account.',
    steps: [
      'Click "Continue with GitHub" below and approve the authorization prompt',
      'If you did not deny access, check that the GitHub OAuth app is not restricted by your organization\'s policies',
      'Contact your GitHub organization admin if SSO enforcement is blocking access',
    ] },
  github_error: {
    title: 'GitHub Authorization Error',
    message: 'GitHub returned an error during the authorization process.',
    steps: [
      'Try logging in again — this may be a temporary issue',
      'Verify your GitHub OAuth app is not suspended or deleted',
      'Check https://www.githubstatus.com for service status',
    ] },
  manifest_missing_code: {
    title: 'GitHub App Setup Incomplete',
    message: 'GitHub did not return a setup code. The app creation may have been cancelled.',
    steps: [
      'Click "Set up GitHub Sign-In" to try again',
      'Make sure to click "Create GitHub App" on the GitHub confirmation page',
    ] },
  manifest_conversion_failed: {
    title: 'GitHub App Setup Failed',
    message: 'The console was unable to complete the GitHub App setup. The temporary code may have expired.',
    steps: [
      'Click "Set up GitHub Sign-In" to try again',
      'Check your internet connection',
      'If the problem persists, use the manual setup option instead',
    ] },
  manifest_already_configured: {
    title: 'GitHub Sign-In Already Configured',
    message: 'OAuth credentials are already set up. You can sign in directly.',
    steps: [
      'Click "Continue with GitHub" to sign in',
      'If you need to reconfigure, remove existing credentials first',
    ] },
  user_fetch_failed: {
    title: 'Could Not Retrieve GitHub Profile',
    message: 'Login succeeded but the console was unable to fetch your GitHub profile.',
    steps: [
      'Try logging in again — this may be a temporary GitHub API issue',
      'Check that your GitHub OAuth app has the "user:email" scope',
      'Verify your internet connection to api.github.com',
    ] },
  db_error: {
    title: 'Database Error',
    message: 'The console backend encountered a database error while processing your login.',
    steps: [
      'Restart the console and try again',
      'Check the backend logs for more details',
    ] },
  create_user_failed: {
    title: 'Account Creation Failed',
    message: 'The console was unable to create your user account in its local database.',
    steps: [
      'Restart the console and try again',
      'Check the backend logs for database errors',
      'If the problem persists, try deleting the local database file and restarting',
    ] },
  jwt_failed: {
    title: 'Session Token Generation Failed',
    message: 'The console backend was unable to generate a session token after successful GitHub login.',
    steps: [
      'Restart the console and try again',
      'Ensure JWT_SECRET is set in your .env file (any random string)',
      'Check the backend logs for more details',
    ] } }

const UNKNOWN_ERROR_FALLBACK: OAuthErrorEntry = {
  title: 'Authentication Error',
  message: 'An unexpected error occurred during login.',
  steps: [
    'Try logging in again — click "Continue with GitHub" below',
    'Restart the console and try again',
    'Check the backend logs for more details',
  ] }

interface LocalLoginFormProps {
  login: (opts?: LoginOptions) => void
  isLoading: boolean
  isAuthenticated: boolean
  starStyles: Array<{
    width: string
    height: string
    left: string
    top: string
    animationDelay: string
  }>
}

export function LocalLoginForm({ login, isLoading, isAuthenticated, starStyles }: LocalLoginFormProps) {
  const { t } = useTranslation('common')
  const [searchParams] = useSearchParams()
  const sessionExpired = searchParams.get('reason') === 'session_expired'
  const manifestSuccess = searchParams.get('manifest') === 'success'
  const oauthError = useMemo(() => searchParams.get('error'), [searchParams])
  const errorDetail = searchParams.get('error_detail')
  const errorInfo = (() => {
    if (!oauthError) return null
    const known = OAUTH_ERROR_INFO[oauthError]
    if (known) return known
    return { ...UNKNOWN_ERROR_FALLBACK, message: `An unexpected error occurred during login (code: ${oauthError}).` }
  })()
  const branding = useBranding()
  const isHostedDemoLogin = typeof window !== 'undefined'
    && !!branding.hostedDomain
    && window.location.hostname === branding.hostedDomain

  const [showOAuthSetup, setShowOAuthSetup] = useState(false)
  const [inClusterNoOAuth, setInClusterNoOAuth] = useState(false)
  const [oauthSetupExpanded, setOauthSetupExpanded] = useState(false)
  const [copiedStep, setCopiedStep] = useState<number | null>(null)
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    return () => clearTimeout(copiedTimerRef.current)
  }, [])

  const handleCopyStep = async (text: string, stepKey: number) => {
    const ok = await copyToClipboard(text)
    if (!ok) return
    setCopiedStep(stepKey)
    clearTimeout(copiedTimerRef.current)
    copiedTimerRef.current = setTimeout(() => setCopiedStep(null), UI_FEEDBACK_TIMEOUT_MS)
  }

  useEffect(() => {
    if (isLoading || isAuthenticated || oauthError || manifestSuccess) return

    const isNetlifyPreview = window.location.hostname.includes('deploy-preview-') ||
      window.location.hostname.includes('netlify.app')
    const isDemoMode = import.meta.env.VITE_DEMO_MODE === 'true'
    const hostedDomain = branding.hostedDomain
    const isHostedDemo = !!hostedDomain && window.location.hostname === hostedDomain

    if (isNetlifyPreview || isDemoMode || isHostedDemo) {
      emitLogin('auto-netlify'); login()
      return
    }

    checkOAuthConfiguredWithRetry().then(({ backendUp, oauthConfigured, inCluster }) => {
      if (backendUp && !oauthConfigured) {
        setShowOAuthSetup(true)
        setInClusterNoOAuth(!!inCluster)
      }
    }).catch(() => { })
  }, [isLoading, isAuthenticated, login, oauthError, manifestSuccess, branding.hostedDomain])

  return (
    <>
      <div className="star-field absolute inset-0">
        {starStyles.map((style, i) => (
          <div key={i} className="star" style={style} />
        ))}
      </div>

      <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-purple-600/20 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-blue-600/20 rounded-full blur-3xl" />

      <div className="relative z-10 glass rounded-2xl p-8 max-w-md w-full mx-4 animate-fade-in-up">
        <div className="flex justify-center mb-8">
          <div className="flex items-center gap-3">
            <LogoWithStar className="w-14 h-14" />
            <div>
              <h1 className="text-2xl font-bold text-foreground">{branding.appShortName}</h1>
              <p className="text-sm text-muted-foreground">{branding.appName}</p>
            </div>
          </div>
        </div>

      {sessionExpired && (
        <div className="flex items-center gap-3 mb-6 px-4 py-3 rounded-lg border border-yellow-500/50 bg-yellow-500/10 text-yellow-300 text-sm">
          <AlertTriangle className="w-5 h-5 shrink-0 text-yellow-400" />
          <div>
            <div className="font-medium">{t('login.sessionExpired')}</div>
            <div className="text-xs text-yellow-400/80 mt-0.5">{t('login.sessionTimedOut')}</div>
          </div>
        </div>
      )}

      {manifestSuccess && (
        <div className="flex items-center gap-3 mb-6 px-4 py-3 rounded-lg border border-green-500/50 bg-green-500/10 text-green-300 text-sm">
          <CheckCircle2 className="w-5 h-5 shrink-0 text-green-400" />
          <div>
            <div className="font-medium">{t('login.manifestSuccess')}</div>
            <div className="text-xs text-green-400/80 mt-0.5">{t('login.manifestSuccessDetail')}</div>
          </div>
        </div>
      )}

      {errorInfo && (
        <div data-testid="oauth-error-banner" className="mb-6 rounded-lg border border-red-500/50 bg-red-500/10 overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 text-red-300 text-sm">
            <AlertTriangle className="w-5 h-5 shrink-0 text-red-400" />
            <div>
              <div className="font-medium text-red-300">{errorInfo.title}</div>
              <div className="text-xs text-red-400/80 mt-0.5">{errorInfo.message}</div>
            </div>
          </div>
          {errorDetail && (
            <div className="px-4 pb-2">
              <div className="text-xs text-red-400/60 bg-red-500/5 rounded px-3 py-2 font-mono wrap-break-word">
                {errorDetail}
              </div>
            </div>
          )}
          <div className="px-4 pb-3">
            <div className="text-xs font-medium text-red-300/80 mb-1.5">Troubleshooting:</div>
            <ol className="text-xs text-red-400/70 space-y-1 list-decimal list-inside">
              {errorInfo.steps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
            <div className="flex items-center gap-2 mt-3">
              <a
                href="https://github.com/settings/developers"
                target="_blank"
                rel="noopener noreferrer"
                className="px-2.5 py-1.5 text-xs rounded border border-red-500/30 text-red-300 hover:bg-red-500/10 transition-colors flex items-center gap-1.5"
              >
                <Settings className="w-3 h-3" />
                GitHub OAuth Settings
              </a>
              <a
                href={`${branding.repoUrl}#quick-start`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2.5 py-1.5 text-xs rounded border border-red-500/30 text-red-300 hover:bg-red-500/10 transition-colors flex items-center gap-1.5"
              >
                <ExternalLink className="w-3 h-3" />
                Setup Guide
              </a>
            </div>
          </div>
        </div>
      )}

      <div className="text-center mb-8">
        <h2 data-testid="login-welcome-heading" className="text-xl font-semibold text-foreground mb-2">
          {oauthError ? 'Login Failed' : manifestSuccess ? t('login.manifestSuccess') : sessionExpired ? t('login.sessionExpired') : t('login.welcomeBack')}
        </h2>
        <p className="text-muted-foreground">
          {oauthError ? 'Fix the issue above and try again' : t('login.signInDescription')}
        </p>
      </div>

      {isHostedDemoLogin && (
        <div className="mb-4 px-4 py-3 rounded-lg border border-purple-500/30 bg-purple-500/10 text-purple-200 text-xs">
          <div className="font-medium text-purple-300 mb-1">Hosted demo</div>
          <p className="text-purple-300/80">
            Real GitHub sign-in is not available on the hosted demo. You'll be
            signed in as a demo user automatically. To enable GitHub OAuth and
            connect a real cluster,{' '}
            <a
              href="https://github.com/kubestellar/console#quick-start"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-purple-100"
            >
              self-host the console
            </a>
            .
          </p>
        </div>
      )}

      {showOAuthSetup && !oauthError && (
        <div data-testid="oauth-setup-notice" className="mb-4 rounded-lg border border-blue-500/30 bg-blue-500/5 overflow-hidden">
          <div className="px-4 py-3">
            <div className="flex items-start gap-2.5">
              <KeyRound className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
              <div className="text-xs">
                <div className="font-medium text-blue-300 mb-1">{t('login.oauthNotConfigured')}</div>
                <p className="text-blue-300/80 leading-relaxed">
                  {t('login.oauthNotConfiguredDescription')}
                </p>
              </div>
            </div>
          </div>

          <div className="px-4 pb-3">
            <Button
              onClick={() => setOauthSetupExpanded(!oauthSetupExpanded)}
              variant="ghost"
              size="sm"
              icon={oauthSetupExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              className="text-blue-400 hover:text-blue-300 h-auto p-0"
            >
              {t('login.showSetupSteps')}
            </Button>

            {oauthSetupExpanded && (
              <div className="mt-2 space-y-2">
                {OAUTH_SETUP_STEPS.map((step, idx) => (
                  <div key={idx} className="text-xs">
                    {step.link ? (
                      <span className="text-muted-foreground">
                        {idx + 1}. {step.label}{' '}
                        <a
                          href={sanitizeUrl(step.link)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:text-blue-300 underline"
                        >
                          {step.linkText}
                        </a>
                      </span>
                    ) : step.value ? (
                      <div className="flex items-center gap-2 ml-4">
                        <span className="text-muted-foreground shrink-0">{step.label}</span>
                        <code className="rounded bg-muted px-2 py-0.5 font-mono text-foreground select-all">
                          {step.value}
                        </code>
                      </div>
                    ) : step.command ? (
                      <div className="ml-4 mt-1">
                        <span className="text-muted-foreground">{idx + 1}. {step.label}</span>
                        <div className="flex items-center gap-2 mt-1">
                          <pre className="flex-1 rounded bg-muted px-3 py-1.5 font-mono text-foreground select-all overflow-x-auto whitespace-pre text-xs">
                            {step.command}
                          </pre>
                          <Button
                            onClick={() => handleCopyStep(step.command, idx)}
                            variant="ghost"
                            size="sm"
                            icon={copiedStep === idx ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                            title="Copy"
                            className="shrink-0 self-start p-1.5"
                          />
                        </div>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">
                        {idx + 1}. {step.label}
                      </span>
                    )}
                  </div>
                ))}
                <div className="flex items-center gap-2 mt-3 pt-2 border-t border-border/30">
                  <a
                    href={GITHUB_DEVELOPER_SETTINGS_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2.5 py-1.5 text-xs rounded border border-blue-500/30 text-blue-300 hover:bg-blue-500/10 transition-colors flex items-center gap-1.5"
                  >
                    <Settings className="w-3 h-3" />
                    {t('login.openGitHubSettings')}
                  </a>
                  <a
                    href={`${branding.repoUrl}#quick-start`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2.5 py-1.5 text-xs rounded border border-blue-500/30 text-blue-300 hover:bg-blue-500/10 transition-colors flex items-center gap-1.5"
                  >
                    <ExternalLink className="w-3 h-3" />
                    {t('login.fullSetupGuide')}
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {!showOAuthSetup && (
        <OIDCLoginButton
          isHostedDemoLogin={isHostedDemoLogin}
          onLogin={() => { emitLogin('github'); login() }}
          label={t('login.continueWithGitHub')}
        />
      )}

      {showOAuthSetup && (
        <SSOProviderList
          inClusterNoOAuth={inClusterNoOAuth}
          oauthSetupExpanded={oauthSetupExpanded}
          continueWithClusterAccessLabel={t('login.continueWithClusterAccess')}
          signInToGitHubFirstLabel={t('login.signInToGitHubFirst')}
          setupGitHubSignInLabel={t('login.setupGitHubSignIn')}
          hideManualSetupLabel={t('login.hideManualSetup')}
          showManualSetupLabel={t('login.showManualSetup')}
          continueInDemoModeLabel={t('login.continueInDemoMode')}
          onClusterAccess={() => { emitLogin('dev-login'); window.location.href = '/auth/github' }}
          onSetupGitHub={() => { window.location.href = '/auth/manifest/setup' }}
          onToggleManualSetup={() => setOauthSetupExpanded(!oauthSetupExpanded)}
          onDemoMode={() => { emitLogin('demo-from-login'); login({ preferDemo: true }) }}
        />
      )}
      </div>
    </>
  )
}
