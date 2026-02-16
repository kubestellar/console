import { lazy, Suspense, useEffect, useMemo } from 'react'
import { Github, AlertTriangle } from 'lucide-react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { checkOAuthConfigured } from '../../lib/api'
import { ROUTES } from '../../config/routes'
import { useTranslation } from 'react-i18next'

// Lazy load the heavy Three.js globe animation
const GlobeAnimation = lazy(() => import('../animations/globe').then(m => ({ default: m.GlobeAnimation })))

export function Login() {
  const { t: _t } = useTranslation()
  const { login, isAuthenticated, isLoading } = useAuth()
  const [searchParams] = useSearchParams()
  const sessionExpired = useMemo(() => searchParams.get('reason') === 'session_expired', [searchParams])

  // Auto-login for Netlify deploy previews or when backend has no OAuth configured
  useEffect(() => {
    if (isLoading || isAuthenticated) return

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
  }, [isLoading, isAuthenticated, login])

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
                <p className="font-medium">Session expired</p>
                <p className="text-xs text-yellow-400/80 mt-0.5">Your session has timed out. Please sign in again.</p>
              </div>
            </div>
          )}

          {/* Welcome text */}
          <div className="text-center mb-8">
            <h2 data-testid="login-welcome-heading" className="text-xl font-semibold text-foreground mb-2">
              {sessionExpired ? 'Session expired' : 'Welcome back'}
            </h2>
            <p className="text-muted-foreground">
              Sign in to manage your multi-cluster deployments
            </p>
          </div>

          {/* GitHub login button */}
          <button
            data-testid="github-login-button"
            onClick={login}
            className="w-full flex items-center justify-center gap-3 bg-white text-gray-900 font-medium py-3 px-4 rounded-lg hover:bg-gray-100 transition-all duration-200 hover:shadow-lg"
          >
            <Github className="w-5 h-5" />
            Continue with GitHub
          </button>

          {/* Footer */}
          <p className="text-center text-sm text-muted-foreground mt-8">
            By signing in, you agree to our Terms of Service
          </p>
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
