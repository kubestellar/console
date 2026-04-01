import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// ---------- Mocks ----------

vi.mock('../../lib/analytics', () => ({
  emitEvent: vi.fn(),
  emitRewardUnlocked: vi.fn(),
}))

vi.mock('../useDemoMode', () => ({
  getDemoMode: vi.fn(() => false),
  useDemoMode: vi.fn(() => ({ isDemoMode: false })),
}))

const mockUser = { id: 'user-1', github_login: 'testuser' }
vi.mock('../../lib/auth', () => ({
  useAuth: vi.fn(() => ({ user: mockUser, isAuthenticated: true })),
}))

vi.mock('../useGitHubRewards', () => ({
  useGitHubRewards: vi.fn(() => ({
    githubRewards: null,
    githubPoints: 0,
    refresh: vi.fn(),
  })),
}))

import { useRewards, RewardsProvider } from '../useRewards'
import { useGitHubRewards } from '../useGitHubRewards'
import { useAuth } from '../../lib/auth'

// ---------- Helpers ----------

const STORAGE_KEY = 'kubestellar-rewards'

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(RewardsProvider, null, children)
}

// ---------- Tests ----------

describe('useRewards', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue({ user: mockUser, isAuthenticated: true } as ReturnType<typeof useAuth>)
    vi.mocked(useGitHubRewards).mockReturnValue({
      githubRewards: null,
      githubPoints: 0,
      refresh: vi.fn(),
    })
  })

  // --- Fallback outside provider ---
  it('returns safe fallback when called outside RewardsProvider', () => {
    const { result } = renderHook(() => useRewards())
    expect(result.current.rewards).toBeNull()
    expect(result.current.totalCoins).toBe(0)
    expect(result.current.earnedAchievements).toEqual([])
    expect(result.current.isLoading).toBe(false)
    expect(result.current.awardCoins('bug_report')).toBe(false)
    expect(result.current.hasEarnedAction('bug_report')).toBe(false)
    expect(result.current.getActionCount('bug_report')).toBe(0)
    expect(result.current.recentEvents).toEqual([])
    expect(result.current.githubRewards).toBeNull()
    expect(result.current.githubPoints).toBe(0)
  })

  // --- Inside provider ---
  it('initializes new user rewards on first load', () => {
    const { result } = renderHook(() => useRewards(), { wrapper })
    expect(result.current.rewards).not.toBeNull()
    expect(result.current.rewards!.userId).toBe('user-1')
    expect(result.current.rewards!.totalCoins).toBe(0)
    expect(result.current.rewards!.events).toEqual([])
    expect(result.current.isLoading).toBe(false)
  })

  it('loads existing rewards from localStorage', () => {
    const existing = {
      'user-1': {
        userId: 'user-1',
        totalCoins: 500,
        lifetimeCoins: 500,
        events: [{ id: 'e1', userId: 'user-1', action: 'bug_report', coins: 300, timestamp: new Date().toISOString() }],
        achievements: [],
        lastUpdated: new Date().toISOString(),
      },
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(existing))

    const { result } = renderHook(() => useRewards(), { wrapper })
    expect(result.current.rewards!.totalCoins).toBe(500)
    expect(result.current.rewards!.events.length).toBe(1)
  })

  it('handles malformed localStorage data', () => {
    localStorage.setItem(STORAGE_KEY, 'not-valid-json')
    const { result } = renderHook(() => useRewards(), { wrapper })
    // Should initialize fresh rewards
    expect(result.current.rewards!.totalCoins).toBe(0)
  })

  // --- awardCoins ---
  it('awards coins for a valid action', () => {
    const { result } = renderHook(() => useRewards(), { wrapper })
    let success = false
    act(() => { success = result.current.awardCoins('bug_report') })
    expect(success).toBe(true)
    expect(result.current.rewards!.totalCoins).toBe(300)
    expect(result.current.rewards!.events.length).toBe(1)
    expect(result.current.rewards!.events[0].action).toBe('bug_report')
  })

  it('blocks one-time reward from being earned twice', () => {
    const { result } = renderHook(() => useRewards(), { wrapper })
    // github_invite is oneTime: true
    act(() => { result.current.awardCoins('github_invite') })
    expect(result.current.rewards!.totalCoins).toBe(500)
    let second = false
    act(() => { second = result.current.awardCoins('github_invite') })
    expect(second).toBe(false)
    expect(result.current.rewards!.totalCoins).toBe(500) // no double-award
  })

  it('allows repeatable rewards multiple times', () => {
    const { result } = renderHook(() => useRewards(), { wrapper })
    act(() => { result.current.awardCoins('bug_report') })
    act(() => { result.current.awardCoins('bug_report') })
    expect(result.current.rewards!.totalCoins).toBe(600)
    expect(result.current.rewards!.events.length).toBe(2)
  })

  it('returns false for unknown action type', () => {
    const { result } = renderHook(() => useRewards(), { wrapper })
    let success = false
    act(() => { success = result.current.awardCoins('nonexistent_action' as 'bug_report') })
    expect(success).toBe(false)
  })

  it('returns false when rewards is null (no user)', () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, isAuthenticated: false } as unknown as ReturnType<typeof useAuth>)
    const { result } = renderHook(() => useRewards(), { wrapper })
    let success = false
    act(() => { success = result.current.awardCoins('bug_report') })
    expect(success).toBe(false)
  })

  // --- hasEarnedAction ---
  it('hasEarnedAction returns true after earning', () => {
    const { result } = renderHook(() => useRewards(), { wrapper })
    expect(result.current.hasEarnedAction('bug_report')).toBe(false)
    act(() => { result.current.awardCoins('bug_report') })
    expect(result.current.hasEarnedAction('bug_report')).toBe(true)
  })

  // --- getActionCount ---
  it('getActionCount tracks repeated actions', () => {
    const { result } = renderHook(() => useRewards(), { wrapper })
    expect(result.current.getActionCount('daily_login')).toBe(0)
    act(() => { result.current.awardCoins('daily_login') })
    act(() => { result.current.awardCoins('daily_login') })
    act(() => { result.current.awardCoins('daily_login') })
    expect(result.current.getActionCount('daily_login')).toBe(3)
  })

  // --- recentEvents ---
  it('recentEvents returns last 10 events', () => {
    const { result } = renderHook(() => useRewards(), { wrapper })
    // Award 15 actions
    for (let i = 0; i < 15; i++) {
      act(() => { result.current.awardCoins('daily_login') })
    }
    expect(result.current.recentEvents.length).toBe(10)
  })

  // --- Achievements ---
  it('unlocks coin-based achievement', () => {
    const { result } = renderHook(() => useRewards(), { wrapper })
    // coin_collector requires 1000 coins. bug_report = 300, so 4 reports = 1200
    act(() => { result.current.awardCoins('bug_report') })
    act(() => { result.current.awardCoins('bug_report') })
    act(() => { result.current.awardCoins('bug_report') })
    act(() => { result.current.awardCoins('bug_report') })
    expect(result.current.rewards!.achievements).toContain('coin_collector')
    expect(result.current.earnedAchievements.some(a => a.id === 'coin_collector')).toBe(true)
  })

  it('unlocks action-based achievement', () => {
    const { result } = renderHook(() => useRewards(), { wrapper })
    // bug_hunter requires 1 bug_report action
    act(() => { result.current.awardCoins('bug_report') })
    expect(result.current.rewards!.achievements).toContain('bug_hunter')
  })

  it('unlocks achievement requiring count (idea_machine needs 5 feature_suggestions)', () => {
    const { result } = renderHook(() => useRewards(), { wrapper })
    for (let i = 0; i < 5; i++) {
      act(() => { result.current.awardCoins('feature_suggestion') })
    }
    expect(result.current.rewards!.achievements).toContain('idea_machine')
  })

  it('does not duplicate already-earned achievements', () => {
    const { result } = renderHook(() => useRewards(), { wrapper })
    act(() => { result.current.awardCoins('bug_report') })
    act(() => { result.current.awardCoins('bug_report') })
    const achCount = result.current.rewards!.achievements.filter(a => a === 'bug_hunter').length
    expect(achCount).toBe(1)
  })

  // --- Events cap at MAX_REWARD_EVENTS (100) ---
  it('caps events at 100', () => {
    const { result } = renderHook(() => useRewards(), { wrapper })
    for (let i = 0; i < 110; i++) {
      act(() => { result.current.awardCoins('daily_login') })
    }
    expect(result.current.rewards!.events.length).toBeLessThanOrEqual(100)
  })

  // --- Persistence ---
  it('persists rewards to localStorage after awarding', () => {
    const { result } = renderHook(() => useRewards(), { wrapper })
    act(() => { result.current.awardCoins('bug_report') })
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
    expect(stored['user-1'].totalCoins).toBe(300)
  })

  // --- GitHub rewards dedup ---
  it('merges GitHub points with local coins', () => {
    vi.mocked(useGitHubRewards).mockReturnValue({
      githubRewards: {
        total_points: 1000,
        contributions: [],
        breakdown: { bug_issues: 0, feature_issues: 0, other_issues: 0, prs_opened: 0, prs_merged: 0 },
        cached_at: new Date().toISOString(),
        from_cache: false,
      },
      githubPoints: 1000,
      refresh: vi.fn(),
    })

    const { result } = renderHook(() => useRewards(), { wrapper })
    // No local coins + 1000 GitHub points
    expect(result.current.totalCoins).toBe(1000)
  })

  it('deduplicates bug_report overlap between local and GitHub', () => {
    // Pre-seed with 1 local bug_report event
    const existing = {
      'user-1': {
        userId: 'user-1',
        totalCoins: 300,
        lifetimeCoins: 300,
        events: [{ id: 'e1', userId: 'user-1', action: 'bug_report', coins: 300, timestamp: new Date().toISOString() }],
        achievements: [],
        lastUpdated: new Date().toISOString(),
      },
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(existing))

    vi.mocked(useGitHubRewards).mockReturnValue({
      githubRewards: {
        total_points: 300,
        contributions: [],
        breakdown: { bug_issues: 1, feature_issues: 0, other_issues: 0, prs_opened: 0, prs_merged: 0 },
        cached_at: new Date().toISOString(),
        from_cache: false,
      },
      githubPoints: 300,
      refresh: vi.fn(),
    })

    const { result } = renderHook(() => useRewards(), { wrapper })
    // Local: 300 - dedup(1*300) + GitHub: 300 = 300 (not 600)
    expect(result.current.totalCoins).toBe(300)
  })

  it('mergedTotalCoins never goes negative', () => {
    // Edge case: dedup offset could theoretically exceed local coins
    const existing = {
      'user-1': {
        userId: 'user-1',
        totalCoins: 100,
        lifetimeCoins: 100,
        events: [
          { id: 'e1', userId: 'user-1', action: 'bug_report', coins: 300, timestamp: new Date().toISOString() },
        ],
        achievements: [],
        lastUpdated: new Date().toISOString(),
      },
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(existing))

    vi.mocked(useGitHubRewards).mockReturnValue({
      githubRewards: {
        total_points: 300,
        contributions: [],
        breakdown: { bug_issues: 1, feature_issues: 0, other_issues: 0, prs_opened: 0, prs_merged: 0 },
        cached_at: new Date().toISOString(),
        from_cache: false,
      },
      githubPoints: 300,
      refresh: vi.fn(),
    })

    const { result } = renderHook(() => useRewards(), { wrapper })
    // Math.max(0, 100 - 300) + 300 = 300
    expect(result.current.totalCoins).toBeGreaterThanOrEqual(0)
  })

  // --- No user = null rewards ---
  it('sets rewards to null when no user', () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, isAuthenticated: false } as unknown as ReturnType<typeof useAuth>)
    const { result } = renderHook(() => useRewards(), { wrapper })
    expect(result.current.rewards).toBeNull()
    expect(result.current.isLoading).toBe(false)
  })

  // --- earnedAchievements is empty when no rewards ---
  it('earnedAchievements is empty when rewards is null', () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, isAuthenticated: false } as unknown as ReturnType<typeof useAuth>)
    const { result } = renderHook(() => useRewards(), { wrapper })
    expect(result.current.earnedAchievements).toEqual([])
  })

  // --- refreshGitHubRewards ---
  it('exposes refreshGitHubRewards from context', () => {
    const mockRefresh = vi.fn()
    vi.mocked(useGitHubRewards).mockReturnValue({
      githubRewards: null,
      githubPoints: 0,
      refresh: mockRefresh,
    })
    const { result } = renderHook(() => useRewards(), { wrapper })
    expect(result.current.refreshGitHubRewards).toBeTypeOf('function')
  })

  // --- awardCoins with metadata ---
  it('awardCoins passes metadata through to event', () => {
    const { result } = renderHook(() => useRewards(), { wrapper })
    act(() => { result.current.awardCoins('bug_report', { issueUrl: 'https://github.com/...' }) })
    expect(result.current.rewards!.events[0].metadata).toEqual({ issueUrl: 'https://github.com/...' })
  })
})
