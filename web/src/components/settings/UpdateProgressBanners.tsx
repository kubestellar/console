import { Check, AlertTriangle, X, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { INITIAL_PROGRESS_PCT } from './useUpdateSettingsState'

interface ProgressEntry {
  step: number
  message: string
  status: 'completed' | 'active' | 'pending'
}

interface UpdateProgress {
  message?: string
  progress?: number
  status?: string
  error?: string
}

export interface UpdateProgressBannersProps {
  isUpdating: boolean
  updateProgress: UpdateProgress | null | undefined
  countdown: number
  stepHistory: ProgressEntry[]
  canCancel: boolean
  cancelState: string
  cancelError: string | null | undefined
  dismissProgress: () => void
  handleCancelUpdate: () => void
  handleRefreshToLoad: () => void
}

export function UpdateProgressBanners({
  isUpdating,
  updateProgress,
  countdown,
  stepHistory,
  canCancel,
  cancelState,
  cancelError,
  dismissProgress,
  handleCancelUpdate,
  handleRefreshToLoad,
}: UpdateProgressBannersProps) {
  const { t } = useTranslation()

  return (
    <>
      {isUpdating && (
        <div data-testid="update-progress-banner" className="mb-4 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
          <div className="flex items-center gap-3 mb-3">
            <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
            <p data-testid="update-progress-message" className="text-sm font-medium text-blue-400 flex-1 min-w-0">
              {updateProgress?.message ?? t('settings.updates.startingUpdate')}
            </p>
          </div>

          {stepHistory.length > 0 && (
            <div className="space-y-1.5 mb-3 pl-1">
              {stepHistory.map((entry) => (
                <div key={entry.step} className="flex items-center gap-2">
                  {entry.status === 'completed' ? (
                    <Check className="w-3.5 h-3.5 text-green-400 shrink-0" />
                  ) : entry.status === 'active' ? (
                    <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin shrink-0" />
                  ) : (
                    <div className="w-3.5 h-3.5 rounded-full border border-muted-foreground/30 shrink-0" />
                  )}
                  <span className={`text-xs ${
                    entry.status === 'completed'
                      ? 'text-green-400/80'
                      : entry.status === 'active'
                        ? 'text-blue-400'
                        : 'text-muted-foreground/40'
                  }`}>
                    {entry.message}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="w-full bg-secondary rounded-full h-2">
            <div
              data-testid="update-progress-bar"
              className="bg-blue-500 h-2 rounded-full transition-all duration-500"
              style={{ width: `${updateProgress?.progress ?? INITIAL_PROGRESS_PCT}%` }}
            />
          </div>
          <div className="flex items-center justify-between mt-2">
            <p className="text-xs text-blue-400/60">{t('settings.updates.doNotNavigate')}</p>
            <p data-testid="update-countdown" className="text-xs text-blue-400/60 tabular-nums">
              {countdown > 0
                ? t('settings.updates.estimatedRemaining', { seconds: countdown })
                : t('settings.updates.almostDone')}
            </p>
          </div>

          <div className="mt-3 pt-3 border-t border-blue-500/20 flex items-center justify-between gap-3">
            <p className="text-xs text-blue-400/60 flex-1 min-w-0">
              {canCancel ? t('settings.updates.cancelHint') : t('settings.updates.cancelUnavailable')}
            </p>
            <button
              data-testid="update-cancel-button"
              type="button"
              onClick={handleCancelUpdate}
              disabled={!canCancel || cancelState === 'pending'}
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 border border-red-500/40 text-xs font-medium hover:bg-red-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {cancelState === 'pending' ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  {t('settings.updates.cancelling')}
                </>
              ) : (
                <>
                  <X className="w-3.5 h-3.5" />
                  {t('settings.updates.cancelUpdate')}
                </>
              )}
            </button>
          </div>
          {cancelState === 'error' && cancelError && (
            <div className="mt-2 p-2 rounded-md bg-red-500/10 border border-red-500/20">
              <p className="text-xs text-red-400">{cancelError}</p>
            </div>
          )}
        </div>
      )}

      {updateProgress?.status === 'cancelled' && (
        <div data-testid="update-cancelled-banner" className="mb-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0" />
              <div>
                <p className="text-sm text-yellow-400">{updateProgress.message}</p>
                <p className="text-xs text-yellow-400/70 mt-1">{t('settings.updates.cancelledHint')}</p>
              </div>
            </div>
            <button
              data-testid="update-cancelled-dismiss"
              onClick={dismissProgress}
              aria-label={t('actions.dismiss')}
              className="text-yellow-400/60 hover:text-yellow-400 shrink-0 ml-2"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {updateProgress?.status === 'done' && (
        <div data-testid="update-done-banner" className="mb-4 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-green-400" />
              <div>
                <p className="text-sm text-green-400">{updateProgress.message}</p>
                <button
                  data-testid="update-refresh-button"
                  onClick={handleRefreshToLoad}
                  className="text-xs text-green-400/80 hover:text-green-300 underline underline-offset-2 mt-1"
                >
                  {t('settings.updates.refreshToLoad')}
                </button>
              </div>
            </div>
            <button
              data-testid="update-done-dismiss"
              onClick={dismissProgress}
              disabled={isUpdating}
              aria-label={t('actions.dismiss')}
              className="text-green-400/60 hover:text-green-400 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {updateProgress?.status === 'failed' && (
        <div data-testid="update-failed-banner" className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <div>
                <p className="text-sm text-red-400">{updateProgress.message}</p>
                {updateProgress.error && (
                  <p data-testid="update-failed-error" className="text-xs text-red-400/70 mt-1">{updateProgress.error}</p>
                )}
              </div>
            </div>
            <button
              data-testid="update-failed-dismiss"
              onClick={dismissProgress}
              disabled={isUpdating}
              aria-label={t('actions.dismiss')}
              className="text-red-400/60 hover:text-red-400 shrink-0 ml-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </>
  )
}
