import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import type {
  UpdateChannel,
  ParsedRelease,
  InstallMethod,
  AutoUpdateStatus,
  UpdateProgress,
} from '../../types/updates'
import { UPDATE_STORAGE_KEYS } from '../../types/updates'
import { emitSessionContext } from '../../lib/analytics'
import { authFetch } from '../../lib/api'
import { useLocalAgent } from '../useLocalAgent'
import {
  AUTO_UPDATE_POLL_MS,
  DEV_SHA_CACHE_KEY,
  ERROR_DISPLAY_THRESHOLD,
  getLatestForChannel,
  HEALTH_FETCH_MAX_RETRIES,
  HEALTH_FETCH_RETRY_DELAY_MS,
  HEALTH_FETCH_TIMEOUT_MS,
  isDevVersion,
  isNewerVersion,
  loadCache,
  loadChannel,
  loadAutoUpdateEnabled,
  loadSkippedVersions,
  MIN_CHECK_INTERVAL_MS,
  parseRelease,
  safeJsonParse,
} from '../versionUtils'
import { usePersistedState } from './usePersistedState'
import {
  clearGithubRateLimitBackoff,
  fetchLatestMainSHA,
  fetchRecentCommits,
  fetchReleases,
  type CheckAttemptResult,
  type RecentCommit,
} from './useReleasesFetch'
import {
  cancelUpdate,
  fetchAutoUpdateStatus,
  syncAutoUpdateConfig,
  triggerUpdate,
} from './useAutoUpdate'

declare const __APP_VERSION__: string

declare const __COMMIT_HASH__: string

const VERSION_CHECK_CACHE_MAX_AGE_MS = MIN_CHECK_INTERVAL_MS

function deserializeChannel(raw: string): UpdateChannel {
  if (raw === 'stable' || raw === 'unstable' || raw === 'developer') {
    return raw
  }
  return loadChannel()
}

function deserializeLastChecked(raw: string): number | null {
  const parsed = parseInt(raw, 10)
  return Number.isFinite(parsed) ? parsed : null
}

function deserializeSkippedVersions(raw: string): string[] {
  const parsed = JSON.parse(raw) as unknown
  return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : []
}

export function useVersionCheckCore() {
  const [channel, setChannelState] = usePersistedState<UpdateChannel>(
    UPDATE_STORAGE_KEYS.CHANNEL,
    loadChannel,
    {
      deserialize: deserializeChannel,
      serialize: (value) => value,
    },
  )
  const [releases, setReleases] = useState<ParsedRelease[]>([])
  const [isChecking, setIsChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastChecked, setLastChecked] = usePersistedState<number | null>(
    UPDATE_STORAGE_KEYS.LAST_CHECK,
    null,
    {
      deserialize: deserializeLastChecked,
      serialize: (value) => String(value),
      removeWhen: (value) => value == null,
    },
  )
  const [skippedVersions, setSkippedVersions] = usePersistedState<string[]>(
    UPDATE_STORAGE_KEYS.SKIPPED_VERSIONS,
    loadSkippedVersions,
    {
      deserialize: deserializeSkippedVersions,
      serialize: (value) => JSON.stringify(value),
      removeWhen: (value) => value.length === 0,
    },
  )
  const [lastCheckResult, setLastCheckResult] = useState<'success' | 'error' | null>(null)
  const [autoUpdateEnabled, setAutoUpdateEnabledState] = usePersistedState<boolean>(
    UPDATE_STORAGE_KEYS.AUTO_UPDATE_ENABLED,
    loadAutoUpdateEnabled,
    {
      deserialize: (raw) => raw === 'true',
      serialize: (value) => String(value),
    },
  )
  const [installMethod, setInstallMethod] = useState<InstallMethod>(() =>
    typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
      ? 'dev'
      : 'unknown',
  )
  const [autoUpdateStatus, setAutoUpdateStatus] = useState<AutoUpdateStatus | null>(null)
  const [updateProgress, setUpdateProgress] = useState<UpdateProgress | null>(null)
  const [latestMainSHA, setLatestMainSHA] = useState<string | null>(null)
  const [recentCommits, setRecentCommits] = useState<RecentCommit[]>([])

  const consecutiveFailuresRef = useRef(0)
  const channelChangedRef = useRef(false)

  const { isConnected: agentConnected, health: agentHealth, refresh: refreshAgent } = useLocalAgent()
  const hasCodingAgent = agentHealth?.hasClaude ?? false
  const agentSupportsAutoUpdate = agentConnected && agentHealth?.install_method != null

  const currentVersion = useMemo(() => {
    try {
      return __APP_VERSION__ || 'unknown'
    } catch {
      return 'unknown'
    }
  }, [])

  const commitHash = useMemo(() => {
    try {
      return __COMMIT_HASH__ || 'unknown'
    } catch {
      return 'unknown'
    }
  }, [])

  const updateLastCheckedTimestamp = useCallback(() => {
    setLastChecked(Date.now())
  }, [setLastChecked])

  const clearFailures = useCallback(() => {
    consecutiveFailuresRef.current = 0
    setError(null)
  }, [])

  const registerFailure = useCallback((message: string, displayImmediately = false) => {
    consecutiveFailuresRef.current += 1
    if (displayImmediately || consecutiveFailuresRef.current >= ERROR_DISPLAY_THRESHOLD) {
      setError(message)
    }
  }, [])

  const runAutoUpdateStatusCheck = useCallback(async (): Promise<CheckAttemptResult> => {
    console.debug('[version-check] Fetching auto-update status from kc-agent...')
    const result = await fetchAutoUpdateStatus(agentSupportsAutoUpdate)

    if (result.success && result.data) {
      console.debug('[version-check] Auto-update status:', result.data)
      setAutoUpdateStatus(result.data)
      clearFailures()
      if (result.data.latestSHA) {
        setLatestMainSHA(result.data.latestSHA)
      }
      updateLastCheckedTimestamp()
      return { success: true }
    }

    const errorMessage = result.errorMessage ?? 'Could not reach kc-agent'
    console.debug('[version-check] Auto-update status failed:', errorMessage)
    registerFailure(errorMessage)
    return { success: false, errorMessage }
  }, [agentSupportsAutoUpdate, clearFailures, registerFailure, updateLastCheckedTimestamp])

  const runLatestMainSHACheck = useCallback(async (): Promise<CheckAttemptResult> => {
    console.debug('[version-check] Fetching latest main SHA from GitHub...')
    const result = await fetchLatestMainSHA()

    if (result.sha) {
      setLatestMainSHA(result.sha)
    }

    if (result.success) {
      if (result.sha) {
        console.debug('[version-check] Latest main SHA:', result.sha.slice(0, 7))
      }
      updateLastCheckedTimestamp()
      return { success: true }
    }

    if (result.rateLimited && result.errorMessage) {
      console.debug('[version-check] GitHub API rate-limited')
      setError(result.errorMessage)
    } else if (result.errorMessage) {
      console.debug('[version-check] Failed to fetch main SHA:', result.errorMessage)
    }

    return {
      success: false,
      errorMessage: result.errorMessage ?? 'Failed to check for updates',
    }
  }, [updateLastCheckedTimestamp])

  const runRecentCommitsCheck = useCallback(async () => {
    const commits = await fetchRecentCommits(commitHash, latestMainSHA)
    console.debug('[version-check] Fetched', commits.length, 'commits')
    setRecentCommits(commits)
  }, [commitHash, latestMainSHA])

  const runReleaseCheck = useCallback(async (force = false): Promise<CheckAttemptResult> => {
    const result = await fetchReleases(force)

    if (result.releases) {
      setReleases(result.releases)
    }

    if (result.success) {
      clearFailures()
      updateLastCheckedTimestamp()
      return { success: true }
    }

    const errorMessage = result.errorMessage ?? 'Failed to check for updates'
    registerFailure(errorMessage)
    return { success: false, errorMessage }
  }, [clearFailures, registerFailure, updateLastCheckedTimestamp])

  const setChannel = useCallback(async (newChannel: UpdateChannel) => {
    setChannelState(newChannel)
    channelChangedRef.current = true
    await syncAutoUpdateConfig(autoUpdateEnabled, newChannel)
  }, [autoUpdateEnabled, setChannelState])

  const setAutoUpdateEnabled = useCallback(async (enabled: boolean) => {
    setAutoUpdateEnabledState(enabled)
    await syncAutoUpdateConfig(enabled, channel)
  }, [channel, setAutoUpdateEnabledState])

  const checkForUpdates = useCallback(async (): Promise<void> => {
    if (channel === 'developer') {
      if (agentSupportsAutoUpdate) {
        await runAutoUpdateStatusCheck()
      } else {
        await runLatestMainSHACheck()
      }
      return
    }

    const cache = loadCache()
    if (cache) {
      setReleases(cache.data.map(parseRelease))
      if (Date.now() - cache.timestamp < VERSION_CHECK_CACHE_MAX_AGE_MS) {
        return
      }
    }

    if (lastChecked && Date.now() - lastChecked < VERSION_CHECK_CACHE_MAX_AGE_MS) {
      return
    }

    setIsChecking(true)
    try {
      await runReleaseCheck()
    } finally {
      setIsChecking(false)
    }
  }, [agentSupportsAutoUpdate, channel, lastChecked, runAutoUpdateStatusCheck, runLatestMainSHACheck, runReleaseCheck])

  const forceCheck = useCallback(async (): Promise<void> => {
    console.debug('[version-check] Force check — channel:', channel, 'agentSupportsAutoUpdate:', agentSupportsAutoUpdate)
    setIsChecking(true)
    setLastCheckResult(null)
    consecutiveFailuresRef.current = 0
    setError(null)
    refreshAgent()

    let checkResult: CheckAttemptResult = { success: false, errorMessage: 'Failed to check for updates' }

    try {
      if (channel === 'developer') {
        if (agentSupportsAutoUpdate) {
          console.debug('[version-check] Checking via kc-agent /auto-update/status')
          checkResult = await runAutoUpdateStatusCheck()
        } else {
          console.debug('[version-check] Checking via GitHub API (no agent auto-update support)')
          clearGithubRateLimitBackoff()
          checkResult = await runLatestMainSHACheck()
        }
      } else {
        checkResult = await runReleaseCheck(true)
      }
    } finally {
      setIsChecking(false)
      updateLastCheckedTimestamp()

      if (checkResult.success) {
        setLastCheckResult('success')
      } else {
        setLastCheckResult('error')
        setError(checkResult.errorMessage ?? 'Failed to check for updates')
      }
    }
  }, [agentSupportsAutoUpdate, channel, refreshAgent, runAutoUpdateStatusCheck, runLatestMainSHACheck, runReleaseCheck, updateLastCheckedTimestamp])

  const skipVersion = useCallback((version: string) => {
    setSkippedVersions((prev) => [...prev, version])
  }, [setSkippedVersions])

  const clearSkippedVersions = useCallback(() => {
    setSkippedVersions([])
  }, [setSkippedVersions])

  const latestRelease = getLatestForChannel(releases, channel)

  const hasUpdate = useMemo(() => {
    if (channel === 'developer') {
      if (autoUpdateStatus) {
        return autoUpdateStatus.hasUpdate
      }
      if (latestMainSHA && commitHash && commitHash !== 'unknown') {
        return !latestMainSHA.startsWith(commitHash) && !commitHash.startsWith(latestMainSHA)
      }
      return false
    }

    if (!latestRelease || currentVersion === 'unknown') return false
    if (skippedVersions.includes(latestRelease.tag)) return false

    if (installMethod === 'helm' && isDevVersion(currentVersion)) return true

    return isNewerVersion(currentVersion, latestRelease.tag, channel)
  }, [autoUpdateStatus, channel, commitHash, currentVersion, installMethod, latestMainSHA, latestRelease, skippedVersions])

  useEffect(() => {
    const cache = loadCache()
    if (cache) {
      setReleases(cache.data.map(parseRelease))
    }
  }, [])

  useEffect(() => {
    if (agentHealth?.install_method) {
      setInstallMethod(agentHealth.install_method as InstallMethod)
    }
  }, [agentHealth?.install_method])

  useEffect(() => {
    if (installMethod !== 'unknown') {
      emitSessionContext(installMethod, channel)
    }
  }, [installMethod, channel])

  useEffect(() => {
    if (channel === 'developer' && installMethod !== 'dev' && installMethod !== 'unknown') {
      console.debug('[version-check] Resetting channel from developer to stable — installMethod is', installMethod)
      void setChannel('stable')
    }
  }, [installMethod, channel, setChannel])

  useEffect(() => {
    let cancelled = false

    async function fetchBackendInstallMethod(attempt: number) {
      try {
        const response = await authFetch('/health', {
          signal: AbortSignal.timeout(HEALTH_FETCH_TIMEOUT_MS),
        })
        if (response.ok) {
          const data = await safeJsonParse<{ install_method?: string }>(response, 'Backend health')
          if (data.install_method && !cancelled) {
            setInstallMethod(data.install_method as InstallMethod)
            return
          }
        }
      } catch {
        // Backend not available.
      }

      if (attempt < HEALTH_FETCH_MAX_RETRIES && !cancelled) {
        setTimeout(() => {
          void fetchBackendInstallMethod(attempt + 1)
        }, HEALTH_FETCH_RETRY_DELAY_MS)
      }
    }

    void fetchBackendInstallMethod(0)
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (agentConnected && agentSupportsAutoUpdate) {
      void runAutoUpdateStatusCheck()
    }
  }, [agentConnected, agentSupportsAutoUpdate, channel, runAutoUpdateStatusCheck])

  useEffect(() => {
    if (!agentConnected || !agentSupportsAutoUpdate || !autoUpdateEnabled) return

    void runAutoUpdateStatusCheck()
    const id = setInterval(() => {
      void runAutoUpdateStatusCheck()
    }, AUTO_UPDATE_POLL_MS)
    return () => clearInterval(id)
  }, [agentConnected, agentSupportsAutoUpdate, autoUpdateEnabled, runAutoUpdateStatusCheck])

  useEffect(() => {
    if (channel === 'developer') return
    const id = setInterval(() => {
      void checkForUpdates()
    }, VERSION_CHECK_CACHE_MAX_AGE_MS)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel])

  useEffect(() => {
    if (channel === 'developer' && !agentSupportsAutoUpdate) {
      const cached = localStorage.getItem(DEV_SHA_CACHE_KEY)
      if (cached) {
        setLatestMainSHA(cached)
      }
      void runLatestMainSHACheck()
    }
  }, [channel, agentSupportsAutoUpdate, runLatestMainSHACheck])

  useEffect(() => {
    if (channel === 'developer' && hasUpdate) {
      void runRecentCommitsCheck()
    }
  }, [channel, hasUpdate, runRecentCommitsCheck])

  useEffect(() => {
    if (!channelChangedRef.current) return
    channelChangedRef.current = false
    void forceCheck()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel])

  const clearLastCheckResult = useCallback(() => setLastCheckResult(null), [])

  return {
    currentVersion,
    commitHash,
    channel,
    latestRelease,
    hasUpdate,
    isChecking,
    isLoading: isChecking,
    error,
    lastChecked,
    skippedVersions,
    releases,
    lastCheckResult,
    autoUpdateEnabled,
    installMethod,
    autoUpdateStatus,
    updateProgress,
    agentConnected,
    hasCodingAgent,
    latestMainSHA,
    recentCommits,
    setChannel,
    checkForUpdates,
    forceCheck,
    skipVersion,
    clearSkippedVersions,
    setAutoUpdateEnabled,
    triggerUpdate: () => triggerUpdate(channel),
    cancelUpdate,
    setUpdateProgress,
    clearLastCheckResult,
  }
}
