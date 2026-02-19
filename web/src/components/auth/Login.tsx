import { lazy, Suspense, useEffect, useMemo } from 'react'
import { Github, AlertTriangle, ExternalLink, Settings } from 'lucide-react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { checkOAuthConfigured } from '../../lib/api'
import { ROUTES } from '../../config/routes'
import { useTranslation } from 'react-i18next'

// Lazy load the heavy Three.js globe animation
const GlobeAnimation = lazy(() => import('../animations/globe').then(m => ({ default: m.GlobeAnimation })))

// Map backend error codes to user-friendly messages with troubleshooting steps
const OAUTH_ERROR_INFO: Record<string, { title: string; message: string; steps: string[] }> = {
  exchange_failed: {
    title: 'GitHub OAuth Token Exchange Failed',
    message: 'The console was unable to complete the login with GitHub. This usually means your OAuth app is misconfigured.',
    steps: [
      'Check that GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET are set in your .env file',
      'Verify the Client Secret in your GitHub OAuth app matches what\'s in .env (regenerate if unsure)',
      'Confirm the "Authorization callback URL" in your GitHub OAuth app is set to: http://localhost:8080/auth/github/callback',
      'Restart the console after updating .env',
    ],
  },
  csrf_validation_failed: {
    title: 'Login Session Expired',
    message: 'The login session timed out or was interrupted. This can happen with Safari or slow networks.',
    steps: [
      'Try logging in again — click "Continue with GitHub" below',
      'If using Safari, try Chrome or Firefox instead',
      'Clear your browser cookies for localhost and try again',
    ],
  },
  missing_code: {
    title: 'GitHub Login Incomplete',
    message: 'GitHub did not return an authorization code. The OAuth flow may have been interrupted.',
    steps: [
      'Try logging in again — click "Continue with GitHub" below',
      'Check that your GitHub OAuth app is not suspended or deleted',
      'Verify the "Homepage URL" in your GitHub OAuth app settings',
    ],
  },
  user_fetch_failed: {
    title: 'Could Not Retrieve GitHub Profile',
    message: 'Login succeeded but the console was unable to fetch your GitHub profile.',
    steps: [
      'Try logging in again — this may be a temporary GitHub API issue',
      'Check that your GitHub OAuth app has the "read:user" scope',
      'Verify your internet connection to api.github.com',
    ],
  },
  db_error: {
    title: 'Database Error',
    message: 'The console backend encountered a database error while processing your login.',
    steps: [
      'Restart the console and try again',
      'Check the backend logs for more details',
    ],
  },
}

export function Login() {
  const { t } = useTranslation('common')
  const { login, isAuthenticated, isLoading } = useAuth()
  const [searchParams] = useSearchParams()
  const sessionExpired = useMemo(() => searchParams.get('reason') === 'session_expired', [searchParams])
  const oauthError = useMemo(() => searchParams.get('error'), [searchParams])
  const errorInfo = oauthError ? OAUTH_ERROR_INFO[oauthError] : null

  // Auto-login for Netlify deploy previews or when backend has no OAuth configured
  // Skip auto-login when there's an OAuth error so the user can see the troubleshooting info
  useEffect(() => {
    if (isLoading || isAuthenticated || oauthError) return

    const isNetlifyPreview = window.location.hostname.includes('deploy-preview-') ||
      window.location.hostname.includes('netlify.app')
    const isDemoMode = import.meta.env.VITE_DEMO_MODE === 'true'

    if (isNetlifyPreview || isDemoMode) {
      login()
      return
    }

    // Binary quickstart without OAuth: auto-login to skip the login page
    // (the backend will create a dev-user JWT automatically)
    checkOAuthConfigured().then(({ backendUp, oauthConfigured }) => {
      if (backendUp && !oauthConfigured) {
        login()
      }
    })
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
    <div data-testid="login-page" className="min-h-screen flex bg-[#0a0a0a] relative overflow-hidden">
      {/* Left side - Login form */}
      <div className="flex-1 flex items-center justify-center relative z-10">
        {/* Star field background (left side only) */}
        <div className="star-field absolute inset-0">
          {Array.from({ length: 30 }).map((_, i) => (
            <div
              key={i}
              className="star"
              style={{
                width: Math.random() * 3 + 1 + 'px',
                height: Math.random() * 3 + 1 + 'px',
                left: Math.random() * 100 + '%',
                top: Math.random() * 100 + '%',
                animationDelay: Math.random() * 3 + 's',
              }}
            />
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
              <img
                src="/kubestellar-logo.svg"
                alt="KubeStellar"
                className="w-14 h-14"
              />
              <div>
                <h1 className="text-2xl font-bold text-foreground">KubeStellar</h1>
                <p className="text-sm text-muted-foreground">KubeStellar Console</p>
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
            <div className="mb-6 rounded-lg border border-red-500/50 bg-red-500/10 overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3 text-red-300 text-sm">
                <AlertTriangle className="w-5 h-5 shrink-0 text-red-400" />
                <div>
                  <div className="font-medium text-red-300">{errorInfo.title}</div>
                  <div className="text-xs text-red-400/80 mt-0.5">{errorInfo.message}</div>
                </div>
              </div>
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
                    href="https://github.com/kubestellar/console#quick-start"
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
            onClick={login}
            className="w-full flex items-center justify-center gap-3 bg-white text-gray-900 font-medium py-3 px-4 rounded-lg hover:bg-gray-100 transition-all duration-200 hover:shadow-lg"
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
      <div className="hidden lg:flex flex-1 items-center justify-center relative">
        {/* Subtle gradient background for the globe side */}
        <div className="absolute inset-0 bg-gradient-to-l from-[#0a0f1c] to-transparent" />
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
            className="absolute inset-0"
          />
        </Suspense>
      </div>

      {/* Version info - bottom right */}
      <div className="absolute bottom-4 right-4 text-xs text-gray-600 font-mono z-10 flex items-center gap-2">
        <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${__DEV_MODE__ ? 'bg-yellow-500/20 text-yellow-400' : 'bg-green-500/20 text-green-400'}`}>
          {__DEV_MODE__ ? 'dev' : 'prod'}
        </span>
        <span title={`Built: ${__BUILD_TIME__}`}>
          v{__APP_VERSION__} · {__COMMIT_HASH__.substring(0, 7)}
        </span>
      </div>
    </div>
  )
}
