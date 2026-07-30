import {
  GitBranch,
  ChevronDown,
  ChevronUp,
  Info,
  Store,
  Check,
  Terminal,
  Bot,
  Shield,
  HardDrive,
  Zap,
  GitCommitHorizontal,
  Ship,
  AlertTriangle,
  Loader2,
  Download,
} from 'lucide-react'
import { type UpdateSettingsState } from './useUpdateSettingsState'
import { useDropdownKeyNav } from '../../hooks/useDropdownKeyNav'
import { UpdatePrereqRow } from './UpdatePrereqRow'

interface FieldProps {
  state: UpdateSettingsState
}

/** Scope-info toggle + channel dropdown */
export function UpdateChannelSection({ state }: FieldProps) {
  const {
    t,
    channel,
    scopeInfo,
    channelDropdown,
    visibleChannels,
    isDeveloperChannel,
    handleSelectChannel,
  } = state

  const channelDropdownKeyNav = useDropdownKeyNav(channelDropdown.close)

  return (
    <>
      <div className="mb-4">
        <button
          onClick={scopeInfo.toggle}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <Info className="w-4 h-4" />
          <span>{t('settings.updates.scopeInfoToggle')}</span>
          {scopeInfo.isOpen ? (
            <ChevronUp className="w-3 h-3" />
          ) : (
            <ChevronDown className="w-3 h-3" />
          )}
        </button>
        {scopeInfo.isOpen && (
          <div className="mt-3 rounded-lg bg-secondary/50 border border-border p-4 space-y-3 text-sm">
            <div>
              <span className="font-medium text-foreground">
                {t('settings.updates.scopeSystemTitle')}
              </span>
              <span className="text-muted-foreground">
                {' '}— {t('settings.updates.scopeSystemDesc')}
              </span>
            </div>
            <div>
              <span className="font-medium text-foreground">
                {t('settings.updates.scopeReloadTitle')}
              </span>
              <span className="text-muted-foreground">
                {' '}— {t('settings.updates.scopeReloadDesc')}
              </span>
            </div>
            <div>
              <span className="font-medium text-foreground">
                {t('settings.updates.scopeCardDataTitle')}
              </span>
              <span className="text-muted-foreground">
                {' '}— {t('settings.updates.scopeCardDataDesc')}
              </span>
            </div>
            <div className="flex items-start gap-2 pt-2 border-t border-border">
              <Store className="w-4 h-4 mt-0.5 text-purple-400 shrink-0" />
              <div>
                <span className="font-medium text-foreground">
                  {t('settings.updates.scopeMarketplaceTitle')}
                </span>
                <span className="text-muted-foreground">
                  {' '}— {t('settings.updates.scopeMarketplaceDesc')}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="mb-4">
        <label
          id="updates-channel-label"
          className="block text-sm text-muted-foreground mb-2"
        >
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
              {(visibleChannels || []).find((option) => option.value === channel)?.label}
            </span>
            <ChevronDown
              className={`w-4 h-4 transition-transform ${channelDropdown.isOpen ? 'rotate-180' : ''}`}
            />
          </button>
          {channelDropdown.isOpen && (
            <div
              role="listbox"
              aria-labelledby="updates-channel-label"
              onKeyDown={channelDropdownKeyNav}
              className="absolute z-dropdown mt-2 w-full rounded-lg bg-card border border-border shadow-xl"
            >
              {(visibleChannels || []).map((option) => (
                <button
                  key={option.value}
                  onClick={() => handleSelectChannel(option.value)}
                  className={`w-full flex items-center justify-between px-4 py-3 hover:bg-secondary/50 transition-colors first:rounded-t-lg last:rounded-b-lg ${channel === option.value ? 'bg-primary/10' : ''}`}
                >
                  <div className="text-left">
                    <p
                      className={`text-sm flex items-center gap-2 ${channel === option.value ? 'text-primary font-medium' : 'text-foreground'}`}
                    >
                      {option.value === 'developer' && (
                        <GitBranch className="w-3.5 h-3.5 text-orange-400" />
                      )}
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
    </>
  )
}

/** Prereqs collapsible + auto-update toggle (developer channel only) */
export function UpdateDevChannelDetails({ state }: FieldProps) {
  const {
    t,
    agentConnected,
    hasCodingAgent,
    oauthConfigured,
    installMethod,
    isDeveloperChannel,
    isHelmInstall,
    autoUpdateEnabled,
    autoUpdateStatus,
    prereqs,
    handleOpenAgentSettings,
    handleToggleAutoUpdate,
  } = state

  const prereqChecks = [
    agentConnected,
    hasCodingAgent,
    oauthConfigured,
    installMethod === 'dev',
  ]
  const failCount = prereqChecks.filter((check) => !check).length

  return (
    <>
      {isDeveloperChannel && (
        <div className="mb-4 rounded-lg bg-secondary/30 border border-border overflow-hidden">
          <button
            onClick={prereqs.toggle}
            className="w-full flex items-center justify-between px-4 py-3 text-sm hover:bg-secondary/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="font-medium text-foreground">
                {t('settings.updates.environment')}
              </span>
              <span
                className={`text-xs ${failCount === 0 ? 'text-green-400' : 'text-yellow-400'}`}
              >
                {failCount === 0
                  ? t('settings.updates.allPrereqsMet')
                  : t('settings.updates.prereqsMissing', { count: failCount })}
              </span>
            </div>
            {prereqs.isOpen ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            )}
          </button>
          {prereqs.isOpen && (
            <div className="px-4 pb-4 space-y-2 border-t border-border pt-3">
              <UpdatePrereqRow
                ok={agentConnected}
                label={t('settings.updates.prereqKCAgent')}
                okText={t('settings.updates.prereqKCAgentOk')}
                failText={t('settings.updates.prereqKCAgentFail')}
                fixText={t('settings.updates.prereqKCAgentFix')}
                onFix={handleOpenAgentSettings}
                icon={<Terminal className="w-3.5 h-3.5" />}
              />
              <UpdatePrereqRow
                ok={hasCodingAgent}
                label={t('settings.updates.prereqCodingAgent')}
                okText={t('settings.updates.prereqCodingAgentOk')}
                failText={t('settings.updates.prereqCodingAgentFail')}
                fixText={t('settings.updates.prereqCodingAgentFix')}
                onFix={handleOpenAgentSettings}
                icon={<Bot className="w-3.5 h-3.5" />}
              />
              <UpdatePrereqRow
                ok={oauthConfigured}
                label={t('settings.updates.prereqOAuth')}
                okText={t('settings.updates.prereqOAuthOk')}
                failText={t('settings.updates.prereqOAuthFail')}
                icon={<Shield className="w-3.5 h-3.5" />}
              />
              <UpdatePrereqRow
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
              <Zap
                className={`w-4 h-4 ${autoUpdateEnabled ? 'text-yellow-400' : 'text-muted-foreground'}`}
              />
              <div>
                <p className="text-sm font-medium text-foreground">
                  {t('settings.updates.autoUpdate')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('settings.updates.autoUpdateDesc')}
                </p>
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
          {autoUpdateEnabled &&
            isDeveloperChannel &&
            autoUpdateStatus?.hasUncommittedChanges && (
              <div className="mt-3 flex items-center gap-2 p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <GitCommitHorizontal className="w-4 h-4 text-blue-400 shrink-0" />
                <p className="text-xs text-blue-400">
                  {t('settings.updates.uncommittedAutoStash')}
                </p>
              </div>
            )}
        </div>
      )}
    </>
  )
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
