import { createContext, use, useMemo, type ReactNode } from 'react'
import { useVersionCheckCore } from './version/useVersionCheckCore'

export {
  parseReleaseTag,
  parseRelease,
  getLatestForChannel,
  isDevVersion,
  isNewerVersion,
} from './versionUtils'

type VersionCheckValue = ReturnType<typeof useVersionCheckCore>

const VersionCheckContext = createContext<VersionCheckValue | null>(null)

export function VersionCheckProvider({ children }: { children: ReactNode }) {
  const value = useVersionCheckCore()

  const memoized = useMemo(() => value, [
    value.currentVersion,
    value.commitHash,
    value.channel,
    value.latestRelease,
    value.hasUpdate,
    value.isChecking,
    value.error,
    value.lastChecked,
    value.skippedVersions,
    value.releases,
    value.lastCheckResult,
    value.autoUpdateEnabled,
    value.installMethod,
    value.autoUpdateStatus,
    value.updateProgress,
    value.agentConnected,
    value.hasCodingAgent,
    value.latestMainSHA,
    value.recentCommits,
    value.setChannel,
    value.checkForUpdates,
    value.forceCheck,
    value.skipVersion,
    value.clearSkippedVersions,
    value.setAutoUpdateEnabled,
    value.triggerUpdate,
    value.cancelUpdate,
    value.setUpdateProgress,
    value.clearLastCheckResult,
  ])

  return <VersionCheckContext.Provider value={memoized}>{children}</VersionCheckContext.Provider>
}

export function useVersionCheck(): VersionCheckValue {
  const ctx = use(VersionCheckContext)
  if (!ctx) {
    throw new Error('useVersionCheck must be used within a <VersionCheckProvider>')
  }
  return ctx
}
