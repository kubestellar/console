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
