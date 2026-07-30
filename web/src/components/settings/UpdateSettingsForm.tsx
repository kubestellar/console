import {
  Download,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react'
import { Button } from '../ui/Button'
import { type UpdateSettingsState } from './useUpdateSettingsState'
import { UpdateProgressBanners } from './UpdateProgressBanners'
import { UpdateVersionInfo } from './UpdateVersionInfo'
import { UpdateCommitList } from './UpdateCommitList'
import { UpdateReleaseNotes } from './UpdateReleaseNotes'
import { UpdateHowToSection } from './UpdateHowToSection'
import {
  UpdateChannelSection,
  UpdateDevChannelDetails,
  UpdateInstallBanners,
  UpdateSelfUpgradePanel,
} from './UpdateSettingsForm.fields'

interface UpdateSettingsFormProps {
  state: UpdateSettingsState
}

export function UpdateSettingsForm({ state }: UpdateSettingsFormProps) {
  const {
    t,
    currentVersion,
    commitHash,
    latestRelease,
    hasUpdate,
    isChecking,
    error,
    agentConnected,
    recentCommits,
    latestMainSHA,
    updateProgress,
    stepHistory,
    autoUpdateStatus,
    shasMatch,
    shortSHA,
    currentSHA,
    latestSHA,
    releaseNotes,
    copiedCommand,
    triggerState,
    triggerError,
    cancelState,
    cancelError,
    countdown,
    isVisuallySpinning,
    helmCommand,
    brewCommand,
    installMethod,
    isDeveloperChannel,
    isHelmInstall,
    isUpdating,
    canCancel,
    formatLastChecked,
    dismissProgress,
    handleCheckNow,
    handleTriggerUpdate,
    handleCopyCommand,
    handleCancelUpdate,
    handleRefreshToLoad,
    handleReloadWindow,
  } = state

  return (
    <div id="system-updates-settings" className="glass rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${hasUpdate ? 'bg-green-500/20' : 'bg-secondary'}`}>
            <Download
              className={`w-5 h-5 ${hasUpdate ? 'text-green-400' : 'text-muted-foreground'}`}
            />
          </div>
          <div>
            <h2 className="text-lg font-medium text-foreground">
              {t('settings.updates.title')}
            </h2>
            <p className="text-sm text-muted-foreground">{t('settings.updates.subtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {installMethod !== 'unknown' && (
            <span className="px-2 py-1 rounded-md text-xs font-medium bg-secondary text-muted-foreground">
              {installMethod === 'dev'
                ? t('settings.updates.devMode')
                : installMethod === 'binary'
                  ? t('settings.updates.binaryMode')
                  : t('settings.updates.helmMode')}
            </span>
          )}
          <Button
            variant="ghost"
            size="md"
            icon={
              <RefreshCw
                className={`w-4 h-4 ${isVisuallySpinning ? 'animate-spin-min text-blue-400' : ''}`}
              />
            }
            onClick={handleCheckNow}
            disabled={isChecking || isVisuallySpinning}
          >
            {t('settings.updates.checkNow')}
          </Button>
        </div>
      </div>

      <UpdateChannelSection state={state} />
      <UpdateDevChannelDetails state={state} />
      <UpdateInstallBanners state={state} />

      <UpdateProgressBanners
        isUpdating={isUpdating}
        updateProgress={updateProgress}
        countdown={countdown}
        stepHistory={stepHistory}
        canCancel={canCancel}
        cancelState={cancelState}
        cancelError={cancelError}
        dismissProgress={dismissProgress}
        handleCancelUpdate={handleCancelUpdate}
        handleRefreshToLoad={handleRefreshToLoad}
      />

      <UpdateVersionInfo
        currentVersion={currentVersion}
        commitHash={commitHash}
        hasUpdate={hasUpdate}
        error={error}
        isDeveloperChannel={isDeveloperChannel}
        isChecking={isChecking}
        isUpdating={isUpdating}
        latestRelease={latestRelease}
        autoUpdateStatus={autoUpdateStatus}
        latestMainSHA={latestMainSHA}
        shasMatch={shasMatch}
        shortSHA={shortSHA}
        currentSHA={currentSHA}
        latestSHA={latestSHA}
        formatLastChecked={formatLastChecked}
        agentConnected={agentConnected}
      />

      {isDeveloperChannel && (recentCommits || []).length > 0 && !isUpdating && (
        <UpdateCommitList commits={recentCommits} />
      )}

      {hasUpdate && agentConnected && !isHelmInstall && !isUpdating && (
        <div className="mb-4">
          <button
            onClick={handleTriggerUpdate}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-green-500 text-white text-sm font-medium hover:bg-green-600 transition-colors"
          >
            <Download className="w-4 h-4" />
            {t('settings.updates.updateNow')}
          </button>
          {triggerState === 'error' && triggerError && (
            <div className="mt-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                <p className="text-sm text-red-400">{triggerError}</p>
              </div>
            </div>
          )}
        </div>
      )}

      <UpdateSelfUpgradePanel state={state} />

      {latestRelease && (
        <UpdateReleaseNotes
          latestRelease={latestRelease}
          releaseNotes={releaseNotes}
        />
      )}

      <UpdateHowToSection
        isDeveloperChannel={isDeveloperChannel}
        hasUpdate={hasUpdate}
        agentConnected={agentConnected}
        autoUpdateEnabled={state.autoUpdateEnabled}
        isHelmInstall={isHelmInstall}
        brewCommand={brewCommand}
        helmCommand={helmCommand}
        copiedCommand={copiedCommand}
        handleCopyCommand={handleCopyCommand}
        handleReloadWindow={handleReloadWindow}
      />
    </div>
  )
}
