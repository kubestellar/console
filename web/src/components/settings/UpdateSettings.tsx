import { useState, useEffect } from 'react'
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
} from 'lucide-react'
import { useVersionCheck } from '../../hooks/useVersionCheck'
import type { UpdateChannel } from '../../types/updates'

export function UpdateSettings() {
  const { t } = useTranslation()
  const {
    currentVersion,
    commitHash,
    channel,
    setChannel,
    latestRelease,
    hasUpdate,
    isChecking,
    error,
    lastChecked,
    forceCheck,
    autoUpdateEnabled,
    installMethod,
    autoUpdateStatus,
    updateProgress,
    agentConnected,
    setAutoUpdateEnabled,
    triggerUpdate,
  } = useVersionCheck()

  const CHANNEL_OPTIONS: { value: UpdateChannel; label: string; description: string; devOnly?: boolean }[] = [
    {
      value: 'stable',
      label: t('settings.updates.stable'),
      description: t('settings.updates.stableDesc'),
    },
    {
      value: 'unstable',
      label: t('settings.updates.unstable'),
      description: t('settings.updates.unstableDesc'),
    },
    {
      value: 'developer',
      label: t('settings.updates.developer'),
      description: t('settings.updates.developerDesc'),
      devOnly: true,
    },
  ]

  // Only show developer channel for dev installs
  const visibleChannels = CHANNEL_OPTIONS.filter(
    (o) => !o.devOnly || installMethod === 'dev'
  )

  const [showReleaseNotes, setShowReleaseNotes] = useState(false)
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null)
  const [channelDropdownOpen, setChannelDropdownOpen] = useState(false)

  // Check for updates on mount
  useEffect(() => {
    forceCheck()
  }, [forceCheck])

  const copyCommand = async (command: string, id: string) => {
    await navigator.clipboard.writeText(command)
    setCopiedCommand(id)
    setTimeout(() => setCopiedCommand(null), 2000)
  }

  const formatLastChecked = () => {
    if (!lastChecked) return t('settings.updates.never')
    const now = Date.now()
    const diff = now - lastChecked
    if (diff < 60000) return t('settings.updates.justNow')
    if (diff < 3600000) return t('settings.updates.minutesAgo', { count: Math.floor(diff / 60000) })
    if (diff < 86400000) return t('settings.updates.hoursAgo', { count: Math.floor(diff / 3600000) })
    return new Date(lastChecked).toLocaleDateString()
  }

  const shortSHA = (sha: string) => sha ? sha.slice(0, 7) : '—'

  const helmCommand = latestRelease
    ? `helm upgrade kc kubestellar-console/kubestellar-console --version ${latestRelease.tag.replace(/^v/, '')} -n kc`
    : 'helm upgrade kc kubestellar-console/kubestellar-console -n kc'

  const brewCommand = 'brew upgrade kubestellar/tap/kc-agent'

  const isDeveloperChannel = channel === 'developer'
  const isHelmInstall = installMethod === 'helm'
  const isUpdating = updateProgress && !['idle', 'done', 'failed'].includes(updateProgress.status)

  return (
    <div id="system-updates-settings" className="glass rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className={`p-2 rounded-lg ${hasUpdate ? 'bg-green-500/20' : 'bg-secondary'}`}
          >
            <Download
              className={`w-5 h-5 ${hasUpdate ? 'text-green-400' : 'text-muted-foreground'}`}
            />
          </div>
          <div>
            <h2 className="text-lg font-medium text-foreground">{t('settings.updates.title')}</h2>
            <p className="text-sm text-muted-foreground">
              {t('settings.updates.subtitle')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Install method badge */}
          {installMethod !== 'unknown' && (
            <span className="px-2 py-1 rounded-md text-xs font-medium bg-secondary text-muted-foreground">
              {installMethod === 'dev' ? t('settings.updates.devMode') :
               installMethod === 'binary' ? t('settings.updates.binaryMode') :
               t('settings.updates.helmMode')}
            </span>
          )}
          <button
            onClick={forceCheck}
            disabled={isChecking}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isChecking ? 'animate-spin' : ''}`} />
            {t('settings.updates.checkNow')}
          </button>
        </div>
      </div>

      {/* Channel Selector */}
      <div className="mb-4">
        <label className="block text-sm text-muted-foreground mb-2">
          {t('settings.updates.updateChannel')}
        </label>
        <div className="relative">
          <button
            onClick={() => setChannelDropdownOpen(!channelDropdownOpen)}
            className="w-full flex items-center justify-between px-4 py-3 rounded-lg bg-secondary border border-border text-foreground hover:bg-secondary/80 transition-colors"
          >
            <span className="flex items-center gap-2">
              {isDeveloperChannel && <GitBranch className="w-4 h-4 text-orange-400" />}
              {visibleChannels.find((o) => o.value === channel)?.label}
            </span>
            <ChevronDown
              className={`w-4 h-4 transition-transform ${channelDropdownOpen ? 'rotate-180' : ''}`}
            />
          </button>
          {channelDropdownOpen && (
            <div className="absolute z-50 mt-2 w-full rounded-lg bg-card border border-border shadow-xl">
              {visibleChannels.map((option) => (
                <button
                  key={option.value}
                  onClick={() => {
                    setChannel(option.value)
                    setChannelDropdownOpen(false)
                  }}
                  className={`w-full flex items-center justify-between px-4 py-3 hover:bg-secondary/50 transition-colors first:rounded-t-lg last:rounded-b-lg ${
                    channel === option.value ? 'bg-primary/10' : ''
                  }`}
                >
                  <div className="text-left">
                    <p
                      className={`text-sm flex items-center gap-2 ${channel === option.value ? 'text-primary font-medium' : 'text-foreground'}`}
                    >
                      {option.value === 'developer' && <GitBranch className="w-3.5 h-3.5 text-orange-400" />}
                      {option.label}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {option.description}
                    </p>
                  </div>
                  {channel === option.value && (
                    <Check className="w-4 h-4 text-primary" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Auto-Update Toggle */}
      {!isHelmInstall && agentConnected && (
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
              onClick={() => setAutoUpdateEnabled(!autoUpdateEnabled)}
              className={`relative w-12 h-6 rounded-full transition-colors ${
                autoUpdateEnabled ? 'bg-green-500' : 'bg-secondary'
              }`}
            >
              <div
                className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform ${
                  autoUpdateEnabled ? 'translate-x-6' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
          {autoUpdateEnabled && isDeveloperChannel && autoUpdateStatus?.hasUncommittedChanges && (
            <div className="mt-3 flex items-center gap-2 p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
              <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0" />
              <p className="text-xs text-yellow-400">{t('settings.updates.uncommittedWarning')}</p>
            </div>
          )}
        </div>
      )}

      {/* Agent Required Notice */}
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

      {/* Helm Install Notice */}
      {isHelmInstall && (
        <div className="mb-4 p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
          <div className="flex items-center gap-2">
            <Ship className="w-4 h-4 text-purple-400 shrink-0" />
            <div>
              <p className="text-sm font-medium text-purple-400">{t('settings.updates.helmDisabled')}</p>
              <p className="text-xs text-muted-foreground mt-1">{t('settings.updates.helmDisabledDesc')}</p>
            </div>
          </div>
        </div>
      )}

      {/* Dev Mode Warning */}
      {!isDeveloperChannel && !currentVersion.includes('nightly') && !currentVersion.includes('weekly') && currentVersion !== 'unknown' && (
        <div className="p-3 rounded-lg mb-4 bg-yellow-500/10 border border-yellow-500/20">
          <p className="text-xs text-yellow-400">
            {t('settings.updates.devVersion', { envVar: 'VITE_APP_VERSION' })}
          </p>
        </div>
      )}

      {/* Update Progress Banner */}
      {isUpdating && updateProgress && (
        <div className="mb-4 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
          <div className="flex items-center gap-3 mb-2">
            <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
            <p className="text-sm font-medium text-blue-400">{updateProgress.message}</p>
          </div>
          <div className="w-full bg-secondary rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-500"
              style={{ width: `${updateProgress.progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Update Complete/Failed */}
      {updateProgress?.status === 'done' && (
        <div className="mb-4 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-green-400" />
            <p className="text-sm text-green-400">{updateProgress.message}</p>
          </div>
        </div>
      )}
      {updateProgress?.status === 'failed' && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <div>
              <p className="text-sm text-red-400">{updateProgress.message}</p>
              {updateProgress.error && (
                <p className="text-xs text-red-400/70 mt-1">{updateProgress.error}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Version Status */}
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
              {commitHash !== 'unknown' && (
                <span className="text-muted-foreground"> ({commitHash.slice(0, 7)})</span>
              )}
            </span>
          </div>

          {/* Developer channel: show SHA info */}
          {isDeveloperChannel && autoUpdateStatus && (
            <>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">{t('settings.updates.currentSHA')}</span>
                <span className="text-sm font-mono text-foreground">
                  {shortSHA(autoUpdateStatus.currentSHA)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">{t('settings.updates.latestSHA')}</span>
                <span className="text-sm font-mono text-foreground">
                  {autoUpdateStatus.latestSHA ? shortSHA(autoUpdateStatus.latestSHA) : '—'}
                </span>
              </div>
            </>
          )}

          {/* Release channels: show tag info */}
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
        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      </div>

      {/* Update Now Button (when agent connected and update available) */}
      {hasUpdate && agentConnected && !isHelmInstall && !isUpdating && (
        <div className="mb-4">
          <button
            onClick={triggerUpdate}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-green-500 text-white text-sm font-medium hover:bg-green-600 transition-colors"
          >
            <Download className="w-4 h-4" />
            {t('settings.updates.updateNow')}
          </button>
        </div>
      )}

      {/* Release Notes */}
      {latestRelease && latestRelease.releaseNotes && (
        <div className="mb-4">
          <button
            onClick={() => setShowReleaseNotes(!showReleaseNotes)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            {showReleaseNotes ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
            {t('settings.updates.releaseNotes')}
          </button>
          {showReleaseNotes && (
            <div className="mt-2 p-4 rounded-lg bg-secondary/30 border border-border">
              <pre className="text-sm text-muted-foreground whitespace-pre-wrap font-sans">
                {latestRelease.releaseNotes}
              </pre>
              <a
                href={latestRelease.url}
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

      {/* Manual Update Instructions (shown when no agent or as fallback) */}
      {hasUpdate && (!agentConnected || !autoUpdateEnabled) && (
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-foreground">{t('settings.updates.howToUpdate')}</h3>

          {/* Web Console */}
          <div className="p-4 rounded-lg bg-secondary/30 border border-border">
            <div className="flex items-center gap-2 mb-2">
              <Globe className="w-4 h-4 text-blue-400" />
              <span className="text-sm font-medium text-foreground">{t('settings.updates.webConsole')}</span>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              {t('settings.updates.webConsoleDesc')}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-500 text-white text-sm hover:bg-blue-600"
            >
              <RefreshCw className="w-4 h-4" />
              {t('settings.updates.refreshBrowser')}
            </button>
          </div>

          {/* Local Agent */}
          <div className="p-4 rounded-lg bg-secondary/30 border border-border">
            <div className="flex items-center gap-2 mb-2">
              <Terminal className="w-4 h-4 text-green-400" />
              <span className="text-sm font-medium text-foreground">{t('settings.updates.localAgentUpdate')}</span>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              {t('settings.updates.localAgentDesc')}
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 rounded-lg bg-secondary font-mono text-xs select-all overflow-x-auto">
                {brewCommand}
              </code>
              <button
                onClick={() => copyCommand(brewCommand, 'brew')}
                className="shrink-0 flex items-center gap-1 px-3 py-2 rounded-lg bg-green-500 text-white text-sm hover:bg-green-600"
              >
                <Copy className="w-4 h-4" />
                {copiedCommand === 'brew' ? t('settings.updates.copied') : t('settings.updates.copy')}
              </button>
            </div>
          </div>

          {/* Cluster Deployment */}
          <div className="p-4 rounded-lg bg-secondary/30 border border-border">
            <div className="flex items-center gap-2 mb-2">
              <Ship className="w-4 h-4 text-purple-400" />
              <span className="text-sm font-medium text-foreground">
                {t('settings.updates.clusterDeployment')}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              {t('settings.updates.clusterDeploymentDesc')}
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 rounded-lg bg-secondary font-mono text-xs select-all overflow-x-auto">
                {helmCommand}
              </code>
              <button
                onClick={() => copyCommand(helmCommand, 'helm')}
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
