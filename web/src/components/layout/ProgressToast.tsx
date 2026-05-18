import { Check, AlertTriangle, Loader2, RefreshCw, RotateCcw, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '../ui/Button'
import { cn } from '../../lib/cn'
import { WATCHDOG_STAGE_LABELS } from '../../hooks/useBackendHealth'
import type { UpdateProgress } from '../../types/updates'

export type RestartState = 'idle' | 'restarting' | 'waiting' | 'copied'

interface ProgressToastProps {
  backendDown: boolean
  backendUnavailable: boolean
  restartState: RestartState
  restartError: string | null
  showBackendBanner: boolean
  showStartupSnackbar: boolean
  showUpdateToast: boolean
  updateProgress: UpdateProgress | null
  versionChanged: boolean
  watchdogStage: string | null
  onDismissUpdateToast: () => void
  onRestartBackend: () => void
}

export function ProgressToast({
  backendDown,
  backendUnavailable,
  restartState,
  restartError,
  showBackendBanner,
  showStartupSnackbar,
  showUpdateToast,
  updateProgress,
  versionChanged,
  watchdogStage,
  onDismissUpdateToast,
  onRestartBackend,
}: ProgressToastProps) {
  const { t } = useTranslation()
  const showVersionToast = versionChanged
    && !showStartupSnackbar
    && !showBackendBanner
    && !showUpdateToast

  return (
    <>
      {showBackendBanner && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-toast animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div
            className={cn(
              'flex items-center gap-2 px-4 py-3 rounded-lg border shadow-lg text-sm',
              backendDown
                ? backendUnavailable
                  ? 'bg-red-950/90 border-red-800/50 text-red-200'
                  : 'bg-blue-950/90 border-blue-800/50 text-blue-200'
                : 'bg-green-900/80 border-green-700/50 text-green-200',
            )}
          >
            {backendDown ? (
              <div className="flex flex-col items-center gap-1">
                <div className="flex items-center gap-2">
                  {backendUnavailable ? (
                    <AlertTriangle className="w-4 h-4 text-red-400" />
                  ) : (
                    <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                  )}
                  <span>
                    {backendUnavailable
                      ? t('layout.backendUnavailable')
                      : watchdogStage
                        ? t(WATCHDOG_STAGE_LABELS[watchdogStage] ?? 'layout.consoleRestarting', {
                            defaultValue: 'Console restarting…',
                          })
                        : t('layout.consoleRestarting')}
                  </span>
                  {!watchdogStage && (
                    restartState === 'restarting' ? (
                      <button disabled className="ml-1 flex items-center gap-1.5 px-2.5 py-2 min-h-11 bg-muted text-muted-foreground rounded text-xs cursor-wait">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        {t('layout.restarting')}
                      </button>
                    ) : restartState === 'waiting' ? (
                      <span className="ml-1 flex items-center gap-1.5 px-2.5 py-1 bg-muted text-muted-foreground rounded text-xs">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        {t('layout.restartedWaiting')}
                      </span>
                    ) : restartState === 'copied' ? (
                      <span className="ml-1 flex items-center gap-1.5 px-2.5 py-1 bg-green-800/50 text-green-300 rounded text-xs">
                        <Check className="w-3 h-3" />
                        {t('layout.copiedRestartCommand')}
                      </span>
                    ) : (
                      <button
                        onClick={onRestartBackend}
                        className="ml-1 flex items-center gap-1.5 px-2.5 py-2 bg-muted hover:bg-muted/80 text-foreground rounded text-xs transition-colors min-h-11 min-w-11"
                        title={t('layout.restartBackendServer')}
                      >
                        <RotateCcw className="w-3 h-3" />
                        {t('layout.restart')}
                      </button>
                    )
                  )}
                </div>
                {!watchdogStage && (restartError ? (
                  <span className="text-xs text-muted-foreground">{restartError}</span>
                ) : (
                  <span
                    className={cn(
                      'text-xs',
                      backendUnavailable ? 'text-red-300/70' : 'text-blue-300/70',
                    )}
                  >
                    {backendUnavailable
                      ? t('layout.backendUnavailableHint')
                      : t('layout.consoleRestartingHint')}
                  </span>
                ))}
              </div>
            ) : (
              <>
                <div className="w-2 h-2 rounded-full bg-green-400" />
                {t('layout.reconnected')}
              </>
            )}
          </div>
        </div>
      )}

      {showUpdateToast && updateProgress && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-toast animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div
            className={cn(
              'flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg text-sm min-w-[320px] max-w-[480px]',
              updateProgress.status === 'done'
                ? 'bg-green-900/80 border-green-700/50 text-green-200'
                : updateProgress.status === 'failed' || updateProgress.status === 'cancelled'
                  ? 'bg-red-950/90 border-red-800/50 text-red-200'
                  : 'bg-blue-950/90 border-blue-800/50 text-blue-200',
            )}
          >
            {updateProgress.status === 'done' ? (
              <>
                <Check className="w-4 h-4 text-green-400 shrink-0" />
                <span className="flex-1">{t('layout.updateComplete')}</span>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => window.location.reload()}
                  className="ml-1 rounded"
                >
                  {t('layout.reload')}
                </Button>
              </>
            ) : updateProgress.status === 'failed' || updateProgress.status === 'cancelled' ? (
              <>
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                <span className="flex-1 truncate">
                  {updateProgress.status === 'cancelled'
                    ? t('layout.updateCancelled')
                    : t('layout.updateFailed')}
                  {updateProgress.message ? ` — ${updateProgress.message}` : ''}
                </span>
                <button
                  onClick={onDismissUpdateToast}
                  className="p-2 hover:bg-secondary/50 rounded shrink-0 min-h-11 min-w-11"
                >
                  <X className="w-3 h-3" />
                </button>
              </>
            ) : (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-blue-400 shrink-0" />
                <span className="flex-1 truncate">
                  {updateProgress.status === 'restarting' && watchdogStage
                    ? t(WATCHDOG_STAGE_LABELS[watchdogStage] ?? 'layout.updateInProgress', {
                        defaultValue: t('layout.updateInProgress'),
                      })
                    : updateProgress.message ?? t('layout.updateInProgress')}
                </span>
                <div className="w-20 bg-secondary rounded-full h-1.5 shrink-0">
                  <div
                    className="bg-blue-500 h-1.5 rounded-full transition-all duration-500"
                    style={{ width: `${updateProgress.progress ?? 0}%` }}
                  />
                </div>
                <span className="text-xs text-blue-300/60 tabular-nums shrink-0">
                  {updateProgress.progress ?? 0}%
                </span>
              </>
            )}
          </div>
        </div>
      )}

      {showStartupSnackbar && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-toast animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg text-sm bg-blue-950/90 border-blue-800/50 text-blue-200">
            <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
            <span>{t('layout.startingUp')}</span>
          </div>
        </div>
      )}

      {showVersionToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-toast animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg text-sm bg-blue-950/90 border-blue-800/50 text-blue-200">
            <RefreshCw className="w-4 h-4 text-blue-400" />
            <span>{t('layout.newVersionAvailable')}</span>
            <Button
              variant="primary"
              size="sm"
              onClick={() => window.location.reload()}
              className="ml-1 rounded"
            >
              {t('layout.reload')}
            </Button>
          </div>
        </div>
      )}
    </>
  )
}
