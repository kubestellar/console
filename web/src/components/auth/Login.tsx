import { lazy, Suspense, useEffect, useMemo } from 'react'
import { AlertTriangle, ExternalLink, Settings } from 'lucide-react'
import { Github } from '@/lib/icons'
import { Navigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { checkOAuthConfigured } from '../../lib/api'
import { ROUTES } from '../../config/routes'
import { useTranslation } from 'react-i18next'
import { emitLogin } from '../../lib/analytics'
import { LogoWithStar } from '../ui/LogoWithStar'
import { useBranding } from '../../hooks/useBranding'

// Lazy load the heavy Three.js globe animation
const GlobeAnimation = lazy(() => import('../animations/globe').then(m => ({ default: m.GlobeAnimation })))

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

  // Pre-compute random star positions so render stays pure (no Math.random() in JSX)
  const STAR_COUNT = 30
  const starStyles = Array.from({ length: STAR_COUNT }, () => ({
      width: Math.random() * 3 + 1 + 'px',
      height: Math.random() * 3 + 1 + 'px',
      left: Math.random() * 100 + '%',
      top: Math.random() * 100 + '%',
      animationDelay: Math.random() * 3 + 's' }))

  // Auto-login for Netlify deploy previews or when backend has no OAuth configured
  // Skip auto-login when there's an OAuth error so the user can see the troubleshooting info
  useEffect(() => {
    if (isLoading || isAuthenticated || oauthError) return

    const isNetlifyPreview = window.location.hostname.includes('deploy-preview-') ||
      window.location.hostname.includes('netlify.app')
    const isDemoMode = import.meta.env.VITE_DEMO_MODE === 'true'

    if (isNetlifyPreview || isDemoMode) {
      emitLogin('auto-netlify'); login()
      return
    }

    // Binary quickstart without OAuth: auto-login to skip the login page
    // (the backend will create a dev-user JWT automatically)
    checkOAuthConfigured().then(({ backendUp, oauthConfigured }) => {
      if (backendUp && !oauthConfigured) {
        emitLogin('auto-quickstart'); login()
      }
    }).catch(() => { /* checkOAuthConfigured always resolves — defensive catch */ })
  }, [isLoading, isAuthenticated, login, oauthError])

  // Show loading while checking auth status
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-transparent border-t-primary" />
      </div>
    )
  }

  // Redirect to dashboard if already authenticated
  if (isAuthenticated) {
    return <Navigate to={ROUTES.HOME} replace />
  }

  return (
    <div data-testid="login-page" className="h-screen flex bg-[#0a0a0a] relative overflow-hidden">
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
                  <div className="text-xs text-red-400/60 bg-red-500/5 rounded px-3 py-2 font-mono break-words">
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

          {/* GitHub login button */}
          <button
            data-testid="github-login-button"
            onClick={() => { emitLogin('github'); login() }}
            className="w-full flex items-center justify-center gap-3 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-medium py-3 px-4 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-all duration-200 hover:shadow-lg"
          >
            <Github className="w-5 h-5" />
            {t('login.continueWithGitHub')}
          </button>

          {/* Footer */}
          <div className="text-center text-sm text-muted-foreground mt-8">
            {t('login.termsOfService')}
          </div>
        </div>
      </div>

      {/* Right side - Globe animation */}
      <div className="hidden lg:block flex-1 h-full relative overflow-hidden">
        {/* Subtle gradient background for the globe side */}
        <div className="absolute inset-0 bg-gradient-to-l from-[#0a0f1c] to-transparent" />
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
