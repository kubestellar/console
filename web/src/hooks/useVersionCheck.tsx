import { useState, useEffect, useCallback, useMemo, useRef, createContext, use, type ReactNode } from 'react'
import type {
  UpdateChannel,
  GitHubRelease,
  ParsedRelease,
  InstallMethod,
  AutoUpdateStatus,
  UpdateProgress } from '../types/updates'
import { emitSessionContext } from '../lib/analytics'
import { UPDATE_STORAGE_KEYS } from '../types/updates'
import { FETCH_DEFAULT_TIMEOUT_MS, FETCH_EXTERNAL_TIMEOUT_MS } from '../lib/constants/network'
import { MS_PER_MINUTE } from '../lib/constants/time'
import { useLocalAgent } from './useLocalAgent'

// Re-export pure utilities so existing consumers that import from this file
// continue to work without changing their import paths.
export {
  parseReleaseTag,
  parseRelease,
  getLatestForChannel,
  isDevVersion,
  isNewerVersion,
} from './versionUtils'

import {
  GITHUB_API_URL,
  GITHUB_MAIN_SHA_URL,
  MIN_CHECK_INTERVAL_MS,
  AUTO_UPDATE_POLL_MS,
  DEV_SHA_CACHE_KEY,
  ERROR_DISPLAY_THRESHOLD,
  HEALTH_FETCH_TIMEOUT_MS,
  HEALTH_FETCH_MAX_RETRIES,
  HEALTH_FETCH_RETRY_DELAY_MS,
  TRIGGER_UPDATE_TIMEOUT_MS,
  CANCEL_UPDATE_TIMEOUT_MS,
  safeJsonParse,
  parseRelease,
  getLatestForChannel,
  isDevVersion,
  isNewerVersion,
  loadCache,
  saveCache,
  isCacheValid,
  loadChannel,
  loadAutoUpdateEnabled,
  loadSkippedVersions,
} from './versionUtils'

declare const __APP_VERSION__: string
declare const __COMMIT_HASH__: string

/**
 * Hook for checking version updates from GitHub releases.
 *
 * Features:
 * - Uses 30-minute cache to minimize API calls
 * - Only auto-fetches when cache is stale (>30 minutes)
 * - User can manually refresh via forceCheck for immediate updates
 * - Supports stable (weekly), unstable (nightly), and developer (main SHA) channels
 * - Handles rate limiting with ETag conditional requests
 * - Allows skipping specific versions
 * - Auto-update configuration via kc-agent
 */
function useVersionCheckCore() {
  const [channel, setChannelState] = useState<UpdateChannel>(loadChannel)
  const [releases, setReleases] = useState<ParsedRelease[]>([])
  const [isChecking, setIsChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastChecked, setLastChecked] = useState<number | null>(() => {
    const stored = localStorage.getItem(UPDATE_STORAGE_KEYS.LAST_CHECK)
    return stored ? parseInt(stored, 10) : null
  })
  const [skippedVersions, setSkippedVersions] = useState<string[]>(loadSkippedVersions)

  // Consecutive failure counter — errors are only surfaced to the UI after
  // ERROR_DISPLAY_THRESHOLD consecutive failures to avoid flicker on transient errors.
  const consecutiveFailuresRef = useRef(0)

  // Signals that the user just changed the update channel, so forceCheck
  // should run once the new channel state is committed.
  const channelChangedRef = useRef(false)

  // Transient result of the last completed check — shown briefly in the UI
  // so the user gets feedback after clicking "Check Now".
  const [lastCheckResult, setLastCheckResult] = useState<'success' | 'no-update' | null>(null)

  // Auto-update state
  const [autoUpdateEnabled, setAutoUpdateEnabledState] = useState(loadAutoUpdateEnabled)
  // Initialize install method: localhost always means dev mode (running from source)
  const [installMethod, setInstallMethod] = useState<InstallMethod>(() =>
    typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
      ? 'dev'
      : 'unknown'
  )
  const [autoUpdateStatus, setAutoUpdateStatus] = useState<AutoUpdateStatus | null>(null)
  const [updateProgress, setUpdateProgress] = useState<UpdateProgress | null>(null)

  // Agent connectivity & coding agent status — derived from the shared AgentManager
  // singleton (same source as the navbar), so prereqs update in real-time
  const { isConnected: agentConnected, health: agentHealth, refresh: refreshAgent } = useLocalAgent()
  const hasCodingAgent = agentHealth?.hasClaude ?? false
  const agentSupportsAutoUpdate = agentConnected && agentHealth?.install_method != null

  // Client-side SHA tracking for developer channel (fallback when kc-agent doesn't support auto-update)
  const [latestMainSHA, setLatestMainSHA] = useState<string | null>(null)
  // Recent commits between current and latest SHA (developer channel)
  const [recentCommits, setRecentCommits] = useState<Array<{ sha: string; message: string; author: string; date: string }>>([])

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

  /**
   * Fetch auto-update status from kc-agent (only if agent supports it).
   */
  const fetchAutoUpdateStatus = useCallback(async () => {
    if (!agentSupportsAutoUpdate) return
    try {
      console.debug('[version-check] Fetching auto-update status from kc-agent...')
      const resp = await fetch('/api/agent/auto-update/status', {
        credentials: 'include',
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS) })
      if (resp.ok) {
        const data = await safeJsonParse<AutoUpdateStatus>(resp, 'Auto-update status')
        console.debug('[version-check] Auto-update status:', data)
        setAutoUpdateStatus(data)
        // Clear any stale error from a previous failed check
        consecutiveFailuresRef.current = 0
        setError(null)
        // Update latestMainSHA and lastChecked from agent response
        if (data.latestSHA) {
          setLatestMainSHA(data.latestSHA)
        }
        const now = Date.now()
        setLastChecked(now)
        localStorage.setItem(UPDATE_STORAGE_KEYS.LAST_CHECK, String(now))
      } else {
        console.debug('[version-check] Auto-update status failed:', resp.status)
        consecutiveFailuresRef.current += 1
        if (consecutiveFailuresRef.current >= ERROR_DISPLAY_THRESHOLD) {
          setError(`kc-agent returned ${resp.status}`)
        }
      }
    } catch (err: unknown) {
      console.debug('[version-check] Auto-update status error:', err)
      consecutiveFailuresRef.current += 1
      if (consecutiveFailuresRef.current >= ERROR_DISPLAY_THRESHOLD) {
        setError('Could not reach kc-agent')
      }
    }
  }, [agentSupportsAutoUpdate])

  /**
   * Fetch latest main branch SHA directly from GitHub API.
   * Used as fallback when kc-agent doesn't support /auto-update/status.
   * Handles 403 rate-limiting by backing off and using cache.
   */
  const fetchLatestMainSHA = useCallback(async () => {
    // Check if we're in a rate-limit backoff period
    const rateLimitUntil = localStorage.getItem('kc-github-rate-limit-until')
    if (rateLimitUntil && Date.now() < parseInt(rateLimitUntil, 10)) {
      console.debug('[version-check] GitHub API rate-limited, using cache until', new Date(parseInt(rateLimitUntil, 10)).toLocaleTimeString())
      const cached = localStorage.getItem(DEV_SHA_CACHE_KEY)
      if (cached) setLatestMainSHA(cached)
      return
    }

    try {
      const headers: HeadersInit = {
        Accept: 'application/vnd.github.v3+json' }
      console.debug('[version-check] Fetching latest main SHA from GitHub...')
      const resp = await fetch(GITHUB_MAIN_SHA_URL, {
        headers,
        signal: AbortSignal.timeout(5000) })
      if (resp.ok) {
        const data = await safeJsonParse<{ object?: { sha?: string } }>(resp, 'GitHub main SHA')
        const sha = data?.object?.sha as string | undefined
        if (sha) {
          console.debug('[version-check] Latest main SHA:', sha.slice(0, 7))
          setLatestMainSHA(sha)
          localStorage.setItem(DEV_SHA_CACHE_KEY, sha)
          localStorage.removeItem('kc-github-rate-limit-until')
        }
        // Update lastChecked timestamp so the UI reflects the check time
        const now = Date.now()
        setLastChecked(now)
        localStorage.setItem(UPDATE_STORAGE_KEYS.LAST_CHECK, String(now))
      } else if (resp.status === 403 || resp.status === 429) {
        // Rate limited — back off for 15 minutes
        const resetHeader = resp.headers.get('X-RateLimit-Reset')
        const backoffUntil = resetHeader
          ? parseInt(resetHeader, 10) * 1000
          : Date.now() + 15 * MS_PER_MINUTE
        localStorage.setItem('kc-github-rate-limit-until', String(backoffUntil))
        console.debug('[version-check] GitHub API rate-limited, backing off until', new Date(backoffUntil).toLocaleTimeString())
        setError('GitHub API rate limit — add a GitHub token in Settings for higher limits')
        // Still use cache
        const cached = localStorage.getItem(DEV_SHA_CACHE_KEY)
        if (cached) setLatestMainSHA(cached)
      } else {
        console.debug('[version-check] GitHub API error:', resp.status)
      }
    } catch (err: unknown) {
      console.debug('[version-check] Failed to fetch main SHA:', err)
      // Load from cache as fallback
      const cached = localStorage.getItem(DEV_SHA_CACHE_KEY)
      if (cached) setLatestMainSHA(cached)
    }
  }, [])

  /**
   * Fetch recent commits between current build SHA and latest main HEAD.
   * Uses GitHub Compare API: GET /repos/{owner}/{repo}/compare/{base}...{head}
   */
  const fetchRecentCommits = useCallback(async () => {
    const currentSHA = commitHash
    const latestSHA = latestMainSHA
    if (!currentSHA || currentSHA === 'unknown' || !latestSHA) {
      console.debug('[version-check] Skipping commit fetch — currentSHA:', currentSHA, 'latestSHA:', latestSHA)
      return
    }
    if (currentSHA === latestSHA || latestSHA.startsWith(currentSHA) || currentSHA.startsWith(latestSHA)) {
      setRecentCommits([])
      return
    }
    // Respect rate-limit backoff for commit comparison too
    const rateLimitUntil = localStorage.getItem('kc-github-rate-limit-until')
    if (rateLimitUntil && Date.now() < parseInt(rateLimitUntil, 10)) {
      console.debug('[version-check] Skipping commit fetch — rate-limited')
      return
    }
    try {
      const headers: HeadersInit = { Accept: 'application/vnd.github.v3+json' }
      console.debug('[version-check] Fetching commits:', currentSHA.slice(0, 7), '→', latestSHA.slice(0, 7))
      const resp = await fetch(
        `/api/github/repos/kubestellar/console/compare/${currentSHA}...${latestSHA}`,
        { headers, signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS) }
      )
      if (resp.ok) {
        const data = await safeJsonParse<{ commits?: Array<{ sha: string; commit: { message: string; author: { name: string; date: string } } }> }>(resp, 'GitHub compare')
        const commits = (data.commits || []).slice(-20).reverse().map((c: { sha: string; commit: { message: string; author: { name: string; date: string } } }) => ({
          sha: c.sha,
          message: c.commit.message.split('\n')[0], // First line only
          author: c.commit.author.name,
          date: c.commit.author.date }))
        console.debug('[version-check] Fetched', commits.length, 'commits')
        setRecentCommits(commits)
      } else if (resp.status === 403 || resp.status === 429) {
        const backoffUntil = Date.now() + 15 * MS_PER_MINUTE
        localStorage.setItem('kc-github-rate-limit-until', String(backoffUntil))
        console.debug('[version-check] Compare API rate-limited, backing off')
      } else {
        console.debug('[version-check] Compare API error:', resp.status)
      }
    } catch (err: unknown) {
      console.debug('[version-check] Failed to fetch commits:', err)
    }
  }, [commitHash, latestMainSHA])

  /**
   * Set update channel and persist to localStorage + kc-agent.
   * Triggers a fresh version check so the UI immediately reflects the new channel.
   */
  const setChannel = useCallback(async (newChannel: UpdateChannel) => {
    setChannelState(newChannel)
    localStorage.setItem(UPDATE_STORAGE_KEYS.CHANNEL, newChannel)

    // Mark channel as changed before the async sync so that the effect
    // triggered by setChannelState sees the flag immediately.
    channelChangedRef.current = true

    // Sync to kc-agent
    try {
      await fetch('/api/agent/auto-update/config', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ enabled: autoUpdateEnabled, channel: newChannel }),
        signal: AbortSignal.timeout(3000) })
    } catch {
      // Agent not available, local state is still saved
    }
  }, [autoUpdateEnabled])

  /**
   * Toggle auto-update and persist to localStorage + kc-agent.
   */
  const setAutoUpdateEnabled = async (enabled: boolean) => {
    setAutoUpdateEnabledState(enabled)
    localStorage.setItem(UPDATE_STORAGE_KEYS.AUTO_UPDATE_ENABLED, String(enabled))

    // Sync to kc-agent
    try {
      await fetch('/api/agent/auto-update/config', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ enabled, channel }),
        signal: AbortSignal.timeout(3000) })
    } catch {
      // Agent not available
    }
  }

  /**
   * Trigger an immediate update via kc-agent.
   * Returns { success, error } so the UI can show feedback.
   */
  const triggerUpdate = async (): Promise<{ success: boolean; error?: string }> => {
    console.debug('[version-check] Triggering update via kc-agent, channel:', channel)
    try {
      const resp = await fetch('/api/agent/auto-update/trigger', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ channel }),
        signal: AbortSignal.timeout(TRIGGER_UPDATE_TIMEOUT_MS) })
      if (resp.ok) {
        console.debug('[version-check] Update triggered successfully')
        return { success: true }
      }
      const errText = resp.status === 404
        ? 'kc-agent does not support auto-update yet — restart with latest code'
        : `kc-agent returned ${resp.status}`
      console.debug('[version-check] Update trigger failed:', errText)
      return { success: false, error: errText }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'kc-agent not reachable'
      console.debug('[version-check] Update trigger error:', msg)
      return { success: false, error: msg }
    }
  }

  /**
   * Cancel an in-progress update via kc-agent. Cancellation is best-effort —
   * the current step may finish before the abort is honored, and the restart
   * step cannot be cancelled once startup-oauth.sh has been spawned.
   * Returns { success, error } so the UI can show feedback.
   */
  const cancelUpdate = async (): Promise<{ success: boolean; error?: string }> => {
    console.debug('[version-check] Cancelling in-progress update via kc-agent')
    try {
      const resp = await fetch('/api/agent/auto-update/cancel', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        signal: AbortSignal.timeout(CANCEL_UPDATE_TIMEOUT_MS) })
      if (resp.ok) {
        console.debug('[version-check] Cancel request accepted')
        return { success: true }
      }
      if (resp.status === 409) {
        return { success: false, error: 'No update in progress' }
      }
      const errText = resp.status === 404
        ? 'kc-agent does not support cancel yet — restart with latest code'
        : `kc-agent returned ${resp.status}`
      return { success: false, error: errText }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'kc-agent not reachable'
      return { success: false, error: msg }
    }
  }

  /**
   * Fetch releases from GitHub API with caching.
   */
  const fetchReleases = async (force = false): Promise<void> => {
    setIsChecking(true)

    try {
      // Check cache first
      const cache = loadCache()
      if (!force && cache && isCacheValid(cache)) {
        setReleases(cache.data.map(parseRelease))
        setIsChecking(false)
        return
      }

      // Prepare headers for conditional request
      const headers: HeadersInit = {
        Accept: 'application/vnd.github.v3+json' }
      if (cache?.etag) {
        headers['If-None-Match'] = cache.etag
      }

      const response = await fetch(GITHUB_API_URL, { headers, credentials: 'include', signal: AbortSignal.timeout(FETCH_EXTERNAL_TIMEOUT_MS) })

      // Handle rate limiting
      if (response.status === 403) {
        const resetTime = response.headers.get('X-RateLimit-Reset')
        if (resetTime) {
          const resetDate = new Date(parseInt(resetTime, 10) * 1000)
          throw new Error(`Rate limited. Try again after ${resetDate.toLocaleTimeString()}`)
        }
        throw new Error('Rate limited by GitHub API')
      }

      // Handle 304 Not Modified
      if (response.status === 304 && cache) {
        // Update cache timestamp but keep data
        saveCache(cache.data, cache.etag)
        setReleases(cache.data.map(parseRelease))
        setLastChecked(Date.now())
        localStorage.setItem(UPDATE_STORAGE_KEYS.LAST_CHECK, Date.now().toString())
        setIsChecking(false)
        return
      }

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`)
      }

      const data = await safeJsonParse<GitHubRelease[]>(response, 'GitHub releases')
      const etag = response.headers.get('ETag')

      // Filter out drafts
      const validReleases = data.filter((r) => !r.draft)

      // Save to cache
      saveCache(validReleases, etag)

      // Parse and set releases
      setReleases(validReleases.map(parseRelease))
      consecutiveFailuresRef.current = 0
      setError(null)
      setLastChecked(Date.now())
      localStorage.setItem(UPDATE_STORAGE_KEYS.LAST_CHECK, Date.now().toString())
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to check for updates'
      consecutiveFailuresRef.current += 1
      if (consecutiveFailuresRef.current >= ERROR_DISPLAY_THRESHOLD) {
        setError(message)
      }

      // Fall back to cache if available
      const cache = loadCache()
      if (cache) {
        setReleases(cache.data.map(parseRelease))
      }
    } finally {
      setIsChecking(false)
    }
  }

  /**
   * Check for updates (respects minimum check interval).
   * Only fetches if cache is stale (older than 30 minutes).
   * User must manually refresh for more frequent updates.
   */
  const checkForUpdates = async (): Promise<void> => {
    // For developer channel, try kc-agent first, fall back to direct GitHub API
    if (channel === 'developer') {
      if (agentSupportsAutoUpdate) {
        await fetchAutoUpdateStatus()
      } else {
        await fetchLatestMainSHA()
      }
      return
    }

    // Always try to use cached data first
    const cache = loadCache()
    if (cache) {
      setReleases(cache.data.map(parseRelease))

      // Only fetch if cache is older than MIN_CHECK_INTERVAL
      if (Date.now() - cache.timestamp < MIN_CHECK_INTERVAL_MS) {
        return // Cache is fresh, don't fetch
      }
    }

    // Also enforce lastChecked interval as backup
    if (lastChecked && Date.now() - lastChecked < MIN_CHECK_INTERVAL_MS) {
      return
    }

    await fetchReleases()
  }

  /**
   * Force a fresh check, bypassing cache.
   * Sets lastCheckResult so the UI can show transient success/no-update feedback.
   */
  const forceCheck = async (): Promise<void> => {
    console.debug('[version-check] Force check — channel:', channel, 'agentSupportsAutoUpdate:', agentSupportsAutoUpdate)
    setIsChecking(true)
    // Clear any previous transient result while the new check is in progress
    setLastCheckResult(null)
    // Reset consecutive failure counter on user-initiated check so a single
    // success clears the error, and a single failure doesn't flash red.
    consecutiveFailuresRef.current = 0
    setError(null)
    // Trigger an immediate agent health check via the shared singleton
    refreshAgent()
    try {
      if (channel === 'developer') {
        if (agentSupportsAutoUpdate) {
          console.debug('[version-check] Checking via kc-agent /auto-update/status')
          await fetchAutoUpdateStatus()
        } else {
          console.debug('[version-check] Checking via GitHub API (no agent auto-update support)')
          // Clear rate-limit backoff on manual check so users can retry
          localStorage.removeItem('kc-github-rate-limit-until')
          await fetchLatestMainSHA()
        }
        return
      }
      await fetchReleases(true)
    } finally {
      setIsChecking(false)
      // Signal a transient result so the UI can flash feedback.
      // An error means the check failed (error state is already set above),
      // so only set a result when there is no error.
      if (consecutiveFailuresRef.current === 0) {
        // hasUpdate is derived from state that was just set, but React hasn't
        // re-rendered yet. We use 'success' here as a generic "check succeeded"
        // signal — the UI will read hasUpdate on the next render to decide
        // whether to show "Update available" or "Up to date".
        setLastCheckResult('success')
      }
    }
  }

  /**
   * Skip a specific version (won't show update notification for it).
   */
  const skipVersion = (version: string) => {
    setSkippedVersions((prev) => {
      const updated = [...prev, version]
      localStorage.setItem(UPDATE_STORAGE_KEYS.SKIPPED_VERSIONS, JSON.stringify(updated))
      return updated
    })
  }

  /**
   * Clear all skipped versions.
   */
  const clearSkippedVersions = () => {
    setSkippedVersions([])
    localStorage.removeItem(UPDATE_STORAGE_KEYS.SKIPPED_VERSIONS)
  }

  // Compute latest release and update availability
  const latestRelease = getLatestForChannel(releases, channel)

  const hasUpdate = useMemo(() => {
    // Developer channel: check SHA from agent status or client-side comparison
    if (channel === 'developer') {
      if (autoUpdateStatus) {
        return autoUpdateStatus.hasUpdate
      }
      // Client-side SHA comparison: compare build commit with latest main HEAD
      if (latestMainSHA && commitHash && commitHash !== 'unknown') {
        return !latestMainSHA.startsWith(commitHash) && !commitHash.startsWith(latestMainSHA)
      }
      return false
    }

    if (!latestRelease || currentVersion === 'unknown') return false
    if (skippedVersions.includes(latestRelease.tag)) return false

    // Helm installs with unset VITE_APP_VERSION report '0.0.0' which isDevVersion
    // treats as a dev build. For Helm self-upgrade we still want to show the update
    // button whenever a newer release exists on the selected channel.
    if (installMethod === 'helm' && isDevVersion(currentVersion)) return true

    return isNewerVersion(currentVersion, latestRelease.tag, channel)
  }, [latestRelease, currentVersion, skippedVersions, channel, autoUpdateStatus, latestMainSHA, commitHash, installMethod])

  // Load cached data on mount
  useEffect(() => {
    const cache = loadCache()
    if (cache) {
      setReleases(cache.data.map(parseRelease))
    }
  }, [])

  // Sync install method from agent health (kc-agent reports it in /health)
  useEffect(() => {
    if (agentHealth?.install_method) {
      setInstallMethod(agentHealth.install_method as InstallMethod)
    }
  }, [agentHealth?.install_method])

  // Send install method + update channel to GA4 as user properties once known
  useEffect(() => {
    if (installMethod !== 'unknown') {
      emitSessionContext(installMethod, channel)
    }
  }, [installMethod, channel])

  // Auto-reset channel when it's no longer valid for the detected install method.
  // Example: localhost defaults to 'developer', but backend reports 'helm' install —
  // developer channel is only valid for 'dev' installs, so fall back to 'stable'.
  useEffect(() => {
    if (channel === 'developer' && installMethod !== 'dev' && installMethod !== 'unknown') {
      console.debug('[version-check] Resetting channel from developer to stable — installMethod is', installMethod)
      setChannel('stable')
    }
  }, [installMethod, channel, setChannel])

  // Fetch install_method from backend /health as fallback.
  // Retries once after a short delay because the backend may still be warming up
  // (returns 503 during cluster probe phase) when the SPA mounts.
  useEffect(() => {
    let cancelled = false
    async function fetchBackendInstallMethod(attempt: number) {
      try {
        const resp = await fetch('/health', { signal: AbortSignal.timeout(HEALTH_FETCH_TIMEOUT_MS) })
        if (resp.ok) {
          const data = await safeJsonParse<{ install_method?: string }>(resp, 'Backend health')
          if (data.install_method && !cancelled) {
            setInstallMethod(data.install_method as InstallMethod)
            return // success — no retry needed
          }
        }
      } catch { /* Backend not available */ }
      // Retry once after a delay (backend may still be warming up)
      if (attempt < HEALTH_FETCH_MAX_RETRIES && !cancelled) {
        setTimeout(() => fetchBackendInstallMethod(attempt + 1), HEALTH_FETCH_RETRY_DELAY_MS)
      }
    }
    fetchBackendInstallMethod(0)
    return () => { cancelled = true }
  }, [])

  // Fetch auto-update status when channel changes or on mount
  useEffect(() => {
    if (agentConnected && agentSupportsAutoUpdate) {
      fetchAutoUpdateStatus()
    }
  }, [agentConnected, agentSupportsAutoUpdate, channel, fetchAutoUpdateStatus])

  // Periodic poll: re-fetch auto-update status every 60s so the UI picks up
  // new commits detected by kc-agent without requiring manual "Check Now".
  // Includes autoUpdateEnabled so toggling the setting restarts polling.
  // Fires an immediate fetch when toggled on so the user doesn't wait a full
  // AUTO_UPDATE_POLL_MS cycle before seeing the current status.
  useEffect(() => {
    if (!agentConnected || !agentSupportsAutoUpdate || !autoUpdateEnabled) return
    // Immediate fetch so the UI updates right away when auto-update is toggled on
    fetchAutoUpdateStatus()
    const id = setInterval(() => {
      fetchAutoUpdateStatus()
    }, AUTO_UPDATE_POLL_MS)
    return () => clearInterval(id)
  }, [agentConnected, agentSupportsAutoUpdate, autoUpdateEnabled, fetchAutoUpdateStatus])

  // For developer channel: fetch latest main SHA client-side (fallback when kc-agent doesn't support auto-update)
  useEffect(() => {
    if (channel === 'developer' && !agentSupportsAutoUpdate) {
      // Load cached SHA immediately
      const cached = localStorage.getItem(DEV_SHA_CACHE_KEY)
      if (cached) setLatestMainSHA(cached)
      // Then fetch fresh from GitHub
      fetchLatestMainSHA()
    }
  }, [channel, agentSupportsAutoUpdate, fetchLatestMainSHA])

  // Fetch commit list when we have both SHAs and they differ
  useEffect(() => {
    if (channel === 'developer' && hasUpdate) {
      fetchRecentCommits()
    }
  }, [channel, hasUpdate, fetchRecentCommits])

  // When the user changes the update channel, trigger a fresh check so the
  // UI immediately reflects the new channel's latest release / SHA.
  useEffect(() => {
    if (!channelChangedRef.current) return
    channelChangedRef.current = false
    forceCheck()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel])

  const clearLastCheckResult = useCallback(() => setLastCheckResult(null), [])

  return {
    // State
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

    // Auto-update state
    autoUpdateEnabled,
    installMethod,
    autoUpdateStatus,
    updateProgress,
    agentConnected,
    hasCodingAgent,
    latestMainSHA,
    recentCommits,

    // Actions
    setChannel,
    checkForUpdates,
    forceCheck,
    skipVersion,
    clearSkippedVersions,
    setAutoUpdateEnabled,
    triggerUpdate,
    cancelUpdate,
    setUpdateProgress,
    clearLastCheckResult }
}

// ---------------------------------------------------------------------------
// Shared Context — all consumers see the same version-check state
// ---------------------------------------------------------------------------

type VersionCheckValue = ReturnType<typeof useVersionCheckCore>

const VersionCheckContext = createContext<VersionCheckValue | null>(null)

/**
 * Provider that creates a single version-check instance shared by all consumers.
 * Mount once near the app root (e.g. in Layout).
 *
 * IMPORTANT (#9769): The context value is memoized against every state/action
 * field returned by useVersionCheckCore(). Without memoization, every internal
 * state change (e.g. isChecking toggle, auto-update poll result) creates a new
 * object reference, forcing ALL consumers (Navbar, Sidebar, UpdateIndicator,
 * every card in the enterprise portal) to re-render. The cascade amplifies
 * through hooks like useClusters() / useDashboardHealth() and can trip React
 * error #185 on pages with many hook subscribers (e.g. /enterprise/frameworks).
 */
export function VersionCheckProvider({ children }: { children: ReactNode }) {
  const value = useVersionCheckCore()

  // Memoize against individual fields so consumers only re-render when a
  // value they might read actually changes. Actions (useCallback) are stable
  // across renders, so they don't contribute to unnecessary invalidations.
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
    // Actions — stable useCallback references, included for completeness
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

/**
 * Public hook — reads from the shared VersionCheckProvider context.
 */
export function useVersionCheck(): VersionCheckValue {
  const ctx = use(VersionCheckContext)
  if (!ctx) {
    throw new Error('useVersionCheck must be used within a <VersionCheckProvider>')
  }
  return ctx
}
