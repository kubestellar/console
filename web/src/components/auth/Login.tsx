import { lazy, Suspense, useEffect, useMemo, useState, useRef } from 'react'
import { AlertTriangle, ExternalLink, Settings, Copy, Check, ChevronDown, ChevronRight, KeyRound, Monitor } from 'lucide-react'
import { Github } from '@/lib/icons'
import { Navigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { checkOAuthConfiguredWithRetry } from '../../lib/api'
import { ROUTES } from '../../config/routes'
import { useTranslation } from 'react-i18next'
import { emitLogin } from '../../lib/analytics'
import { LogoWithStar } from '../ui/LogoWithStar'
import { useBranding } from '../../hooks/useBranding'
import { UI_FEEDBACK_TIMEOUT_MS } from '../../lib/constants/network'
import { copyToClipboard } from '../../lib/clipboard'

// Lazy load the heavy Three.js globe animation
const GlobeAnimation = lazy(() => import('../animations/globe').then(m => ({ default: m.GlobeAnimation })))

// Apache 2.0 license is the project's effective terms; link opens in a new tab (#8376).
const TERMS_OF_SERVICE_URL = 'https://github.com/kubestellar/console/blob/main/LICENSE'

// GitHub Developer Settings URL for creating OAuth Apps.
const GITHUB_DEVELOPER_SETTINGS_URL = 'https://github.com/settings/developers'

// Default OAuth callback URL shown in the setup wizard steps.
const DEFAULT_OAUTH_CALLBACK = 'http://localhost:8080/auth/github/callback'

// Step-by-step instructions for creating a GitHub OAuth App.
// Each step is rendered inline on the Login page when OAuth is not configured.
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

// Note: OAUTH_SETUP_STEPS indices are used directly in handleCopyStep; the
// restart step is at index 7 (last element) if analytics tracking needs it.

/** Structured info displayed for each OAuth error code returned by the backend. */
interface OAuthErrorEntry {
  title: string
  message: string
  steps: string[]
}

// Map backend error codes to user-friendly messages with troubleshooting steps
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

/** Fallback error info for unrecognized error codes. */
const UNKNOWN_ERROR_FALLBACK: OAuthErrorEntry = {
  title: 'Authentication Error',
  message: 'An unexpected error occurred during login.',
  steps: [
    'Try logging in again — click "Continue with GitHub" below',
    'Restart the console and try again',
    'Check the backend logs for more details',
  ] }

export function Login() {
  const { t } = useTranslation('common')
  const { login, isAuthenticated, isLoading } = useAuth()
  const [searchParams] = useSearchParams()
  const sessionExpired = searchParams.get('reason') === 'session_expired'
  const oauthError = useMemo(() => searchParams.get('error'), [searchParams])
  const errorDetail = searchParams.get('error_detail')
  const errorInfo = (() => {
    if (!oauthError) return null
    const known = OAUTH_ERROR_INFO[oauthError]
    if (known) return known
    // Fallback for unrecognized error codes so the user always sees actionable UI
    return { ...UNKNOWN_ERROR_FALLBACK, message: `An unexpected error occurred during login (code: ${oauthError}).` }
  })()
  const branding = useBranding()
  // True when the user lands on the Login page while visiting the hosted demo
  // domain (e.g. "console.kubestellar.io"). Real GitHub OAuth is not configured
  // at that origin, so we surface an explicit notice and disable the button to
  // prevent a dead-end click-through (ref: #6338).
  const isHostedDemoLogin = typeof window !== 'undefined'
    && !!branding.hostedDomain
    && window.location.hostname === branding.hostedDomain

  // Track whether the backend is up but OAuth is not configured — when true,
  // the Login page shows a setup wizard instead of silently falling into demo
  // mode. This gives self-hosted users a clear "Sign in with GitHub" path
  // (addresses kubestellar/kubestellar#3761).
  const [showOAuthSetup, setShowOAuthSetup] = useState(false)
  const [oauthSetupExpanded, setOauthSetupExpanded] = useState(false)
  const [copiedStep, setCopiedStep] = useState<number | null>(null)
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Cleanup copy-feedback timer on unmount.
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

  // Pre-compute random star positions so render stays pure (no Math.random() in JSX)
  const STAR_COUNT = 30
  const starStyles = Array.from({ length: STAR_COUNT }, () => ({
      width: Math.random() * 3 + 1 + 'px',
      height: Math.random() * 3 + 1 + 'px',
      left: Math.random() * 100 + '%',
      top: Math.random() * 100 + '%',
      animationDelay: Math.random() * 3 + 's' }))

  // Auto-login for Netlify deploy previews and the hosted demo domain.
  // When the backend is up but OAuth is NOT configured, show the login page
  // with setup instructions instead of silently falling into demo mode — this
  // gives self-hosted users a clear path to enable GitHub authentication
  // (addresses kubestellar/kubestellar#3761).
  // Skip auto-login when there's an OAuth error so the user can see the troubleshooting info.
  useEffect(() => {
    if (isLoading || isAuthenticated || oauthError) return

    const isNetlifyPreview = window.location.hostname.includes('deploy-preview-') ||
      window.location.hostname.includes('netlify.app')
    const isDemoMode = import.meta.env.VITE_DEMO_MODE === 'true'
    // Hosted demo domain from branding (e.g. "console.kubestellar.io") — there
    // is no real OAuth backend at that origin, so auto-login with a demo user.
    // This fixes the case where users visiting the hosted demo would otherwise
    // see a "Sign in with GitHub" button that leads nowhere.
    const hostedDomain = branding.hostedDomain
    const isHostedDemo = !!hostedDomain && window.location.hostname === hostedDomain

    if (isNetlifyPreview || isDemoMode || isHostedDemo) {
      emitLogin('auto-netlify'); login()
      return
    }

    // When the backend is up but OAuth is not configured, show the login page
    // with setup instructions rather than silently auto-logging in as a demo
    // user. Users can still choose "Continue in Demo Mode" from the page.
    checkOAuthConfiguredWithRetry().then(({ backendUp, oauthConfigured }) => {
      if (backendUp && !oauthConfigured) {
        setShowOAuthSetup(true)
      }
    }).catch(() => { /* checkOAuthConfiguredWithRetry always resolves — defensive catch */ })
  }, [isLoading, isAuthenticated, login, oauthError, branding.hostedDomain])

  // Show loading while checking auth status
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-transparent border-t-primary" />
      </div>
    )
  }

  // Redirect to dashboard if already authenticated
  if (isAuthenticated) {
    return <Navigate to={ROUTES.HOME} replace />
  }

  return (
    <div data-testid="login-page" className="h-screen flex bg-background relative overflow-hidden">
      {/* Left side - Login form */}
      <div className="flex-1 h-full flex items-center justify-center relative z-10">
        {/* Star field background (left side only) */}
        <div className="star-field absolute inset-0">
          {starStyles.map((style, i) => (
            <div key={i} className="star" style={style} />
          ))}
        </div>

        {/* Gradient orbs */}
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-purple-600/20 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-blue-600/20 rounded-full blur-3xl" />

        {/* Login card */}
        <div className="relative z-10 glass rounded-2xl p-8 max-w-md w-full mx-4 animate-fade-in-up">
          {/* Logo */}
          <div className="flex justify-center mb-8">
            <div className="flex items-center gap-3">
              <LogoWithStar className="w-14 h-14" />
              <div>
                <h1 className="text-2xl font-bold text-foreground">{branding.appShortName}</h1>
                <p className="text-sm text-muted-foreground">{branding.appName}</p>
              </div>
            </div>
          </div>

          {/* Session expired banner */}
          {sessionExpired && (
            <div className="flex items-center gap-3 mb-6 px-4 py-3 rounded-lg border border-yellow-500/50 bg-yellow-500/10 text-yellow-300 text-sm">
              <AlertTriangle className="w-5 h-5 shrink-0 text-yellow-400" />
              <div>
                <div className="font-medium">{t('login.sessionExpired')}</div>
                <div className="text-xs text-yellow-400/80 mt-0.5">{t('login.sessionTimedOut')}</div>
              </div>
            </div>
          )}

          {/* OAuth error banner */}
          {errorInfo && (
            <div data-testid="oauth-error-banner" className="mb-6 rounded-lg border border-red-500/50 bg-red-500/10 overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3 text-red-300 text-sm">
                <AlertTriangle className="w-5 h-5 shrink-0 text-red-400" />
                <div>
                  <div className="font-medium text-red-300">{errorInfo.title}</div>
                  <div className="text-xs text-red-400/80 mt-0.5">{errorInfo.message}</div>
                </div>
              </div>
              {/* Server-provided detail (e.g., specific GitHub error description) */}
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

          {/* Welcome text */}
          <div className="text-center mb-8">
            <h2 data-testid="login-welcome-heading" className="text-xl font-semibold text-foreground mb-2">
              {oauthError ? 'Login Failed' : sessionExpired ? t('login.sessionExpired') : t('login.welcomeBack')}
            </h2>
            <p className="text-muted-foreground">
              {oauthError ? 'Fix the issue above and try again' : t('login.signInDescription')}
            </p>
          </div>

          {/* Hosted demo notice — shown when on the hosted demo domain so users
            * understand that GitHub OAuth is intentionally unavailable and that
            * they'll be auto-logged-in as a demo user. Ref: #6338. */}
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

          {/* OAuth not configured notice — shown when the backend is running
            * but no GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET are set. Gives
            * self-hosted users a clear path to enable GitHub sign-in instead
            * of silently falling into demo mode (#3761). */}
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

              {/* Expandable setup wizard */}
              <div className="px-4 pb-3">
                <button
                  onClick={() => setOauthSetupExpanded(!oauthSetupExpanded)}
                  className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                >
                  {oauthSetupExpanded ? (
                    <ChevronDown className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5" />
                  )}
                  {t('login.showSetupSteps')}
                </button>

                {oauthSetupExpanded && (
                  <div className="mt-2 space-y-2">
                    {OAUTH_SETUP_STEPS.map((step, idx) => (
                      <div key={idx} className="text-xs">
                        {step.link ? (
                          <span className="text-muted-foreground">
                            {idx + 1}. {step.label}{' '}
                            <a
                              href={step.link}
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
                              <pre className="flex-1 rounded bg-muted px-3 py-1.5 font-mono text-foreground select-all overflow-x-auto whitespace-pre text-[11px]">
                                {step.command}
                              </pre>
                              <button
                                onClick={() => handleCopyStep(step.command, idx)}
                                className="shrink-0 p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors self-start"
                                title="Copy"
                              >
                                {copiedStep === idx ? (
                                  <Check className="w-3.5 h-3.5 text-green-400" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>
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

          {/* GitHub login button — shown when OAuth IS configured */}
          {!showOAuthSetup && (
            <button
              data-testid="github-login-button"
              onClick={() => { if (!isHostedDemoLogin) { emitLogin('github'); login() } }}
              disabled={isHostedDemoLogin}
              title={isHostedDemoLogin ? 'Not available in the hosted demo — self-host to enable GitHub OAuth' : undefined}
              className="w-full flex items-center justify-center gap-3 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-medium py-3 px-4 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-all duration-200 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white dark:disabled:hover:bg-gray-800 disabled:hover:shadow-none"
            >
              <Github className="w-5 h-5" />
              {t('login.continueWithGitHub')}
            </button>
          )}

          {/* Two-button layout when OAuth is not configured:
              primary "Sign in with GitHub" (links to setup) + secondary "Demo Mode" */}
          {showOAuthSetup && (
            <div className="space-y-3">
              <button
                data-testid="github-setup-button"
                onClick={() => setOauthSetupExpanded(true)}
                className="w-full flex items-center justify-center gap-3 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-medium py-3 px-4 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-all duration-200 hover:shadow-lg"
              >
                <Github className="w-5 h-5" />
                {t('login.setupGitHubSignIn')}
              </button>
              <button
                data-testid="demo-mode-button"
                onClick={() => { emitLogin('demo-from-login'); login() }}
                className="w-full flex items-center justify-center gap-3 text-muted-foreground font-medium py-2.5 px-4 rounded-lg border border-border/50 hover:bg-secondary/50 hover:text-foreground transition-all duration-200"
              >
                <Monitor className="w-4 h-4" />
                {t('login.continueInDemoMode')}
              </button>
            </div>
          )}

          {/* Footer */}
          <div className="text-center text-sm text-muted-foreground mt-8">
            {t('login.termsOfServicePrefix')}{' '}
            <a
              href={TERMS_OF_SERVICE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground transition-colors"
            >
              {t('login.termsOfServiceLink')}
            </a>
          </div>
        </div>
      </div>

      {/* Right side - Globe animation */}
      <div className="hidden lg:block flex-1 h-full relative overflow-hidden">
        {/* Subtle gradient background for the globe side */}
        <div className="absolute inset-0 bg-linear-to-l from-background to-transparent" />
        {/* Wrapper div ensures the globe is absolutely positioned (GlobeAnimation
            internally prepends "relative" to className which overrides "absolute"
            in Tailwind's CSS ordering, causing layout breakage). */}
        <div className="absolute inset-0">
          <Suspense fallback={
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500" />
            </div>
          }>
            <GlobeAnimation
              width="100%"
              height="100%"
              showLoader={true}
              enableControls={true}
            />
          </Suspense>
        </div>
      </div>

      {/* Version info - bottom right */}
      <div className="absolute bottom-4 right-4 text-xs text-muted-foreground font-mono z-10 flex items-center gap-2">
        <span className={`px-1.5 py-0.5 rounded text-2xs uppercase font-bold ${__DEV_MODE__ ? 'bg-yellow-500/20 text-yellow-400' : 'bg-green-500/20 text-green-400'}`}>
          {__DEV_MODE__ ? 'dev' : 'prod'}
        </span>
        <span title={`Built: ${__BUILD_TIME__}`}>
          v{__APP_VERSION__} · {__COMMIT_HASH__.substring(0, 7)}
        </span>
      </div>
    </div>
  )
}
