/**
 * Types and constants for the github-rewards Netlify function.
 */

export const LEADERBOARD_URL = "https://kubestellar.io/data/leaderboard.json";
export const CACHE_STORE = "github-rewards";
/** Cache the full leaderboard for 1 hour — it only changes once daily */
export const LEADERBOARD_CACHE_TTL_MS = 60 * 60 * 1_000;
export const LEADERBOARD_CACHE_KEY = "__leaderboard__";
/** Request timeout for fetching leaderboard JSON */
export const FETCH_TIMEOUT_MS = 15_000;
/** Maximum upstream response size (512 KB) */
export const MAX_RESPONSE_BYTES = 512_000;

export interface LeaderboardBreakdown {
  bug_issues: number;
  feature_issues: number;
  other_issues: number;
  prs_opened: number;
  prs_merged: number;
}

export interface LeaderboardEntry {
  login: string;
  avatar_url: string;
  total_points: number;
  level: string;
  level_rank: number;
  breakdown: LeaderboardBreakdown;
  bonus_points: number;
  rank: number;
}

export interface LeaderboardData {
  generated_at: string;
  git_hash: string;
  entries: LeaderboardEntry[];
}

export interface LeaderboardCacheEntry {
  data: LeaderboardData;
  storedAt: number;
}

export interface GitHubRewardsResponse {
  total_points: number;
  contributions: readonly never[];
  breakdown: LeaderboardBreakdown;
  bonus_points: number;
  level: string;
  rank: number;
  cached_at: string;
  leaderboard_generated_at: string;
  from_cache: boolean;
}
