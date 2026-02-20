/**
 * Types for the gamification reward system
 */

export type RewardActionType =
  | 'bug_report'        // 300 coins
  | 'feature_suggestion' // 100 coins
  | 'github_invite'      // 500 coins
  | 'linkedin_share'     // 200 coins
  | 'first_dashboard'    // 50 coins
  | 'daily_login'        // 10 coins
  | 'complete_onboarding' // 100 coins
  | 'first_card_add'     // 25 coins

export interface RewardAction {
  type: RewardActionType
  coins: number
  label: string
  description: string
  oneTime?: boolean // Can only be earned once
}

export interface RewardEvent {
  id: string
  userId: string
  action: RewardActionType
  coins: number
  timestamp: string
  metadata?: Record<string, unknown>
}

export interface UserRewards {
  userId: string
  totalCoins: number
  lifetimeCoins: number
  events: RewardEvent[]
  achievements: string[]
  lastUpdated: string
}

export interface LeaderboardEntry {
  userId: string
  username: string
  avatarUrl?: string
  totalCoins: number
  rank: number
}

export interface Achievement {
  id: string
  name: string
  description: string
  icon: string
  requiredCoins?: number
  requiredAction?: RewardActionType
  requiredCount?: number
}

// Reward configuration
export const REWARD_ACTIONS: Record<RewardActionType, RewardAction> = {
  bug_report: {
    type: 'bug_report',
    coins: 300,
    label: 'Bug Report',
    description: 'Report a bug to help improve the platform',
  },
  feature_suggestion: {
    type: 'feature_suggestion',
    coins: 100,
    label: 'Feature Suggestion',
    description: 'Suggest a new feature or improvement',
  },
  github_invite: {
    type: 'github_invite',
    coins: 500,
    label: 'GitHub Invite',
    description: 'Invite a friend to contribute on GitHub',
    oneTime: true,
  },
  linkedin_share: {
    type: 'linkedin_share',
    coins: 200,
    label: 'LinkedIn Share',
    description: 'Share KubeStellar on LinkedIn',
  },
  first_dashboard: {
    type: 'first_dashboard',
    coins: 50,
    label: 'First Dashboard',
    description: 'Create your first custom dashboard',
    oneTime: true,
  },
  daily_login: {
    type: 'daily_login',
    coins: 10,
    label: 'Daily Login',
    description: 'Log in to earn daily coins',
  },
  complete_onboarding: {
    type: 'complete_onboarding',
    coins: 100,
    label: 'Complete Onboarding',
    description: 'Complete the onboarding tour',
    oneTime: true,
  },
  first_card_add: {
    type: 'first_card_add',
    coins: 25,
    label: 'First Card',
    description: 'Add your first card to a dashboard',
    oneTime: true,
  },
}

// Achievement definitions
export const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'first_steps',
    name: 'First Steps',
    description: 'Complete the onboarding tour',
    icon: 'Footprints',
    requiredAction: 'complete_onboarding',
  },
  {
    id: 'bug_hunter',
    name: 'Bug Hunter',
    description: 'Report your first bug',
    icon: 'Bug',
    requiredAction: 'bug_report',
  },
  {
    id: 'idea_machine',
    name: 'Idea Machine',
    description: 'Submit 5 feature suggestions',
    icon: 'Lightbulb',
    requiredAction: 'feature_suggestion',
    requiredCount: 5,
  },
  {
    id: 'coin_collector',
    name: 'Coin Collector',
    description: 'Earn 1,000 coins',
    icon: 'Coins',
    requiredCoins: 1000,
  },
  {
    id: 'treasure_hunter',
    name: 'Treasure Hunter',
    description: 'Earn 5,000 coins',
    icon: 'Trophy',
    requiredCoins: 5000,
  },
  {
    id: 'community_champion',
    name: 'Community Champion',
    description: 'Invite someone via GitHub',
    icon: 'Users',
    requiredAction: 'github_invite',
  },
  {
    id: 'social_butterfly',
    name: 'Social Butterfly',
    description: 'Share on LinkedIn',
    icon: 'Share2',
    requiredAction: 'linkedin_share',
  },
]

// GitHub-sourced reward types
export type GitHubRewardType =
  | 'issue_bug'
  | 'issue_feature'
  | 'issue_other'
  | 'pr_opened'
  | 'pr_merged'

export interface GitHubContribution {
  type: GitHubRewardType
  title: string
  url: string
  repo: string
  number: number
  points: number
  created_at: string
}

export interface GitHubRewardsBreakdown {
  bug_issues: number
  feature_issues: number
  other_issues: number
  prs_opened: number
  prs_merged: number
}

export interface GitHubRewardsResponse {
  total_points: number
  contributions: GitHubContribution[]
  breakdown: GitHubRewardsBreakdown
  cached_at: string
  from_cache: boolean
}

export const GITHUB_REWARD_POINTS: Record<GitHubRewardType, number> = {
  issue_bug: 300,
  issue_feature: 100,
  issue_other: 50,
  pr_opened: 200,
  pr_merged: 500,
}

export const GITHUB_REWARD_LABELS: Record<GitHubRewardType, string> = {
  issue_bug: 'Bug Report',
  issue_feature: 'Feature Request',
  issue_other: 'Issue',
  pr_opened: 'PR Opened',
  pr_merged: 'PR Merged',
}

// ── Contributor Ladder ──────────────────────────────────────────────

export interface ContributorLevel {
  rank: number
  name: string
  icon: string         // Lucide icon name
  minCoins: number
  color: string        // Tailwind color prefix (e.g., 'gray', 'blue')
  bgClass: string      // Background classes for the badge
  textClass: string    // Text color class
  borderClass: string  // Border color class
}

export const CONTRIBUTOR_LEVELS: ContributorLevel[] = [
  {
    rank: 1,
    name: 'Observer',
    icon: 'Telescope',
    minCoins: 0,
    color: 'gray',
    bgClass: 'bg-gray-500/20',
    textClass: 'text-gray-400',
    borderClass: 'border-gray-500/30',
  },
  {
    rank: 2,
    name: 'Explorer',
    icon: 'Compass',
    minCoins: 100,
    color: 'blue',
    bgClass: 'bg-blue-500/20',
    textClass: 'text-blue-400',
    borderClass: 'border-blue-500/30',
  },
  {
    rank: 3,
    name: 'Navigator',
    icon: 'Map',
    minCoins: 500,
    color: 'cyan',
    bgClass: 'bg-cyan-500/20',
    textClass: 'text-cyan-400',
    borderClass: 'border-cyan-500/30',
  },
  {
    rank: 4,
    name: 'Pilot',
    icon: 'Rocket',
    minCoins: 1500,
    color: 'green',
    bgClass: 'bg-green-500/20',
    textClass: 'text-green-400',
    borderClass: 'border-green-500/30',
  },
  {
    rank: 5,
    name: 'Commander',
    icon: 'Shield',
    minCoins: 3000,
    color: 'purple',
    bgClass: 'bg-purple-500/20',
    textClass: 'text-purple-400',
    borderClass: 'border-purple-500/30',
  },
  {
    rank: 6,
    name: 'Captain',
    icon: 'Star',
    minCoins: 5000,
    color: 'amber',
    bgClass: 'bg-amber-500/20',
    textClass: 'text-amber-400',
    borderClass: 'border-amber-500/30',
  },
  {
    rank: 7,
    name: 'Admiral',
    icon: 'Crown',
    minCoins: 10000,
    color: 'orange',
    bgClass: 'bg-orange-500/20',
    textClass: 'text-orange-400',
    borderClass: 'border-orange-500/30',
  },
  {
    rank: 8,
    name: 'Legend',
    icon: 'Sparkles',
    minCoins: 25000,
    color: 'yellow',
    bgClass: 'bg-gradient-to-r from-yellow-500/20 via-amber-500/20 to-orange-500/20',
    textClass: 'text-yellow-400',
    borderClass: 'border-yellow-500/40',
  },
]

/** Returns the current level and the next level (null if max) */
export function getContributorLevel(totalCoins: number): {
  current: ContributorLevel
  next: ContributorLevel | null
  progress: number // 0-100 percent to next level
  coinsToNext: number
} {
  let current = CONTRIBUTOR_LEVELS[0]
  let next: ContributorLevel | null = null

  for (let i = CONTRIBUTOR_LEVELS.length - 1; i >= 0; i--) {
    if (totalCoins >= CONTRIBUTOR_LEVELS[i].minCoins) {
      current = CONTRIBUTOR_LEVELS[i]
      next = i < CONTRIBUTOR_LEVELS.length - 1 ? CONTRIBUTOR_LEVELS[i + 1] : null
      break
    }
  }

  if (!next) {
    return { current, next: null, progress: 100, coinsToNext: 0 }
  }

  const rangeStart = current.minCoins
  const rangeEnd = next.minCoins
  const coinsInRange = totalCoins - rangeStart
  const rangeSize = rangeEnd - rangeStart
  const progress = Math.min(100, Math.round((coinsInRange / rangeSize) * 100))
  const coinsToNext = rangeEnd - totalCoins

  return { current, next, progress, coinsToNext }
}
