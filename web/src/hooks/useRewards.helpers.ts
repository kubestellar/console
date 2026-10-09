import { getDemoMode } from '../lib/demoMode'
import {
  ACHIEVEMENTS,
  type Achievement,
  type GitHubRewardsResponse,
  type RewardActionType,
  type RewardEvent,
  type UserRewards,
} from '../types/rewards'

export const REWARDS_STORAGE_KEY = 'kubestellar-rewards'
/** Maximum reward events to keep in history */
export const MAX_REWARD_EVENTS = 100
/** Number of recent events to show in the UI */
export const RECENT_EVENTS_LIMIT = 10
/**
 * Shared user id used for rewards storage when the session is running in
 * demo/dev mode. Without this, switching between dev mode (e.g. "demo-user")
 * and a real OAuth login produces two distinct localStorage buckets and the
 * user perceives their coin balance as "reset" (issue #6012). Consolidating
 * demo sessions under a single namespace keeps balances stable when toggling
 * modes during development.
 */
export const DEMO_REWARDS_USER_ID = 'demo-user'

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

export function loadRewards(userId: string): UserRewards | null {
  try {
    const stored = localStorage.getItem(REWARDS_STORAGE_KEY)
    if (stored) {
      const allRewards = JSON.parse(stored) as Record<string, UserRewards>
      return allRewards[userId] || null
    }
  } catch (e: unknown) {
    console.error('[useRewards] Failed to load rewards:', e)
  }
  return null
}

export function saveRewards(userId: string, rewards: UserRewards): void {
  try {
    const stored = localStorage.getItem(REWARDS_STORAGE_KEY)
    const allRewards = stored ? JSON.parse(stored) : {}
    allRewards[userId] = rewards
    localStorage.setItem(REWARDS_STORAGE_KEY, JSON.stringify(allRewards))
  } catch (e: unknown) {
    console.error('[useRewards] Failed to save rewards:', e)
  }
}

export function createInitialRewards(userId: string): UserRewards {
  return {
    userId,
    totalCoins: 0,
    lifetimeCoins: 0,
    events: [],
    achievements: [],
    lastUpdated: new Date().toISOString() }
}

/**
 * Resolves the effective rewards storage key for a user. In demo/dev mode
 * we collapse every session onto a single "demo-user" bucket so that
 * switching between dev mode and oauth login does not appear to wipe the
 * user's coin balance (issue #6012). Real oauth logins continue to use
 * their unique backend user id.
 */
export function resolveRewardsUserId(userId: string | undefined): string | null {
  if (!userId) return null
  if (getDemoMode() || userId === DEMO_REWARDS_USER_ID) return DEMO_REWARDS_USER_ID
  return userId
}

// Check which achievements have been earned (pure function — depends only on ACHIEVEMENTS constant)
export function checkAchievements(userRewards: UserRewards): string[] {
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

export interface RewardsContextType {
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
  /** Bonus points awarded via [bonus] issues by maintainer */
  bonusPoints: number
  refreshGitHubRewards: () => Promise<void>
}

/**
 * Safe fallback for when useRewards is called outside RewardsProvider.
 * This can happen transiently during error-boundary recovery or when a
 * stale chunk re-evaluates after AppErrorBoundary catches a render error.
 */
export const REWARDS_FALLBACK: RewardsContextType = {
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
  bonusPoints: 0,
  refreshGitHubRewards: async () => {} }
