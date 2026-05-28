import { useEffect, useReducer, type ReactNode } from 'react'
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../lib/cn'
import { STORAGE_KEY_HAS_SESSION, STORAGE_KEY_TOKEN } from '../lib/constants'
import { isDemoMode } from '../lib/demoMode'
import { fetchKagentStatus } from '../lib/kagentBackend'
import { getUserSafeErrorMessage } from '../lib/errors/handleError'
import { stellarApi } from '../services/stellar'
import { StatusBadge } from './ui/StatusBadge'
import { Button } from './ui/Button'

const INITIAL_HANDSHAKE_TIMEOUT_MS = 15_000
const INITIAL_HANDSHAKE_TIMEOUT_SECONDS = INITIAL_HANDSHAKE_TIMEOUT_MS / 1000
const STELLAR_STATE_ENDPOINT = '/api/stellar/state'
const KAGENT_STATUS_ENDPOINT = '/api/kagent/status'
const AUTH_REQUIRED_PANEL_CLASSNAME = 'w-full max-w-xl rounded-xl border border-border bg-card p-8 shadow-sm'
const LEGACY_STORAGE_KEY_KC_TOKEN = 'kc_token'
const LOGIN_PATH = '/login'

type HandshakeState = 'loading' | 'ready' | 'error' | 'auth-required'

type HandshakeErrorDetail = {
  endpoint: string
  message: string
  isAuthError?: boolean
}

interface GateState {
  handshakeState: HandshakeState
  errorDetails: HandshakeErrorDetail[]
}

interface InitialInfrastructureGateProps {
  children: ReactNode
}

const isAuthenticationError = (error: unknown): boolean => {
  if (!error) return false
  const errorMessage = error instanceof Error ? error.message : String(error)
  const authErrorPatterns = [
    'No authentication token',
    'Token is invalid or expired',
    'Unauthenticated',
    'UnauthenticatedError',
    'UnauthorizedError',
    'authentication failed',
    'not authenticated',
  ]
  return authErrorPatterns.some(pattern =>
    errorMessage.toLowerCase().includes(pattern.toLowerCase()),
  )
}

type GateAction = 
  | { type: 'RESET' }
  | { type: 'SET_READY' }
  | { type: 'SET_ERROR'; payload: HandshakeErrorDetail[]; isAuthError: boolean }

const gateReducer = (state: GateState, action: GateAction): GateState => {
  switch (action.type) {
    case 'RESET':
      return { handshakeState: 'loading', errorDetails: [] }
    case 'SET_READY':
      return { handshakeState: 'ready', errorDetails: [] }
    case 'SET_ERROR':
      return {
        handshakeState: action.isAuthError ? 'auth-required' : 'error',
        errorDetails: action.payload,
      }
    default:
      return state
  }
}

const clearStaleSessionAndRedirectToLogin = (): void => {
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY_KC_TOKEN)
    localStorage.removeItem(STORAGE_KEY_TOKEN)
    localStorage.removeItem(STORAGE_KEY_HAS_SESSION)
  } catch {
    // ignore localStorage access failures and continue to login
  }
  window.location.href = LOGIN_PATH
}

export function InitialInfrastructureGate({ children }: InitialInfrastructureGateProps) {
  const { t } = useTranslation('common')
  const [attempt, setAttempt] = useReducer((count) => count + 1, 0)
  const [{ handshakeState, errorDetails }, dispatch] = useReducer(gateReducer, {
    handshakeState: 'loading',
    errorDetails: [],
  })

  useEffect(() => {
    // In demo mode there is no real backend — skip the handshake entirely
    // so the hosted demo (console.kubestellar.io) renders immediately.
    if (isDemoMode()) {
      dispatch({ type: 'SET_READY' })
      return
    }

    const controller = new AbortController()
    dispatch({ type: 'RESET' })

    const runHandshake = async () => {
      const results = await Promise.allSettled([
        stellarApi.getState({
          timeout: INITIAL_HANDSHAKE_TIMEOUT_MS,
          fallbackOnError: false,
          signal: controller.signal,
        }),
        fetchKagentStatus({
          timeoutMs: INITIAL_HANDSHAKE_TIMEOUT_MS,
          throwOnError: true,
          signal: controller.signal,
        }),
      ])

      if (controller.signal.aborted) return

      const failures: HandshakeErrorDetail[] = []
      let hasAuthError = false

      if (results[0].status === 'rejected') {
        const isAuth = isAuthenticationError(results[0].reason)
        hasAuthError = hasAuthError || isAuth
        failures.push({
          endpoint: STELLAR_STATE_ENDPOINT,
          message: getUserSafeErrorMessage(results[0].reason, t('startupHandshake.unknownError', 'Unknown error')),
          isAuthError: isAuth,
        })
      }
      if (results[1].status === 'rejected') {
        const isAuth = isAuthenticationError(results[1].reason)
        hasAuthError = hasAuthError || isAuth
        failures.push({
          endpoint: KAGENT_STATUS_ENDPOINT,
          message: getUserSafeErrorMessage(results[1].reason, t('startupHandshake.unknownError', 'Unknown error')),
          isAuthError: isAuth,
        })
      }

      if (failures.length > 0) {
        dispatch({ type: 'SET_ERROR', payload: failures, isAuthError: hasAuthError })
        return
      }

      dispatch({ type: 'SET_READY' })
    }

    void runHandshake()

    return () => {
      controller.abort()
    }
  }, [attempt, t])

  if (handshakeState === 'ready') {
    return <>{children}</>
  }

  if (handshakeState === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center p-8 max-w-md">
          <Loader2 className="w-12 h-12 text-primary mx-auto mb-4 animate-spin" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-foreground mb-2">
            {t('startupHandshake.loadingTitle', 'Connecting to infrastructure')}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t(
              'startupHandshake.loadingDescription',
              'Checking backend connectivity before loading the console.',
            )}
          </p>
        </div>
      </div>
    )
  }

  if (handshakeState === 'auth-required') {
    if (isDemoMode()) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background px-4">
          <div className={cn(AUTH_REQUIRED_PANEL_CLASSNAME, 'text-center')} role="alert">
            <div className="mb-4 flex items-center justify-center gap-2">
              <StatusBadge
                color="yellow"
                variant="outline"
                rounded="full"
                role="img"
                aria-label={t('startupHandshake.demoBadgeLabel', 'Demo environment')}
              >
                {t('layout.demo', 'Demo')}
              </StatusBadge>
            </div>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <RefreshCw className="h-5 w-5" aria-hidden="true" />
            </div>
            <h2 className="mb-3 text-xl font-semibold text-foreground">
              {t('startupHandshake.demoAuthTitle', 'Demo Session')}
            </h2>
            <p className="mb-3 text-sm text-muted-foreground">
              {t(
                'startupHandshake.demoAuthDescription',
                'You are viewing the Console in demo mode. This message does not indicate a real authentication failure.',
              )}
            </p>
            <div className="mb-6 rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
              {t(
                'startupHandshake.demoAuthHint',
                'Reload the page to reset the demo session and continue exploring the demo experience.',
              )}
            </div>
            <div className="flex items-center justify-center">
              <Button
                onClick={() => window.location.reload()}
                variant="primary"
                size="md"
                icon={<RefreshCw className="w-4 h-4" aria-hidden="true" />}
              >
                {t('startupHandshake.demoAuthRefresh', 'Reload Demo Session')}
              </Button>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className={cn(AUTH_REQUIRED_PANEL_CLASSNAME, 'text-center')} role="alert">
          <AlertTriangle className="mx-auto mb-4 h-12 w-12 text-yellow-400" aria-hidden="true" />
          <h2 className="mb-2 text-lg font-semibold text-foreground">
            {t('startupHandshake.authRequiredTitle', 'Authentication Required')}
          </h2>
          <div className="mb-6 text-sm text-muted-foreground">
            {t(
              'startupHandshake.authRequiredDescription',
              'Your session has expired or authentication credentials are missing. Please sign in again to continue using the console.',
            )}
          </div>
          <div className="mb-6 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4 text-left">
            <h3 className="mb-2 text-sm font-semibold text-foreground">
              {t('startupHandshake.authRecoveryTitle', 'Recovery Steps')}
            </h3>
            <ul className="list-inside list-disc space-y-2 text-sm text-muted-foreground">
              <li>{t('startupHandshake.authRecoveryStep1', 'Click "Reload page" to refresh your session')}</li>
              <li>{t('startupHandshake.authRecoveryStep2', 'If the issue persists, click "Sign In" below to start a new session')}</li>
              <li>{t('startupHandshake.authRecoveryStep3', 'Clicking "Sign In" clears the stale session before redirecting you to login')}</li>
            </ul>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button
              onClick={() => window.location.reload()}
              variant="primary"
              size="md"
              icon={<RefreshCw className="w-4 h-4" aria-hidden="true" />}
            >
              {t('chunkError.reloadPage', 'Reload page')}
            </Button>
            <Button
              onClick={() => setAttempt()}
              variant="secondary"
              size="md"
            >
              {t('actions.retry', 'Retry')}
            </Button>
            <Button
              onClick={clearStaleSessionAndRedirectToLogin}
              variant="ghost"
              size="md"
            >
              {t('actions.signIn', 'Sign In')}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center p-8 max-w-2xl" role="alert">
        <AlertTriangle className="w-12 h-12 text-yellow-400 mx-auto mb-4" aria-hidden="true" />
        <h2 className="text-lg font-semibold text-foreground mb-2">
          {t('startupHandshake.errorTitle', 'Infrastructure Connection Error')}
        </h2>
        <div className="text-sm text-muted-foreground mb-6">
          {t(
            'startupHandshake.errorDescription',
            'The console could not complete its startup handshake within {{timeoutSeconds}} seconds. Verify that the backend can reach the Kubernetes API, then retry.',
            { timeoutSeconds: INITIAL_HANDSHAKE_TIMEOUT_SECONDS },
          )}
        </div>
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4 text-left">
          <h3 className="text-sm font-semibold text-foreground mb-2">
            {t('startupHandshake.detailsTitle', 'Technical details')}
          </h3>
          <ul className="space-y-2 text-xs text-muted-foreground/80 font-mono wrap-break-word whitespace-pre-wrap">
            {(errorDetails || []).map(({ endpoint, message, isAuthError }) => (
              <li key={endpoint}>
                <span className="text-foreground">{endpoint}</span>
                <span className="text-muted-foreground/60"> — </span>
                <span>
                  {isAuthError
                    ? t('startupHandshake.authErrorAbstracted', 'Authentication or session issue detected')
                    : message}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="text-sm text-muted-foreground mt-4 mb-6">
          {t(
            'startupHandshake.actionHint',
            'Check backend logs, kubeconfig access, and cluster network connectivity before retrying.',
          )}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button
            onClick={() => setAttempt()}
            variant="primary"
            size="md"
            icon={<RefreshCw className="w-4 h-4" aria-hidden="true" />}
          >
            {t('actions.retry', 'Retry')}
          </Button>
          <Button
            onClick={() => window.location.reload()}
            variant="secondary"
            size="md"
          >
            {t('chunkError.reloadPage', 'Reload page')}
          </Button>
        </div>
      </div>
    </div>
  )
}
