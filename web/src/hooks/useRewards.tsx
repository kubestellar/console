/**
 * Reward system hook for gamification
 * Tracks user coins, achievements, and reward events
 */

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { useAuth } from '../lib/auth'
import {
  RewardActionType,
  RewardEvent,
  UserRewards,
  REWARD_ACTIONS,
  ACHIEVEMENTS,
  Achievement } from '../types/rewards'
import type { GitHubRewardsResponse } from '../types/rewards'
import { useGitHubRewards } from './useGitHubRewards'

const REWARDS_STORAGE_KEY = 'kubestellar-rewards'
/** Maximum reward events to keep in history */
const MAX_REWARD_EVENTS = 100
/** Number of recent events to show in the UI */
const RECENT_EVENTS_LIMIT = 10

interface RewardsContextType {
  rewards: UserRewards | null
  totalCoins: number
  earnedAchievements: Achievement[]
  isLoading: boolean
  awardCoins: (action: RewardActionType, metadata?: Record<string, unknown>) => boolean
  hasEarnedAction: (action: RewardActionType) => boolean
  getActionCount: (action: RewardActionType) => number
  recentEvents: RewardEvent[]
  githubRewards: GitHubRewardsResponse | null
  githubPoints: number
  /** Coins from in-app activity (missions, games, sharing) stored in localStorage */
  localCoins: number
  refreshGitHubRewards: () => Promise<void>
}

const RewardsContext = createContext<RewardsContextType | null>(null)

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

function loadRewards(userId: string): UserRewards | null {
  try {
    const stored = localStorage.getItem(REWARDS_STORAGE_KEY)
    if (stored) {
      const allRewards = JSON.parse(stored) as Record<string, UserRewards>
      return allRewards[userId] || null
    }
  } catch (e) {
    console.error('[useRewards] Failed to load rewards:', e)
  }
  return null
}

function saveRewards(userId: string, rewards: UserRewards): void {
  try {
    const stored = localStorage.getItem(REWARDS_STORAGE_KEY)
    const allRewards = stored ? JSON.parse(stored) : {}
    allRewards[userId] = rewards
    localStorage.setItem(REWARDS_STORAGE_KEY, JSON.stringify(allRewards))
  } catch (e) {
    console.error('[useRewards] Failed to save rewards:', e)
  }
}

function createInitialRewards(userId: string): UserRewards {
  return {
    userId,
    totalCoins: 0,
    lifetimeCoins: 0,
    events: [],
    achievements: [],
    lastUpdated: new Date().toISOString() }
}

export function RewardsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [rewards, setRewards] = useState<UserRewards | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const { githubRewards, githubPoints, refresh: refreshGitHubRewards } = useGitHubRewards()

  // Load rewards when user changes
  useEffect(() => {
    if (user?.id) {
      const loaded = loadRewards(user.id)
      if (loaded) {
        setRewards(loaded)
      } else {
        // Initialize new user rewards
        const initial = createInitialRewards(user.id)
        setRewards(initial)
        saveRewards(user.id, initial)
      }
      setIsLoading(false)
    } else {
      setRewards(null)
      setIsLoading(false)
    }
  }, [user?.id])

  // Check if action has been earned (for one-time rewards)
  const hasEarnedAction = (action: RewardActionType): boolean => {
    if (!rewards) return false
    return rewards.events.some(e => e.action === action)
  }

  // Get count of times an action has been performed
  const getActionCount = useCallback((action: RewardActionType): number => {
    if (!rewards) return 0
    return rewards.events.filter(e => e.action === action).length
  }, [rewards])

  // Award coins for an action
  const awardCoins = (action: RewardActionType, metadata?: Record<string, unknown>): boolean => {
    if (!rewards || !user?.id) return false

    const rewardConfig = REWARD_ACTIONS[action]
    if (!rewardConfig) {
      console.warn(`[useRewards] Unknown action: ${action}`)
      return false
    }

    // Check if one-time reward already earned
    if (rewardConfig.oneTime && hasEarnedAction(action)) {
      return false
    }

    // Create reward event
    const event: RewardEvent = {
      id: generateId(),
      userId: user.id,
      action,
      coins: rewardConfig.coins,
      timestamp: new Date().toISOString(),
      metadata }

    // Update rewards
    const updated: UserRewards = {
      ...rewards,
      totalCoins: rewards.totalCoins + rewardConfig.coins,
      lifetimeCoins: rewards.lifetimeCoins + rewardConfig.coins,
      events: [event, ...rewards.events].slice(0, MAX_REWARD_EVENTS),
      lastUpdated: new Date().toISOString() }

    // Check for new achievements
    const newAchievements = checkAchievements(updated)
    if (newAchievements.length > 0) {
      updated.achievements = [...new Set([...updated.achievements, ...newAchievements])]
    }

    setRewards(updated)
    saveRewards(user.id, updated)

    return true
  }

  // Check which achievements have been earned
  const checkAchievements = (userRewards: UserRewards): string[] => {
    const newAchievements: string[] = []

    for (const achievement of (ACHIEVEMENTS || [])) {
      // Skip if already earned
      if (userRewards.achievements.includes(achievement.id)) continue

      let earned = false

      // Check coin requirement
      if (achievement.requiredCoins && userRewards.lifetimeCoins >= achievement.requiredCoins) {
        earned = true
      }

      // Check action requirement
      if (achievement.requiredAction) {
        const count = userRewards.events.filter(e => e.action === achievement.requiredAction).length
        const requiredCount = achievement.requiredCount || 1
        if (count >= requiredCount) {
          earned = true
        }
      }

      if (earned) {
        newAchievements.push(achievement.id)
      }
    }

    return newAchievements
  }

  // Get earned achievements as full objects
  const earnedAchievements = (() => {
    if (!rewards) return []
    return ACHIEVEMENTS.filter(a => rewards.achievements.includes(a.id))
  })()

  // Get recent events (last 10)
  const recentEvents = (() => {
    if (!rewards) return []
    return rewards.events.slice(0, RECENT_EVENTS_LIMIT)
  })()

  // Dedup: subtract console-submitted bug/feature coins that overlap with GitHub data.
  // Only dedup the *actual* overlap — the minimum of localStorage event count and
  // GitHub contribution count for each category. This prevents under-counting when
  // GitHub hasn't indexed an issue yet or classifies it differently due to label timing.
  const consoleSubmittedOffset = (() => {
    if (!rewards || !githubRewards) return 0

    const localBugCount = (rewards.events || []).filter(e => e.action === 'bug_report').length
    const localFeatureCount = (rewards.events || []).filter(e => e.action === 'feature_suggestion').length

    const githubBugCount = githubRewards.breakdown?.bug_issues ?? 0
    const githubFeatureCount = githubRewards.breakdown?.feature_issues ?? 0

    // Only dedup entries that appear in BOTH sources (the overlap)
    const bugOverlap = Math.min(localBugCount, githubBugCount)
    const featureOverlap = Math.min(localFeatureCount, githubFeatureCount)

    return (bugOverlap * REWARD_ACTIONS.bug_report.coins) + (featureOverlap * REWARD_ACTIONS.feature_suggestion.coins)
  })()

  // Merged total: localStorage coins - dedup offset + GitHub coins.
  // The dedup offset removes only the overlapping bug/feature coins from
  // localStorage to avoid double-counting with the GitHub-sourced total.
  const mergedTotalCoins = (() => {
    const localCoins = rewards?.totalCoins ?? 0
    if (!githubRewards) return localCoins
    return Math.max(0, localCoins - consoleSubmittedOffset) + githubPoints
  })()

  const localCoins = Math.max(0, (rewards?.totalCoins ?? 0) - consoleSubmittedOffset)

  const value: RewardsContextType = {
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
    refreshGitHubRewards }

  return (
    <RewardsContext.Provider value={value}>
      {children}
    </RewardsContext.Provider>
  )
}

/**
 * Safe fallback for when useRewards is called outside RewardsProvider.
 * This can happen transiently during error-boundary recovery or when a
 * stale chunk re-evaluates after AppErrorBoundary catches a render error.
 */
const REWARDS_FALLBACK: RewardsContextType = {
  rewards: null,
  totalCoins: 0,
  earnedAchievements: [],
  isLoading: false,
  awardCoins: () => false,
  hasEarnedAction: () => false,
  getActionCount: () => 0,
  recentEvents: [],
  githubRewards: null,
  githubPoints: 0,
  localCoins: 0,
  refreshGitHubRewards: async () => {} }

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
