import { useEffect, useState, type ReactNode } from 'react'
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { fetchKagentStatus } from '../lib/kagentBackend'
import { getUserSafeErrorMessage } from '../lib/errors/handleError'
import { stellarApi } from '../services/stellar'
import { Button } from './ui/Button'

const INITIAL_HANDSHAKE_TIMEOUT_MS = 15_000
const INITIAL_HANDSHAKE_TIMEOUT_SECONDS = INITIAL_HANDSHAKE_TIMEOUT_MS / 1000
const STELLAR_STATE_ENDPOINT = '/api/stellar/state'
const KAGENT_STATUS_ENDPOINT = '/api/kagent/status'

type HandshakeState = 'loading' | 'ready' | 'error'

type HandshakeErrorDetail = {
  endpoint: string
  message: string
}

interface InitialInfrastructureGateProps {
  children: ReactNode
}

export function InitialInfrastructureGate({ children }: InitialInfrastructureGateProps) {
  const { t } = useTranslation('common')
  const [attempt, setAttempt] = useState(0)
  const [handshakeState, setHandshakeState] = useState<HandshakeState>('loading')
  const [errorDetails, setErrorDetails] = useState<HandshakeErrorDetail[]>([])

  useEffect(() => {
    const controller = new AbortController()
    setHandshakeState('loading')
    setErrorDetails([])

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
      if (results[0].status === 'rejected') {
        failures.push({
          endpoint: STELLAR_STATE_ENDPOINT,
          message: getUserSafeErrorMessage(results[0].reason, t('startupHandshake.unknownError', 'Unknown error')),
        })
      }
      if (results[1].status === 'rejected') {
        failures.push({
          endpoint: KAGENT_STATUS_ENDPOINT,
          message: getUserSafeErrorMessage(results[1].reason, t('startupHandshake.unknownError', 'Unknown error')),
        })
      }

      if (failures.length > 0) {
        setErrorDetails(failures)
        setHandshakeState('error')
        return
      }

      setHandshakeState('ready')
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center p-8 max-w-2xl" role="alert">
        <AlertTriangle className="w-12 h-12 text-yellow-400 mx-auto mb-4" aria-hidden="true" />
        <h2 className="text-lg font-semibold text-foreground mb-2">
          {t('startupHandshake.errorTitle', 'Infrastructure Connection Error')}
        </h2>
        <p className="text-sm text-muted-foreground mb-6">
          {t(
            'startupHandshake.errorDescription',
            'The console could not complete its startup handshake within {{timeoutSeconds}} seconds. Verify that the backend can reach the Kubernetes API, then retry.',
            { timeoutSeconds: INITIAL_HANDSHAKE_TIMEOUT_SECONDS },
          )}
        </p>
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4 text-left">
          <h3 className="text-sm font-semibold text-foreground mb-2">
            {t('startupHandshake.detailsTitle', 'Backend details')}
          </h3>
          <ul className="space-y-2 text-xs text-muted-foreground/80 font-mono wrap-break-word whitespace-pre-wrap">
            {(errorDetails || []).map(({ endpoint, message }) => (
              <li key={endpoint}>
                <span className="text-foreground">{endpoint}</span>
                <span className="text-muted-foreground/60"> — </span>
                <span>{message}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-sm text-muted-foreground mt-4 mb-6">
          {t(
            'startupHandshake.actionHint',
            'Check backend logs, kubeconfig access, and cluster network connectivity before retrying.',
          )}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button
            onClick={() => setAttempt(current => current + 1)}
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
