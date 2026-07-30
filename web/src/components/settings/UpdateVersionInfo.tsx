import { useTranslation } from 'react-i18next'

interface LatestRelease {
  tag: string
  url: string
  releaseNotes?: string
}

interface AutoUpdateStatus {
  hasUncommittedChanges?: boolean
}

export interface UpdateVersionInfoProps {
  currentVersion: string
  commitHash: string
  hasUpdate: boolean
  error: string | null | undefined
  isDeveloperChannel: boolean
  isChecking: boolean
  isUpdating: boolean
  latestRelease: LatestRelease | null | undefined
  autoUpdateStatus: AutoUpdateStatus | null | undefined
  latestMainSHA: string | null | undefined
  shasMatch: boolean
  shortSHA: (sha: string | null | undefined) => string
  currentSHA: string | null | undefined
  latestSHA: string | null | undefined
  formatLastChecked: () => string
  agentConnected: boolean
}

export function UpdateVersionInfo({
  currentVersion,
  commitHash,
  hasUpdate,
  error,
  isDeveloperChannel,
  isChecking,
  isUpdating,
  latestRelease,
  autoUpdateStatus,
  latestMainSHA,
  shasMatch,
  shortSHA,
  currentSHA,
  latestSHA,
  formatLastChecked,
  agentConnected,
}: UpdateVersionInfoProps) {
  const { t } = useTranslation()

  return (
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
  )
}
