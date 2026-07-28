import { Suspense } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { ROUTES } from '../../config/routes'
import { safeLazy } from '@/lib/safeLazy'
import { LocalLoginForm } from './LocalLoginForm'

const GlobeAnimation = safeLazy(() => import('../animations/globe'), 'GlobeAnimation')

export function Login() {
  const { login, isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-transparent border-t-primary" />
      </div>
    )
  }

  if (isAuthenticated) {
    return <Navigate to={ROUTES.HOME} replace />
  }

  const STAR_COUNT = 30
  const starStyles = Array.from({ length: STAR_COUNT }, () => ({
    width: Math.random() * 3 + 1 + 'px',
    height: Math.random() * 3 + 1 + 'px',
    left: Math.random() * 100 + '%',
    top: Math.random() * 100 + '%',
    animationDelay: Math.random() * 3 + 's',
  }))

  return (
    <div data-testid="login-page" className="h-screen flex bg-background relative overflow-hidden">
      <div className="flex-1 h-full flex items-center justify-center relative z-10">
        <LocalLoginForm
          login={login}
          isLoading={isLoading}
          isAuthenticated={isAuthenticated}
          starStyles={starStyles}
        />
      </div>

      <div className="hidden lg:block flex-1 h-full relative overflow-hidden">
        <div className="absolute inset-0 bg-linear-to-l from-background to-transparent" />
        <div className="absolute inset-0">
          <Suspense fallback={
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500" />
            </div>
          }>
            <GlobeAnimation
              width="100%"
              height="100%"
              showLoader={false}
              enableControls={true}
            />
          </Suspense>
        </div>
      </div>

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
