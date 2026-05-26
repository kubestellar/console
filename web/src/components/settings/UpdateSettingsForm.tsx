/* eslint-disable max-lines -- TODO: split this file (tracked by #15790) */
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Download,
  RefreshCw,
  Check,
  Copy,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Globe,
  Terminal,
  Ship,
  AlertTriangle,
  Zap,
  GitBranch,
  Loader2,
  GitPullRequestArrow,
  Bot,
  X,
  Shield,
  HardDrive,
  GitCommitHorizontal,
  Info,
  Store,
} from 'lucide-react'
import { Button } from '../ui/Button'
import { sanitizeUrl } from '../../lib/utils/sanitizeUrl'
import { MS_PER_MINUTE, MS_PER_HOUR, MS_PER_DAY } from '../../lib/constants/time'
import { INITIAL_PROGRESS_PCT, type UpdateSettingsState } from './useUpdateSettingsState'

interface UpdateSettingsFormProps {
  state: UpdateSettingsState
}

export function UpdateSettingsForm({ state }: UpdateSettingsFormProps) {
  const {
    t,
    currentVersion,
    commitHash,
    channel,
    latestRelease,
    hasUpdate,
    isChecking,
    error,
    lastCheckResult,
    autoUpdateEnabled,
    autoUpdateStatus,
    agentConnected,
    hasCodingAgent,
    recentCommits,
    latestMainSHA,
    updateProgress,
    stepHistory,
    selfUpgradeAvailable,
    isSelfUpgrading,
    selfUpgradeError,
    isSelfUpgradeRestarting,
    selfUpgradeRestartComplete,
    selfUpgradeRestartError,
    selfUpgradeRestartElapsed,
    visibleChannels,
    releaseNotes,
    prereqs,
    scopeInfo,
    channelDropdown,
    copiedCommand,
    triggerState,
    triggerError,
    cancelState,
    cancelError,
    countdown,
    isVisuallySpinning,
    oauthConfigured,
    helmCommand,
    brewCommand,
    installMethod,
    isDeveloperChannel,
    isHelmInstall,
    isUpdating,
    canCancel,
    currentSHA,
    latestSHA,
    shasMatch,
    formatLastChecked,
    shortSHA,
    dismissProgress,
    handleCheckNow,
    handleSelectChannel,
    handleToggleAutoUpdate,
    handleCopyCommand,
    handleCancelUpdate,
    handleTriggerUpdate,
    handleTriggerSelfUpgrade,
    handleRefreshToLoad,
    handleReloadWindow,
    handleOpenAgentSettings,
  } = state

  const prereqChecks = [
    agentConnected,
    hasCodingAgent,
    oauthConfigured,
    installMethod === 'dev',
  ]
  const failCount = prereqChecks.filter((check) => !check).length

  return (
    <div id="system-updates-settings" className="glass rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${hasUpdate ? 'bg-green-500/20' : 'bg-secondary'}`}>
            <Download className={`w-5 h-5 ${hasUpdate ? 'text-green-400' : 'text-muted-foreground'}`} />
          </div>
          <div>
            <h2 className="text-lg font-medium text-foreground">{t('settings.updates.title')}</h2>
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
            icon={<RefreshCw className={`w-4 h-4 ${isVisuallySpinning ? 'animate-spin-min text-blue-400' : ''}`} />}
            onClick={handleCheckNow}
            disabled={isChecking || isVisuallySpinning}
          >
            {t('settings.updates.checkNow')}
          </Button>
        </div>
      </div>

      <div className="mb-4">
        <button
          onClick={scopeInfo.toggle}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <Info className="w-4 h-4" />
          <span>{t('settings.updates.scopeInfoToggle')}</span>
          {scopeInfo.isOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
        {scopeInfo.isOpen && (
          <div className="mt-3 rounded-lg bg-secondary/50 border border-border p-4 space-y-3 text-sm">
            <div>
              <span className="font-medium text-foreground">{t('settings.updates.scopeSystemTitle')}</span>
              <span className="text-muted-foreground"> — {t('settings.updates.scopeSystemDesc')}</span>
            </div>
            <div>
              <span className="font-medium text-foreground">{t('settings.updates.scopeReloadTitle')}</span>
              <span className="text-muted-foreground"> — {t('settings.updates.scopeReloadDesc')}</span>
            </div>
            <div>
              <span className="font-medium text-foreground">{t('settings.updates.scopeCardDataTitle')}</span>
              <span className="text-muted-foreground"> — {t('settings.updates.scopeCardDataDesc')}</span>
            </div>
            <div className="flex items-start gap-2 pt-2 border-t border-border">
              <Store className="w-4 h-4 mt-0.5 text-purple-400 shrink-0" />
              <div>
                <span className="font-medium text-foreground">{t('settings.updates.scopeMarketplaceTitle')}</span>
                <span className="text-muted-foreground"> — {t('settings.updates.scopeMarketplaceDesc')}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="mb-4">
        <label id="updates-channel-label" className="block text-sm text-muted-foreground mb-2">
          {t('settings.updates.updateChannel')}
        </label>
        <div className="relative">
          <button
            onClick={channelDropdown.toggle}
            aria-haspopup="listbox"
            aria-expanded={channelDropdown.isOpen}
            aria-labelledby="updates-channel-label"
            className="w-full flex items-center justify-between px-4 py-3 rounded-lg bg-secondary border border-border text-foreground hover:bg-secondary/80 transition-colors"
          >
            <span className="flex items-center gap-2">
              {isDeveloperChannel && <GitBranch className="w-4 h-4 text-orange-400" />}
              {visibleChannels.find((option) => option.value === channel)?.label}
            </span>
            <ChevronDown className={`w-4 h-4 transition-transform ${channelDropdown.isOpen ? 'rotate-180' : ''}`} />
          </button>
          {channelDropdown.isOpen && (
            <div role="listbox" aria-labelledby="updates-channel-label" className="absolute z-dropdown mt-2 w-full rounded-lg bg-card border border-border shadow-xl">
              {visibleChannels.map((option) => (
                <button
                  key={option.value}
                  onClick={() => handleSelectChannel(option.value)}
                  className={`w-full flex items-center justify-between px-4 py-3 hover:bg-secondary/50 transition-colors first:rounded-t-lg last:rounded-b-lg ${channel === option.value ? 'bg-primary/10' : ''}`}
                >
                  <div className="text-left">
                    <p className={`text-sm flex items-center gap-2 ${channel === option.value ? 'text-primary font-medium' : 'text-foreground'}`}>
                      {option.value === 'developer' && <GitBranch className="w-3.5 h-3.5 text-orange-400" />}
                      {option.label}
                    </p>
                    <p className="text-xs text-muted-foreground">{option.description}</p>
                  </div>
                  {channel === option.value && <Check className="w-4 h-4 text-primary" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {isDeveloperChannel && (
        <div className="mb-4 rounded-lg bg-secondary/30 border border-border overflow-hidden">
          <button
            onClick={prereqs.toggle}
            className="w-full flex items-center justify-between px-4 py-3 text-sm hover:bg-secondary/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="font-medium text-foreground">{t('settings.updates.environment')}</span>
              <span className={`text-xs ${failCount === 0 ? 'text-green-400' : 'text-yellow-400'}`}>
                {failCount === 0
                  ? t('settings.updates.allPrereqsMet')
                  : t('settings.updates.prereqsMissing', { count: failCount })}
              </span>
            </div>
            {prereqs.isOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </button>
          {prereqs.isOpen && (
            <div className="px-4 pb-4 space-y-2 border-t border-border pt-3">
              <PrereqRow
                ok={agentConnected}
                label={t('settings.updates.prereqKCAgent')}
                okText={t('settings.updates.prereqKCAgentOk')}
                failText={t('settings.updates.prereqKCAgentFail')}
                fixText={t('settings.updates.prereqKCAgentFix')}
                onFix={handleOpenAgentSettings}
                icon={<Terminal className="w-3.5 h-3.5" />}
              />
              <PrereqRow
                ok={hasCodingAgent}
                label={t('settings.updates.prereqCodingAgent')}
                okText={t('settings.updates.prereqCodingAgentOk')}
                failText={t('settings.updates.prereqCodingAgentFail')}
                fixText={t('settings.updates.prereqCodingAgentFix')}
                onFix={handleOpenAgentSettings}
                icon={<Bot className="w-3.5 h-3.5" />}
              />
              <PrereqRow
                ok={oauthConfigured}
                label={t('settings.updates.prereqOAuth')}
                okText={t('settings.updates.prereqOAuthOk')}
                failText={t('settings.updates.prereqOAuthFail')}
                icon={<Shield className="w-3.5 h-3.5" />}
              />
              <PrereqRow
                ok={installMethod === 'dev'}
                label={t('settings.updates.prereqInstall')}
                okText={t('settings.updates.prereqInstallOk')}
                failText={t('settings.updates.prereqInstallFail')}
                icon={<HardDrive className="w-3.5 h-3.5" />}
              />
            </div>
          )}
        </div>
      )}

      {!isHelmInstall && agentConnected && hasCodingAgent && (
        <div className="mb-4 p-4 rounded-lg bg-secondary/30 border border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Zap className={`w-4 h-4 ${autoUpdateEnabled ? 'text-yellow-400' : 'text-muted-foreground'}`} />
              <div>
                <p className="text-sm font-medium text-foreground">{t('settings.updates.autoUpdate')}</p>
                <p className="text-xs text-muted-foreground">{t('settings.updates.autoUpdateDesc')}</p>
              </div>
            </div>
            <button
              onClick={handleToggleAutoUpdate}
              role="switch"
              aria-checked={autoUpdateEnabled}
              aria-label={t('settings.updates.autoUpdate')}
              className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                autoUpdateEnabled
                  ? 'bg-green-500 border-green-500'
                  : 'bg-transparent border-muted-foreground/40 hover:border-muted-foreground'
              }`}
            >
              {autoUpdateEnabled && <Check className="w-3.5 h-3.5 text-white" />}
            </button>
          </div>
          {autoUpdateEnabled && isDeveloperChannel && autoUpdateStatus?.hasUncommittedChanges && (
            <div className="mt-3 flex items-center gap-2 p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <GitCommitHorizontal className="w-4 h-4 text-blue-400 shrink-0" />
              <p className="text-xs text-blue-400">{t('settings.updates.uncommittedAutoStash')}</p>
            </div>
          )}
        </div>
      )}

      {!agentConnected && !isHelmInstall && (
        <div className="mb-4 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-blue-400 shrink-0" />
            <div>
              <p className="text-sm font-medium text-blue-400">{t('settings.updates.agentRequired')}</p>
              <p className="text-xs text-muted-foreground mt-1">{t('settings.updates.agentRequiredDesc')}</p>
            </div>
          </div>
        </div>
      )}

      {isHelmInstall && !selfUpgradeAvailable && (
        <div className="mb-4 p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
          <div className="flex items-center gap-2">
            <Ship className="w-4 h-4 text-purple-400 shrink-0" />
            <div>
              <p className="text-sm font-medium text-purple-400">{t('settings.updates.helmDisabled')}</p>
              <p className="text-xs text-muted-foreground mt-1">{t('settings.updates.helmDisabledDesc')}</p>
              <p className="text-xs text-muted-foreground mt-1">{t('settings.updates.helmSelfUpgradeHint')}</p>
            </div>
          </div>
        </div>
      )}
      {isHelmInstall && selfUpgradeAvailable && (
        <div className="mb-4 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
          <div className="flex items-center gap-2">
            <Ship className="w-4 h-4 text-green-400 shrink-0" />
            <div>
              <p className="text-sm font-medium text-green-400">{t('settings.updates.helmSelfUpgradeReady')}</p>
              <p className="text-xs text-muted-foreground mt-1">{t('settings.updates.helmSelfUpgradeDesc')}</p>
            </div>
          </div>
        </div>
      )}

      {installMethod === 'dev' && !isDeveloperChannel && !currentVersion.includes('nightly') && !currentVersion.includes('weekly') && currentVersion !== 'unknown' && (
        <div className="p-3 rounded-lg mb-4 bg-yellow-500/10 border border-yellow-500/20">
          <p className="text-xs text-yellow-400">{t('settings.updates.devVersion', { envVar: 'VITE_APP_VERSION' })}</p>
        </div>
      )}

      {lastCheckResult === 'success' && !isChecking && !isVisuallySpinning && !hasUpdate && !error && (
        <div data-testid="check-complete-banner" className="mb-4 p-3 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center gap-2 animate-in fade-in">
          <Check className="w-4 h-4 text-green-400 shrink-0" />
          <p className="text-sm text-green-400">{t('settings.updates.upToDate')}</p>
        </div>
      )}
      {lastCheckResult === 'error' && !isChecking && !isVisuallySpinning && error && (
        <div data-testid="check-failed-banner" className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-2 animate-in fade-in">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-red-400 font-medium">{t('settings.updates.errorChecking')}</p>
            <p className="text-xs text-red-400/80 mt-1">{error}</p>
          </div>
        </div>
      )}

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

      <div
        className={`p-4 rounded-lg mb-4 ${
          hasUpdate
            ? 'bg-green-500/10 border border-green-500/20'
            : error
              ? 'bg-red-500/10 border border-red-500/20'
              : 'bg-secondary/30 border border-border'
        }`}
      >
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">{t('settings.updates.currentVersion')}</span>
            <span className="text-sm font-mono text-foreground">
              {currentVersion}
              {commitHash !== 'unknown' && <span className="text-muted-foreground"> ({commitHash.slice(0, 7)})</span>}
            </span>
          </div>

          {isDeveloperChannel && (autoUpdateStatus || latestMainSHA) && (
            <>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">{t('settings.updates.currentSHA')}</span>
                <span className={`text-sm font-mono transition-colors duration-1000 ${shasMatch ? 'text-green-400 animate-pulse-once' : 'text-foreground'}`}>
                  {shortSHA(currentSHA)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">{t('settings.updates.latestSHA')}</span>
                <span className={`text-sm font-mono transition-colors duration-1000 ${shasMatch ? 'text-green-400 animate-pulse-once' : 'text-foreground'}`}>
                  {shortSHA(latestSHA)}
                </span>
              </div>
            </>
          )}

          {!isDeveloperChannel && (
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">{t('settings.updates.latestAvailable')}</span>
              <span className="text-sm font-mono text-foreground">
                {isChecking ? (
                  <span className="text-muted-foreground">{t('settings.updates.checking')}</span>
                ) : latestRelease ? (
                  latestRelease.tag
                ) : (
                  <span className="text-muted-foreground">{t('settings.updates.unknown')}</span>
                )}
              </span>
            </div>
          )}

          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">{t('settings.updates.status')}</span>
            <span
              className={`text-sm font-medium ${
                hasUpdate
                  ? 'text-green-400'
                  : error
                    ? 'text-red-400'
                    : 'text-muted-foreground'
              }`}
            >
              {error
                ? t('settings.updates.errorChecking')
                : hasUpdate
                  ? t('settings.updates.updateAvailable')
                  : t('settings.updates.upToDate')}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">{t('settings.updates.lastChecked')}</span>
            <span className="text-sm text-muted-foreground">{formatLastChecked()}</span>
          </div>
        </div>
        {error && !isUpdating && agentConnected && (
          <div className="mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
            <p className="text-sm text-red-400 font-medium">{t('settings.updates.errorChecking')}</p>
            <p className="text-xs text-red-400/80 mt-1">{error}</p>
            <p className="text-xs text-muted-foreground mt-2">{t('settings.updates.errorHint')}</p>
          </div>
        )}
      </div>

      {isDeveloperChannel && recentCommits.length > 0 && !isUpdating && <CommitList commits={recentCommits} />}

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

      {(isSelfUpgradeRestarting || selfUpgradeRestartComplete || selfUpgradeRestartError) && (
        <div className="mb-4 p-4 rounded-lg border border-border bg-secondary/30">
          {isSelfUpgradeRestarting && (
            <div className="flex flex-col items-center gap-3 py-4">
              <Loader2 className="w-8 h-8 animate-spin text-green-400" />
              <p className="text-sm font-medium">{t('settings.updates.helmRestarting')}</p>
              <p className="text-xs text-muted-foreground">
                {t('settings.updates.helmRestartingDesc', { seconds: selfUpgradeRestartElapsed })}
              </p>
            </div>
          )}
          {selfUpgradeRestartComplete && (
            <div className="flex flex-col items-center gap-3 py-4">
              <Check className="w-8 h-8 text-green-400" />
              <p className="text-sm font-medium">{t('settings.updates.helmRestartComplete')}</p>
              <p className="text-xs text-muted-foreground">{t('settings.updates.helmRestartReloading')}</p>
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

      {hasUpdate && isHelmInstall && selfUpgradeAvailable && !isUpdating && !isSelfUpgradeRestarting && !selfUpgradeRestartComplete && latestRelease && (
        <div className="mb-4">
          <button
            onClick={handleTriggerSelfUpgrade}
            disabled={isSelfUpgrading}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-green-500 text-white text-sm font-medium hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSelfUpgrading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {isSelfUpgrading
              ? t('settings.updates.upgrading')
              : t('settings.updates.helmUpgradeNow', { tag: latestRelease.tag })}
          </button>
          <p className="text-xs text-muted-foreground mt-2">{t('settings.updates.helmUpgradeWarning')}</p>
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

      {latestRelease && latestRelease.releaseNotes && (
        <div className="mb-4">
          <button
            onClick={releaseNotes.toggle}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            {releaseNotes.isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            {t('settings.updates.releaseNotes')}
          </button>
          {releaseNotes.isOpen && (
            <div className="mt-2 p-4 rounded-lg bg-secondary/30 border border-border">
              <pre className="text-sm text-muted-foreground whitespace-pre-wrap font-sans">{latestRelease.releaseNotes}</pre>
              <a
                href={sanitizeUrl(latestRelease.url)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-3 text-sm text-primary hover:underline"
              >
                {t('settings.updates.viewOnGithub')}
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}
        </div>
      )}

      {isDeveloperChannel && (
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-foreground">{t('settings.updates.howToUpdate')}</h3>

          <div className="p-4 rounded-lg bg-secondary/30 border border-border">
            <div className="flex items-center gap-2 mb-2">
              <GitPullRequestArrow className="w-4 h-4 text-orange-400" />
              <span className="text-sm font-medium text-foreground">{t('settings.updates.devSourceUpdate')}</span>
            </div>
            <p className="text-xs text-muted-foreground mb-3">{t('settings.updates.devMakeUpdateDesc')}</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 rounded-lg bg-secondary font-mono text-sm select-all">make update</code>
              <button
                onClick={() => handleCopyCommand('make update', 'makeupdate')}
                className="shrink-0 flex items-center gap-1 px-3 py-2 rounded-lg bg-orange-500 text-white text-sm hover:bg-orange-600"
              >
                <Copy className="w-4 h-4" />
                {copiedCommand === 'makeupdate' ? t('settings.updates.copied') : t('settings.updates.copy')}
              </button>
            </div>
          </div>

          <div className="p-4 rounded-lg bg-linear-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/20">
            <div className="flex items-center gap-2 mb-2">
              <Bot className="w-4 h-4 text-purple-400" />
              <span className="text-sm font-medium text-foreground">{t('settings.updates.devCodingAgent')}</span>
            </div>
            <p className="text-xs text-muted-foreground">{t('settings.updates.devCodingAgentDesc')}</p>
          </div>
        </div>
      )}

      {!isDeveloperChannel && hasUpdate && (!agentConnected || !autoUpdateEnabled) && (
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-foreground">{t('settings.updates.howToUpdate')}</h3>

          <div className="p-4 rounded-lg bg-secondary/30 border border-border">
            <div className="flex items-center gap-2 mb-2">
              <Globe className="w-4 h-4 text-blue-400" />
              <span className="text-sm font-medium text-foreground">{t('settings.updates.webConsole')}</span>
            </div>
            <p className="text-xs text-muted-foreground mb-3">{t('settings.updates.webConsoleDesc')}</p>
            <button
              onClick={handleReloadWindow}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-500 text-white text-sm hover:bg-blue-600"
            >
              <RefreshCw className="w-4 h-4" />
              {t('settings.updates.refreshBrowser')}
            </button>
          </div>

          <div className="p-4 rounded-lg bg-secondary/30 border border-border">
            <div className="flex items-center gap-2 mb-2">
              <Terminal className="w-4 h-4 text-green-400" />
              <span className="text-sm font-medium text-foreground">{t('settings.updates.localAgentUpdate')}</span>
            </div>
            <p className="text-xs text-muted-foreground mb-3">{t('settings.updates.localAgentDesc')}</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-secondary font-mono text-xs select-all overflow-x-auto">
                {brewCommand}
              </code>
              <button
                onClick={() => handleCopyCommand(brewCommand, 'brew')}
                className="shrink-0 flex items-center gap-1 px-3 py-2 rounded-lg bg-green-500 text-white text-sm hover:bg-green-600"
              >
                <Copy className="w-4 h-4" />
                {copiedCommand === 'brew' ? t('settings.updates.copied') : t('settings.updates.copy')}
              </button>
            </div>
          </div>

          <div className="p-4 rounded-lg bg-secondary/30 border border-border">
            <div className="flex items-center gap-2 mb-2">
              <Ship className="w-4 h-4 text-purple-400" />
              <span className="text-sm font-medium text-foreground">{t('settings.updates.clusterDeployment')}</span>
            </div>
            <p className="text-xs text-muted-foreground mb-3">{t('settings.updates.clusterDeploymentDesc')}</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-secondary font-mono text-xs select-all overflow-x-auto">
                {helmCommand}
              </code>
              <button
                onClick={() => handleCopyCommand(helmCommand, 'helm')}
                className="shrink-0 flex items-center gap-1 px-3 py-2 rounded-lg bg-purple-500 text-white text-sm hover:bg-purple-600"
              >
                <Copy className="w-4 h-4" />
                {copiedCommand === 'helm' ? t('settings.updates.copied') : t('settings.updates.copy')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function PrereqRow({
  ok,
  loading,
  label,
  okText,
  failText,
  fixText,
  onFix,
  icon,
}: {
  ok: boolean
  loading?: boolean
  label: string
  okText: string
  failText: string
  fixText?: string
  onFix?: () => void
  icon: ReactNode
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="flex items-center gap-1.5">
        {loading ? (
          <Loader2 className="w-3.5 h-3.5 text-muted-foreground animate-spin-min" />
        ) : ok ? (
          <>
            <Check className="w-3.5 h-3.5 text-green-400" />
            <span className="text-xs text-green-400">{okText}</span>
          </>
        ) : (
          <>
            <X className="w-3.5 h-3.5 text-red-400" />
            <span className="text-xs text-red-400">{failText}</span>
            {fixText && onFix && (
              <button
                onClick={onFix}
                className="text-xs text-blue-400 hover:text-blue-300 underline underline-offset-2 ml-1"
              >
                {fixText}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function CommitList({ commits }: { commits: Array<{ sha: string; message: string; author: string; date: string }> }) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="mb-4 rounded-lg bg-secondary/30 border border-border overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm hover:bg-secondary/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <GitCommitHorizontal className="w-4 h-4 text-orange-400" />
          <span className="font-medium text-foreground">
            {t('settings.updates.recentCommits', { count: commits.length })}
          </span>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>
      {expanded && (
        <div className="border-t border-border max-h-64 overflow-y-auto">
          {commits.map((commit) => {
            const prMatch = commit.message.match(/\(#(\d+)\)/)
            const url = prMatch
              ? `https://github.com/kubestellar/console/pull/${prMatch[1]}`
              : `https://github.com/kubestellar/console/commit/${commit.sha}`
            return (
              <a
                key={commit.sha}
                href={sanitizeUrl(url)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-3 px-4 py-2 border-b border-border/50 last:border-b-0 hover:bg-secondary/30 cursor-pointer no-underline"
              >
                <code className="text-xs font-mono text-orange-400 shrink-0 pt-0.5">{commit.sha.slice(0, 7)}</code>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-foreground truncate">{commit.message}</p>
                  <p className="text-xs text-muted-foreground">{commit.author} &middot; {formatCommitDate(commit.date)}</p>
                </div>
              </a>
            )
          })}
        </div>
      )}
    </div>
  )
}

function formatCommitDate(iso: string): string {
  const date = new Date(iso)
  const now = Date.now()
  const diff = now - date.getTime()
  const DAYS_PER_WEEK = 7
  const MS_PER_WEEK = MS_PER_DAY * DAYS_PER_WEEK
  if (diff < MS_PER_HOUR) return `${Math.floor(diff / MS_PER_MINUTE)}m ago`
  if (diff < MS_PER_DAY) return `${Math.floor(diff / MS_PER_HOUR)}h ago`
  if (diff < MS_PER_WEEK) return `${Math.floor(diff / MS_PER_DAY)}d ago`
  return date.toLocaleDateString()
}
