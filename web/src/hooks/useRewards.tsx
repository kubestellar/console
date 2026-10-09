/**
 * Reward system hook for gamification
 * Tracks user coins, achievements, and reward events
 *
 * Issue #6011 fix: the canonical source of truth for coin/point/level/bonus
 * balances is now the backend (`/api/rewards/me` + `/api/rewards/coins` +
 * `/api/rewards/daily-bonus`). `localStorage` is still read on mount as a
 * loading-bridge cache so the UI never blinks on reload, and it is still
 * used as the sole storage for demo/dev mode (where there is no JWT to
 * authenticate the API calls). Real authenticated sessions persist every
 * mutation to SQLite so clearing the browser cache, switching devices, or
 * using a private window no longer wipes the balance.
 */

import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, ReactNode } from 'react'
import { useAuth } from '../lib/auth'
import { getDemoMode } from '../lib/demoMode'
import {
  RewardActionType,
  RewardEvent,
  UserRewards,
  REWARD_ACTIONS,
  ACHIEVEMENTS } from '../types/rewards'
import { useGitHubRewards } from './useGitHubRewards'
import { useBonusPoints } from './useBonusPoints'
import {
  getUserRewards as apiGetUserRewards,
  incrementCoins as apiIncrementCoins,
  RewardsUnauthenticatedError } from '../lib/rewardsApi'
import { areOptionalPollersSuppressed } from '../lib/constants/network'
import {
  DEMO_REWARDS_USER_ID,
  MAX_REWARD_EVENTS,
  RECENT_EVENTS_LIMIT,
  REWARDS_FALLBACK,
  REWARDS_STORAGE_KEY,
  checkAchievements,
  createInitialRewards,
  generateId,
  loadRewards,
  resolveRewardsUserId,
  saveRewards,
  type RewardsContextType,
} from './useRewards.helpers'

const RewardsContext = createContext<RewardsContextType | null>(null)

export function RewardsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  // Combine rewards + isLoading into one state so the hydrate function can
  // update both in a single setState call, preventing consecutive-setState flicker.
  const [{ rewards, isLoading }, setRewardsState] = useState<{ rewards: UserRewards | null; isLoading: boolean }>({
    rewards: null,
    isLoading: true,
  })
  const setRewards = useCallback(
    (updater: UserRewards | null | ((prev: UserRewards | null) => UserRewards | null)) => {
      setRewardsState(prev => ({
        ...prev,
        rewards: typeof updater === 'function' ? (updater as (prev: UserRewards | null) => UserRewards | null)(prev.rewards) : updater,
      }))
    },
    [],
  )
  const { githubRewards, githubPoints, refresh: refreshGitHubRewards } = useGitHubRewards()
  const { bonusPoints } = useBonusPoints()

  // Keep the resolved id in a ref so the storage-event listener always sees
  // the current user without having to re-subscribe on every render.
  const effectiveUserId = resolveRewardsUserId(user?.id)
  const effectiveUserIdRef = useRef<string | null>(effectiveUserId)
  useEffect(() => {
    effectiveUserIdRef.current = effectiveUserId
  }, [effectiveUserId, setRewards])

  // Ref for rewards so stable callbacks can read current state
  const rewardsRef = useRef<UserRewards | null>(rewards)
  useEffect(() => {
    rewardsRef.current = rewards
  }, [rewards])

  // Load rewards when the user changes.
  //
  // In authenticated mode (real oauth session) the backend is the source
  // of truth — we read localStorage first as a loading bridge so the UI
  // hydrates instantly, then fetch `/api/rewards/me` and merge the
  // server-authoritative coin/point/level/bonus values on top. Events and
  // achievements remain client-only (#6011 scope covers numeric balances,
  // not the event history).
  //
  // In demo/dev mode (no JWT), we keep the legacy localStorage-only path
  // so developers can still use the app without running kc-agent.
  useEffect(() => {
    let cancelled = false

    async function hydrate() {
      if (!effectiveUserId) {
        setRewardsState({ rewards: null, isLoading: false })
        return
      }

      // Step 1: always load the local cache first so the UI can paint
      // immediately even if the backend is slow or unreachable.
      const cached = loadRewards(effectiveUserId)
      const initial = cached ?? createInitialRewards(effectiveUserId)
      if (!cancelled) {
        setRewardsState({ rewards: initial, isLoading: false })
      }
      if (!cached) {
        saveRewards(effectiveUserId, initial)
      }

      // Step 2: if this is a real authenticated session (not demo mode),
      // pull the canonical server state and overwrite coin/point totals.
      if (getDemoMode() || areOptionalPollersSuppressed() || effectiveUserId === DEMO_REWARDS_USER_ID) return

      try {
        const server = await apiGetUserRewards()
        if (cancelled) return
        setRewards(prev => {
          const base = prev ?? createInitialRewards(effectiveUserId)
          const merged: UserRewards = {
            ...base,
            totalCoins: server.coins,
            lifetimeCoins: Math.max(server.points, base.lifetimeCoins),
            lastUpdated: server.updated_at,
          }
          saveRewards(effectiveUserId, merged)
          return merged
        })
      } catch (err: unknown) {
        // 401 simply means the user is logged out — silently fall back to
        // the cached local state (which is what we already painted).
        if (err instanceof RewardsUnauthenticatedError) return
        console.warn('[useRewards] failed to fetch server rewards:', err)
      }
    }

    hydrate()
    return () => {
      cancelled = true
    }
  }, [effectiveUserId, setRewards])

  // Cross-tab sync (issue #6014): when another tab mutates the rewards
  // localStorage key, mirror the change in this tab so the coin balance,
  // recent events, and achievements stay in sync everywhere. The `storage`
  // event only fires in OTHER tabs, never the one that wrote the value, so
  // this cannot loop.
  //
  // In authenticated mode we additionally re-fetch from the backend on
  // every storage event so that the cross-tab view always lands on the
  // server-authoritative numbers rather than whatever value the peer tab
  // happened to write locally (issue #6011 follow-up).
  useEffect(() => {
    function handleStorage(e: StorageEvent) {
      if (e.key !== REWARDS_STORAGE_KEY) return
      const id = effectiveUserIdRef.current
      if (!id) return
      try {
        const allRewards = e.newValue ? (JSON.parse(e.newValue) as Record<string, UserRewards>) : {}
        const next = allRewards[id] ?? null
        // Only update if the incoming value is actually different to avoid
        // unnecessary re-renders when unrelated user buckets change.
        setRewards(prev => {
          if (!prev && !next) return prev
          if (prev && next && prev.lastUpdated === next.lastUpdated && prev.totalCoins === next.totalCoins) {
            return prev
          }
          return next
        })
      } catch (err: unknown) {
        console.error('[useRewards] Failed to parse cross-tab rewards update:', err)
      }

      // Authenticated cross-tab bridge: pull the canonical server state.
      if (getDemoMode() || id === DEMO_REWARDS_USER_ID) return
      apiGetUserRewards()
        .then(server => {
          setRewards(prev => {
            if (!prev) return prev
            if (prev.totalCoins === server.coins && prev.lifetimeCoins === server.points) return prev
            const merged: UserRewards = {
              ...prev,
              totalCoins: server.coins,
              lifetimeCoins: Math.max(server.points, prev.lifetimeCoins),
              lastUpdated: server.updated_at,
            }
            saveRewards(id, merged)
            return merged
          })
        })
        .catch((refreshErr: unknown) => {
          if (refreshErr instanceof RewardsUnauthenticatedError) return
          console.error('[useRewards] cross-tab server refresh failed:', refreshErr)
        })
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [setRewards])

  // Check if action has been earned (for one-time rewards)
  const hasEarnedAction = useCallback((action: RewardActionType): boolean => {
    const r = rewardsRef.current
    if (!r) return false
    return r.events.some(e => e.action === action)
  }, [])

  // Get count of times an action has been performed
  const getActionCount = useCallback((action: RewardActionType): number => {
    const r = rewardsRef.current
    if (!r) return 0
    return r.events.filter(e => e.action === action).length
  }, [])

  // Award coins for an action.
  //
  // Updates local state + localStorage optimistically (so the UI is
  // instantly responsive) and also mirrors the delta to the backend
  // persistence endpoint when the user is authenticated. Network errors
  // are logged but do NOT roll back the optimistic state — the next load
  // will reconcile against the server row.
  const awardCoins = useCallback((action: RewardActionType, metadata?: Record<string, unknown>): boolean => {
    const currentRewards = rewardsRef.current
    const currentUserId = effectiveUserIdRef.current
    if (!currentRewards || !currentUserId) return false

    const rewardConfig = REWARD_ACTIONS[action]
    if (!rewardConfig) {
      console.warn(`[useRewards] Unknown action: ${action}`)
      return false
    }

    // Check if one-time reward already earned
    if (rewardConfig.oneTime && currentRewards.events.some(e => e.action === action)) {
      return false
    }

    // Create reward event
    const event: RewardEvent = {
      id: generateId(),
      userId: currentUserId,
      action,
      coins: rewardConfig.coins,
      timestamp: new Date().toISOString(),
      metadata }

    // Update rewards
    const updated: UserRewards = {
      ...currentRewards,
      totalCoins: currentRewards.totalCoins + rewardConfig.coins,
      lifetimeCoins: currentRewards.lifetimeCoins + rewardConfig.coins,
      events: [event, ...currentRewards.events].slice(0, MAX_REWARD_EVENTS),
      lastUpdated: new Date().toISOString() }

    // Check for new achievements
    const newAchievements = checkAchievements(updated)
    if (newAchievements.length > 0) {
      updated.achievements = [...new Set([...updated.achievements, ...newAchievements])]
    }

    setRewards(updated)
    saveRewards(currentUserId, updated)

    // Mirror to backend for authenticated sessions. Demo mode and the
    // shared "demo-user" bucket are intentionally excluded — they have no
    // JWT so the request would always 401.
    const isDemoSession = getDemoMode() || currentUserId === DEMO_REWARDS_USER_ID
    if (!isDemoSession) {
      apiIncrementCoins(rewardConfig.coins).catch((err: unknown) => {
        if (err instanceof RewardsUnauthenticatedError) return
        console.error('[useRewards] failed to persist coin delta to backend:', err)
      })
    }

    return true
  }, [setRewards])

  // Get earned achievements as full objects
  const earnedAchievements = useMemo(() => {
    if (!rewards) return []
    return ACHIEVEMENTS.filter(a => rewards.achievements.includes(a.id))
  }, [rewards])

  // Get recent events (last 10)
  const recentEvents = useMemo(() => {
    if (!rewards) return []
    return rewards.events.slice(0, RECENT_EVENTS_LIMIT)
  }, [rewards])

  // Dedup: subtract console-submitted bug/feature coins that overlap with GitHub data.
  // Only dedup the *actual* overlap — the minimum of localStorage event count and
  // GitHub contribution count for each category. This prevents under-counting when
  // GitHub hasn't indexed an issue yet or classifies it differently due to label timing.
  const consoleSubmittedOffset = useMemo(() => {
    if (!rewards || !githubRewards) return 0

    const localBugCount = (rewards.events || []).filter(e => e.action === 'bug_report').length
    const localFeatureCount = (rewards.events || []).filter(e => e.action === 'feature_suggestion').length

    const githubBugCount = githubRewards.breakdown?.bug_issues ?? 0
    const githubFeatureCount = githubRewards.breakdown?.feature_issues ?? 0

    // Only dedup entries that appear in BOTH sources (the overlap)
    const bugOverlap = Math.min(localBugCount, githubBugCount)
    const featureOverlap = Math.min(localFeatureCount, githubFeatureCount)

    return (bugOverlap * REWARD_ACTIONS.bug_report.coins) + (featureOverlap * REWARD_ACTIONS.feature_suggestion.coins)
  }, [rewards, githubRewards])

  // Merged total: localStorage coins - dedup offset + GitHub coins + bonus.
  // The dedup offset removes only the overlapping bug/feature coins from
  // localStorage to avoid double-counting with the GitHub-sourced total.
  const mergedTotalCoins = useMemo(() => {
    const localCoins = rewards?.totalCoins ?? 0
    if (!githubRewards) return localCoins + bonusPoints
    return Math.max(0, localCoins - consoleSubmittedOffset) + githubPoints + bonusPoints
  }, [rewards, githubRewards, consoleSubmittedOffset, githubPoints, bonusPoints])

  const localCoins = Math.max(0, (rewards?.totalCoins ?? 0) - consoleSubmittedOffset)

  const value = useMemo<RewardsContextType>(() => ({
    rewards,
    totalCoins: mergedTotalCoins,
    earnedAchievements,
    isLoading,
    awardCoins,
    hasEarnedAction,
    getActionCount,
    recentEvents,
    githubRewards,
    githubPoints,
    localCoins,
    bonusPoints,
    refreshGitHubRewards,
  }), [
    rewards,
    mergedTotalCoins,
    earnedAchievements,
    isLoading,
    awardCoins,
    hasEarnedAction,
    getActionCount,
    recentEvents,
    githubRewards,
    githubPoints,
    localCoins,
    bonusPoints,
    refreshGitHubRewards,
  ])

  return (
    <RewardsContext.Provider value={value}>
      {children}
    </RewardsContext.Provider>
  )
}

export function useRewards() {
  const context = useContext(RewardsContext)
  if (!context) {
    if (import.meta.env.DEV) {
      console.warn('useRewards was called outside RewardsProvider — returning safe fallback')
    }
    return REWARDS_FALLBACK
  }
  return context
}

// Export for components that need action info
export { REWARD_ACTIONS, ACHIEVEMENTS }

export const __testables = {
  generateId,
  loadRewards,
  saveRewards,
  createInitialRewards,
  resolveRewardsUserId,
  checkAchievements,
  REWARDS_STORAGE_KEY,
  MAX_REWARD_EVENTS,
  RECENT_EVENTS_LIMIT,
  DEMO_REWARDS_USER_ID,
}
