import { Check, Terminal, Ship, AlertTriangle, Loader2, Download } from 'lucide-react'
import { type UpdateSettingsState } from './useUpdateSettingsState'

interface FieldProps {
  state: UpdateSettingsState
}

/** Install method banners + check result banners */
export function UpdateInstallBanners({ state }: FieldProps) {
  const {
    t,
    agentConnected,
    isHelmInstall,
    selfUpgradeAvailable,
    installMethod,
    isDeveloperChannel,
    currentVersion,
    isChecking,
    isVisuallySpinning,
    hasUpdate,
    error,
    lastCheckResult,
  } = state

  return (
    <>
      {!agentConnected && !isHelmInstall && (
        <div className="mb-4 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-blue-400 shrink-0" />
            <div>
              <p className="text-sm font-medium text-blue-400">
                {t('settings.updates.agentRequired')}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {t('settings.updates.agentRequiredDesc')}
              </p>
            </div>
          </div>
        </div>
      )}

      {isHelmInstall && !selfUpgradeAvailable && (
        <div className="mb-4 p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
          <div className="flex items-center gap-2">
            <Ship className="w-4 h-4 text-purple-400 shrink-0" />
            <div>
              <p className="text-sm font-medium text-purple-400">
                {t('settings.updates.helmDisabled')}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {t('settings.updates.helmDisabledDesc')}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {t('settings.updates.helmSelfUpgradeHint')}
              </p>
            </div>
          </div>
        </div>
      )}

      {isHelmInstall && selfUpgradeAvailable && (
        <div className="mb-4 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
          <div className="flex items-center gap-2">
            <Ship className="w-4 h-4 text-green-400 shrink-0" />
            <div>
              <p className="text-sm font-medium text-green-400">
                {t('settings.updates.helmSelfUpgradeReady')}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {t('settings.updates.helmSelfUpgradeDesc')}
              </p>
            </div>
          </div>
        </div>
      )}

      {installMethod === 'dev' &&
        !isDeveloperChannel &&
        !currentVersion.includes('nightly') &&
        !currentVersion.includes('weekly') &&
        currentVersion !== 'unknown' && (
          <div className="p-3 rounded-lg mb-4 bg-yellow-500/10 border border-yellow-500/20">
            <p className="text-xs text-yellow-400">
              {t('settings.updates.devVersion', { envVar: 'VITE_APP_VERSION' })}
            </p>
          </div>
        )}

      {lastCheckResult === 'success' &&
        !isChecking &&
        !isVisuallySpinning &&
        !hasUpdate &&
        !error && (
          <div
            data-testid="check-complete-banner"
            className="mb-4 p-3 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center gap-2 animate-in fade-in"
          >
            <Check className="w-4 h-4 text-green-400 shrink-0" />
            <p className="text-sm text-green-400">{t('settings.updates.upToDate')}</p>
          </div>
        )}

      {lastCheckResult === 'error' &&
        !isChecking &&
        !isVisuallySpinning &&
        error && (
          <div
            data-testid="check-failed-banner"
            className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-2 animate-in fade-in"
          >
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-red-400 font-medium">
                {t('settings.updates.errorChecking')}
              </p>
              <p className="text-xs text-red-400/80 mt-1">{error}</p>
            </div>
          </div>
        )}
    </>
  )
}

/** Self-upgrade restart panel + helm upgrade button */
export function UpdateSelfUpgradePanel({ state }: FieldProps) {
  const {
    t,
    hasUpdate,
    isHelmInstall,
    selfUpgradeAvailable,
    isUpdating,
    isSelfUpgradeRestarting,
    selfUpgradeRestartComplete,
    selfUpgradeRestartError,
    selfUpgradeRestartElapsed,
    isSelfUpgrading,
    selfUpgradeError,
    latestRelease,
    handleTriggerSelfUpgrade,
    handleReloadWindow,
  } = state

  if (
    !isSelfUpgradeRestarting &&
    !selfUpgradeRestartComplete &&
    !selfUpgradeRestartError &&
    !(hasUpdate && isHelmInstall && selfUpgradeAvailable && !isUpdating)
  ) {
    return null
  }

  return (
    <>
      {(isSelfUpgradeRestarting || selfUpgradeRestartComplete || selfUpgradeRestartError) && (
        <div className="mb-4 p-4 rounded-lg border border-border bg-secondary/30">
          {isSelfUpgradeRestarting && (
            <div className="flex flex-col items-center gap-3 py-4">
              <Loader2 className="w-8 h-8 animate-spin text-green-400" />
              <p className="text-sm font-medium">{t('settings.updates.helmRestarting')}</p>
              <p className="text-xs text-muted-foreground">
                {t('settings.updates.helmRestartingDesc', {
                  seconds: selfUpgradeRestartElapsed,
                })}
              </p>
            </div>
          )}
          {selfUpgradeRestartComplete && (
            <div className="flex flex-col items-center gap-3 py-4">
              <Check className="w-8 h-8 text-green-400" />
              <p className="text-sm font-medium">
                {t('settings.updates.helmRestartComplete')}
              </p>
              <p className="text-xs text-muted-foreground">
                {t('settings.updates.helmRestartReloading')}
              </p>
            </div>
          )}
          {selfUpgradeRestartError && (
            <div className="flex flex-col items-center gap-3 py-4">
              <AlertTriangle className="w-8 h-8 text-red-400" />
              <p className="text-sm font-medium text-red-400">{selfUpgradeRestartError}</p>
              <button
                onClick={handleReloadWindow}
                className="mt-2 px-4 py-2 rounded-lg bg-secondary text-sm hover:bg-secondary/80 transition-colors"
              >
                {t('settings.updates.helmRestartRefresh')}
              </button>
            </div>
          )}
        </div>
      )}

      {hasUpdate &&
        isHelmInstall &&
        selfUpgradeAvailable &&
        !isUpdating &&
        !isSelfUpgradeRestarting &&
        !selfUpgradeRestartComplete &&
        latestRelease && (
          <div className="mb-4">
            <button
              onClick={handleTriggerSelfUpgrade}
              disabled={isSelfUpgrading}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-green-500 text-white text-sm font-medium hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSelfUpgrading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              {isSelfUpgrading
                ? t('settings.updates.upgrading')
                : t('settings.updates.helmUpgradeNow', { tag: latestRelease.tag })}
            </button>
            <p className="text-xs text-muted-foreground mt-2">
              {t('settings.updates.helmUpgradeWarning')}
            </p>
            {selfUpgradeError && (
              <div className="mt-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                  <p className="text-sm text-red-400">{selfUpgradeError}</p>
                </div>
              </div>
            )}
          </div>
        )}
    </>
  )
}
