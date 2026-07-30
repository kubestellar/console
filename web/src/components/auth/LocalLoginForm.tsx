import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { LoginOptions } from '../../lib/devLogin'
import { emitLogin } from '../../lib/analytics'
import { LogoWithStar } from '../ui/LogoWithStar'
import { OIDCLoginButton } from './OIDCLoginButton'
import { SSOProviderList } from './SSOProviderList'
import { useLocalLogin } from './useLocalLogin'
import { OAuthErrorBanner, OAuthSetupNotice } from './LocalLoginForm.parts'

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
  const {
    sessionExpired,
    manifestSuccess,
    oauthError,
    errorDetail,
    errorInfo,
    branding,
    isHostedDemoLogin,
    showOAuthSetup,
    inClusterNoOAuth,
    oauthSetupExpanded,
    toggleOauthSetupExpanded,
    copiedStep,
    handleCopyStep,
  } = useLocalLogin(login, isLoading, isAuthenticated)

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
        <OAuthErrorBanner
          errorInfo={errorInfo}
          errorDetail={errorDetail}
          repoUrl={branding.repoUrl}
        />
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
        <OAuthSetupNotice
          oauthSetupExpanded={oauthSetupExpanded}
          onToggleExpand={toggleOauthSetupExpanded}
          copiedStep={copiedStep}
          onCopyStep={handleCopyStep}
          repoUrl={branding.repoUrl}
        />
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
          onToggleManualSetup={toggleOauthSetupExpanded}
          onDemoMode={() => { emitLogin('demo-from-login'); login({ preferDemo: true }) }}
        />
      )}
      </div>
    </>
  )
}
