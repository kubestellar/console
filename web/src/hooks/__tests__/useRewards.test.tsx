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

function seedRewards(userId: string, overrides: Record<string, unknown> = {}) {
  const defaults = {
    userId,
    totalCoins: 0,
    lifetimeCoins: 0,
    events: [],
    achievements: [],
    lastUpdated: new Date().toISOString(),
  }
  const rewards = { ...defaults, ...overrides }
  const stored = { [userId]: rewards }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
  return rewards
}

function makeEvent(action: string, coins: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `evt-${Date.now()}-${Math.random()}`,
    userId: 'user-1',
    action,
    coins,
    timestamp: new Date().toISOString(),
    ...overrides,
  }
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

  // ──────────────────────── Fallback outside provider ────────────────────────

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

  it('fallback refreshGitHubRewards is callable and resolves', async () => {
    const { result } = renderHook(() => useRewards())
    await expect(result.current.refreshGitHubRewards()).resolves.toBeUndefined()
  })

  // ──────────────────────── Initialization ────────────────────────

  it('initializes new user rewards on first load', () => {
    const { result } = renderHook(() => useRewards(), { wrapper })
    expect(result.current.rewards).not.toBeNull()
    expect(result.current.rewards!.userId).toBe('user-1')
    expect(result.current.rewards!.totalCoins).toBe(0)
    expect(result.current.rewards!.events).toEqual([])
    expect(result.current.isLoading).toBe(false)
  })

  it('loads existing rewards from localStorage', () => {
    seedRewards('user-1', {
      totalCoins: 500,
      lifetimeCoins: 500,
      events: [makeEvent('bug_report', 300)],
    })

    const { result } = renderHook(() => useRewards(), { wrapper })
    expect(result.current.rewards!.totalCoins).toBe(500)
    expect(result.current.rewards!.events.length).toBe(1)
  })

  it('handles malformed localStorage data gracefully', () => {
    localStorage.setItem(STORAGE_KEY, 'not-valid-json')
    const { result } = renderHook(() => useRewards(), { wrapper })
    expect(result.current.rewards!.totalCoins).toBe(0)
  })

  it('saves initial rewards to localStorage for new user', () => {
    renderHook(() => useRewards(), { wrapper })
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
    expect(stored['user-1']).toBeDefined()
    expect(stored['user-1'].userId).toBe('user-1')
    expect(stored['user-1'].totalCoins).toBe(0)
  })

  it('preserves rewards for other users when initializing a new one', () => {
    // Pre-seed another user
    const existing = {
      'other-user': {
        userId: 'other-user',
        totalCoins: 1000,
        lifetimeCoins: 1000,
        events: [],
        achievements: [],
        lastUpdated: new Date().toISOString(),
      },
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(existing))

    renderHook(() => useRewards(), { wrapper })
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
    expect(stored['other-user'].totalCoins).toBe(1000)
    expect(stored['user-1']).toBeDefined()
  })

  // ──────────────────────── awardCoins ────────────────────────

  it('awards coins for a valid action', () => {
    const { result } = renderHook(() => useRewards(), { wrapper })
    let success = false
    act(() => { success = result.current.awardCoins('bug_report') })
    expect(success).toBe(true)
    expect(result.current.rewards!.totalCoins).toBe(300)
    expect(result.current.rewards!.lifetimeCoins).toBe(300)
    expect(result.current.rewards!.events.length).toBe(1)
    expect(result.current.rewards!.events[0].action).toBe('bug_report')
  })

  it('awards correct coins for each action type', () => {
    const actionCoins: Record<string, number> = {
      bug_report: 300,
      feature_suggestion: 100,
      github_invite: 500,
      linkedin_share: 200,
      first_dashboard: 50,
      daily_login: 10,
      complete_onboarding: 100,
      first_card_add: 25,
    }

    for (const [action, expectedCoins] of Object.entries(actionCoins)) {
      localStorage.clear()
      const { result } = renderHook(() => useRewards(), { wrapper })
      act(() => { result.current.awardCoins(action as Parameters<typeof result.current.awardCoins>[0]) })
      expect(result.current.rewards!.totalCoins).toBe(expectedCoins)
    }
  })

  it('blocks one-time reward from being earned twice', () => {
    const { result } = renderHook(() => useRewards(), { wrapper })
    act(() => { result.current.awardCoins('github_invite') })
    expect(result.current.rewards!.totalCoins).toBe(500)
    let second = false
    act(() => { second = result.current.awardCoins('github_invite') })
    expect(second).toBe(false)
    expect(result.current.rewards!.totalCoins).toBe(500)
  })

  it('blocks all one-time rewards from double-earning', () => {
    const oneTimeActions = ['github_invite', 'first_dashboard', 'complete_onboarding', 'first_card_add'] as const
    for (const action of oneTimeActions) {
      localStorage.clear()
      const { result } = renderHook(() => useRewards(), { wrapper })
      act(() => { result.current.awardCoins(action) })
      let second = false
      act(() => { second = result.current.awardCoins(action) })
      expect(second).toBe(false)
    }
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

  it('awardCoins passes metadata through to event', () => {
    const { result } = renderHook(() => useRewards(), { wrapper })
    act(() => { result.current.awardCoins('bug_report', { issueUrl: 'https://github.com/...' }) })
    expect(result.current.rewards!.events[0].metadata).toEqual({ issueUrl: 'https://github.com/...' })
  })

  it('awardCoins updates lastUpdated timestamp', () => {
    // Seed with a known old timestamp so the comparison is stable
    seedRewards('user-1', {
      lastUpdated: '2020-01-01T00:00:00.000Z',
    })
    const { result } = renderHook(() => useRewards(), { wrapper })
    expect(result.current.rewards!.lastUpdated).toBe('2020-01-01T00:00:00.000Z')
    act(() => { result.current.awardCoins('daily_login') })
    expect(result.current.rewards!.lastUpdated).not.toBe('2020-01-01T00:00:00.000Z')
  })

  it('newest event is prepended to the events array', () => {
    const { result } = renderHook(() => useRewards(), { wrapper })
    act(() => { result.current.awardCoins('daily_login') })
    act(() => { result.current.awardCoins('bug_report') })
    expect(result.current.rewards!.events[0].action).toBe('bug_report')
    expect(result.current.rewards!.events[1].action).toBe('daily_login')
  })

  // ──────────────────────── hasEarnedAction ────────────────────────

  it('hasEarnedAction returns true after earning', () => {
    const { result } = renderHook(() => useRewards(), { wrapper })
    expect(result.current.hasEarnedAction('bug_report')).toBe(false)
    act(() => { result.current.awardCoins('bug_report') })
    expect(result.current.hasEarnedAction('bug_report')).toBe(true)
  })

  it('hasEarnedAction returns false when rewards is null', () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, isAuthenticated: false } as unknown as ReturnType<typeof useAuth>)
    const { result } = renderHook(() => useRewards(), { wrapper })
    expect(result.current.hasEarnedAction('bug_report')).toBe(false)
  })

  // ──────────────────────── getActionCount ────────────────────────

  it('getActionCount tracks repeated actions', () => {
    const { result } = renderHook(() => useRewards(), { wrapper })
    expect(result.current.getActionCount('daily_login')).toBe(0)
    act(() => { result.current.awardCoins('daily_login') })
    act(() => { result.current.awardCoins('daily_login') })
    act(() => { result.current.awardCoins('daily_login') })
    expect(result.current.getActionCount('daily_login')).toBe(3)
  })

  it('getActionCount returns 0 when rewards is null', () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, isAuthenticated: false } as unknown as ReturnType<typeof useAuth>)
    const { result } = renderHook(() => useRewards(), { wrapper })
    expect(result.current.getActionCount('daily_login')).toBe(0)
  })

  it('getActionCount counts only the requested action type', () => {
    const { result } = renderHook(() => useRewards(), { wrapper })
    act(() => { result.current.awardCoins('daily_login') })
    act(() => { result.current.awardCoins('bug_report') })
    act(() => { result.current.awardCoins('daily_login') })
    expect(result.current.getActionCount('daily_login')).toBe(2)
    expect(result.current.getActionCount('bug_report')).toBe(1)
  })

  // ──────────────────────── recentEvents ────────────────────────

  it('recentEvents returns last 10 events', () => {
    const { result } = renderHook(() => useRewards(), { wrapper })
    for (let i = 0; i < 15; i++) {
      act(() => { result.current.awardCoins('daily_login') })
    }
    expect(result.current.recentEvents.length).toBe(10)
  })

  it('recentEvents is empty when no events exist', () => {
    const { result } = renderHook(() => useRewards(), { wrapper })
    expect(result.current.recentEvents).toEqual([])
  })

  it('recentEvents returns all events when fewer than 10', () => {
    const { result } = renderHook(() => useRewards(), { wrapper })
    act(() => { result.current.awardCoins('daily_login') })
    act(() => { result.current.awardCoins('bug_report') })
    expect(result.current.recentEvents.length).toBe(2)
  })

  // ──────────────────────── Achievements ────────────────────────

  it('unlocks coin-based achievement (coin_collector at 1000)', () => {
    const { result } = renderHook(() => useRewards(), { wrapper })
    // bug_report = 300 coins. 4 x 300 = 1200 >= 1000
    act(() => { result.current.awardCoins('bug_report') })
    act(() => { result.current.awardCoins('bug_report') })
    act(() => { result.current.awardCoins('bug_report') })
    act(() => { result.current.awardCoins('bug_report') })
    expect(result.current.rewards!.achievements).toContain('coin_collector')
    expect(result.current.earnedAchievements.some(a => a.id === 'coin_collector')).toBe(true)
  })

  it('unlocks action-based achievement (bug_hunter after 1 bug_report)', () => {
    const { result } = renderHook(() => useRewards(), { wrapper })
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

  it('does not unlock idea_machine with only 4 feature_suggestions', () => {
    const { result } = renderHook(() => useRewards(), { wrapper })
    for (let i = 0; i < 4; i++) {
      act(() => { result.current.awardCoins('feature_suggestion') })
    }
    expect(result.current.rewards!.achievements).not.toContain('idea_machine')
  })

  it('does not duplicate already-earned achievements', () => {
    const { result } = renderHook(() => useRewards(), { wrapper })
    act(() => { result.current.awardCoins('bug_report') })
    act(() => { result.current.awardCoins('bug_report') })
    const achCount = result.current.rewards!.achievements.filter(a => a === 'bug_hunter').length
    expect(achCount).toBe(1)
  })

  it('unlocks community_champion on github_invite', () => {
    const { result } = renderHook(() => useRewards(), { wrapper })
    act(() => { result.current.awardCoins('github_invite') })
    expect(result.current.rewards!.achievements).toContain('community_champion')
  })

  it('unlocks social_butterfly on linkedin_share', () => {
    const { result } = renderHook(() => useRewards(), { wrapper })
    act(() => { result.current.awardCoins('linkedin_share') })
    expect(result.current.rewards!.achievements).toContain('social_butterfly')
  })

  it('unlocks first_steps on complete_onboarding', () => {
    const { result } = renderHook(() => useRewards(), { wrapper })
    act(() => { result.current.awardCoins('complete_onboarding') })
    expect(result.current.rewards!.achievements).toContain('first_steps')
  })

  it('can unlock multiple achievements in one award if thresholds are met', () => {
    // Pre-seed with 900 lifetime coins so the next bug_report (300) crosses both
    // bug_hunter and coin_collector thresholds
    seedRewards('user-1', {
      totalCoins: 900,
      lifetimeCoins: 900,
      events: [],
      achievements: [],
    })

    const { result } = renderHook(() => useRewards(), { wrapper })
    act(() => { result.current.awardCoins('bug_report') })
    expect(result.current.rewards!.achievements).toContain('bug_hunter')
    expect(result.current.rewards!.achievements).toContain('coin_collector')
  })

  it('earnedAchievements is empty when no rewards', () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, isAuthenticated: false } as unknown as ReturnType<typeof useAuth>)
    const { result } = renderHook(() => useRewards(), { wrapper })
    expect(result.current.earnedAchievements).toEqual([])
  })

  it('skips already-earned achievements during check', () => {
    // Pre-seed user with bug_hunter already earned
    seedRewards('user-1', {
      totalCoins: 300,
      lifetimeCoins: 300,
      events: [makeEvent('bug_report', 300)],
      achievements: ['bug_hunter'],
    })

    const { result } = renderHook(() => useRewards(), { wrapper })
    // Award another bug report. Bug hunter should NOT be re-added.
    act(() => { result.current.awardCoins('bug_report') })
    const count = result.current.rewards!.achievements.filter(a => a === 'bug_hunter').length
    expect(count).toBe(1)
  })

  // ──────────────────────── Events cap (MAX_REWARD_EVENTS = 100) ────────────────────────

  it('caps events at 100', () => {
    const { result } = renderHook(() => useRewards(), { wrapper })
    for (let i = 0; i < 110; i++) {
      act(() => { result.current.awardCoins('daily_login') })
    }
    expect(result.current.rewards!.events.length).toBeLessThanOrEqual(100)
  })

  // ──────────────────────── Persistence ────────────────────────

  it('persists rewards to localStorage after awarding', () => {
    const { result } = renderHook(() => useRewards(), { wrapper })
    act(() => { result.current.awardCoins('bug_report') })
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
    expect(stored['user-1'].totalCoins).toBe(300)
    expect(stored['user-1'].events.length).toBe(1)
  })

  it('persists achievements to localStorage', () => {
    const { result } = renderHook(() => useRewards(), { wrapper })
    act(() => { result.current.awardCoins('bug_report') })
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
    expect(stored['user-1'].achievements).toContain('bug_hunter')
  })

  // ──────────────────────── GitHub rewards dedup ────────────────────────

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
    expect(result.current.totalCoins).toBe(1000)
  })

  it('deduplicates bug_report overlap between local and GitHub', () => {
    seedRewards('user-1', {
      totalCoins: 300,
      lifetimeCoins: 300,
      events: [makeEvent('bug_report', 300)],
    })

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

  it('deduplicates feature_suggestion overlap between local and GitHub', () => {
    seedRewards('user-1', {
      totalCoins: 200,
      lifetimeCoins: 200,
      events: [
        makeEvent('feature_suggestion', 100),
        makeEvent('feature_suggestion', 100),
      ],
    })

    vi.mocked(useGitHubRewards).mockReturnValue({
      githubRewards: {
        total_points: 100,
        contributions: [],
        breakdown: { bug_issues: 0, feature_issues: 1, other_issues: 0, prs_opened: 0, prs_merged: 0 },
        cached_at: new Date().toISOString(),
        from_cache: false,
      },
      githubPoints: 100,
      refresh: vi.fn(),
    })

    const { result } = renderHook(() => useRewards(), { wrapper })
    // Local: 200 - dedup(min(2,1)*100 = 100) + GitHub: 100 = 200
    expect(result.current.totalCoins).toBe(200)
  })

  it('deduplicates both bug_report and feature_suggestion overlaps', () => {
    seedRewards('user-1', {
      totalCoins: 700,
      lifetimeCoins: 700,
      events: [
        makeEvent('bug_report', 300),
        makeEvent('bug_report', 300),
        makeEvent('feature_suggestion', 100),
      ],
    })

    vi.mocked(useGitHubRewards).mockReturnValue({
      githubRewards: {
        total_points: 400,
        contributions: [],
        breakdown: { bug_issues: 1, feature_issues: 1, other_issues: 0, prs_opened: 0, prs_merged: 0 },
        cached_at: new Date().toISOString(),
        from_cache: false,
      },
      githubPoints: 400,
      refresh: vi.fn(),
    })

    const { result } = renderHook(() => useRewards(), { wrapper })
    // Local: 700 - dedup(min(2,1)*300 + min(1,1)*100 = 400) + GitHub: 400 = 700
    expect(result.current.totalCoins).toBe(700)
  })

  it('mergedTotalCoins never goes negative', () => {
    seedRewards('user-1', {
      totalCoins: 100,
      lifetimeCoins: 100,
      events: [makeEvent('bug_report', 300)],
    })

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
    expect(result.current.totalCoins).toBe(300)
  })

  it('does not dedup when githubRewards is null', () => {
    seedRewards('user-1', {
      totalCoins: 300,
      lifetimeCoins: 300,
      events: [makeEvent('bug_report', 300)],
    })

    vi.mocked(useGitHubRewards).mockReturnValue({
      githubRewards: null,
      githubPoints: 0,
      refresh: vi.fn(),
    })

    const { result } = renderHook(() => useRewards(), { wrapper })
    expect(result.current.totalCoins).toBe(300)
  })

  it('dedup uses min overlap so local-only events are not deducted', () => {
    // 3 local bug reports, but GitHub only knows about 1
    seedRewards('user-1', {
      totalCoins: 900,
      lifetimeCoins: 900,
      events: [
        makeEvent('bug_report', 300),
        makeEvent('bug_report', 300),
        makeEvent('bug_report', 300),
      ],
    })

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
    // Local: 900 - dedup(min(3,1)*300 = 300) + GitHub: 300 = 900
    expect(result.current.totalCoins).toBe(900)
  })

  // ──────────────────────── No user ────────────────────────

  it('sets rewards to null when no user', () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, isAuthenticated: false } as unknown as ReturnType<typeof useAuth>)
    const { result } = renderHook(() => useRewards(), { wrapper })
    expect(result.current.rewards).toBeNull()
    expect(result.current.isLoading).toBe(false)
  })

  // ──────────────────────── refreshGitHubRewards ────────────────────────

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

  // ──────────────────────── localStorage save error handling ────────────────────────

  it('handles localStorage.setItem failure gracefully during save', () => {
    const { result } = renderHook(() => useRewards(), { wrapper })

    // Make localStorage.setItem throw (quota exceeded)
    const originalSetItem = localStorage.setItem.bind(localStorage)
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })

    // awardCoins should still succeed (state updates even if save fails)
    let success = false
    act(() => { success = result.current.awardCoins('daily_login') })
    expect(success).toBe(true)
    expect(result.current.rewards!.totalCoins).toBe(10)

    // Restore
    vi.mocked(localStorage.setItem).mockImplementation(originalSetItem)
  })

  // ──────────────────────── totalCoins with mixed sources ────────────────────────

  it('totalCoins = localCoins when no githubRewards data', () => {
    const { result } = renderHook(() => useRewards(), { wrapper })
    act(() => { result.current.awardCoins('daily_login') })
    expect(result.current.totalCoins).toBe(10)
  })

  it('totalCoins includes github points plus non-overlapping local coins', () => {
    // Award 2 daily_logins (10 each = 20) locally, no overlap with GitHub
    const { result } = renderHook(() => useRewards(), { wrapper })
    act(() => { result.current.awardCoins('daily_login') })
    act(() => { result.current.awardCoins('daily_login') })

    vi.mocked(useGitHubRewards).mockReturnValue({
      githubRewards: {
        total_points: 500,
        contributions: [],
        breakdown: { bug_issues: 0, feature_issues: 0, other_issues: 0, prs_opened: 1, prs_merged: 0 },
        cached_at: new Date().toISOString(),
        from_cache: false,
      },
      githubPoints: 500,
      refresh: vi.fn(),
    })

    // Re-render to pick up new mock
    const { result: result2 } = renderHook(() => useRewards(), { wrapper })
    // daily_login has no overlap dedup (not bug_report or feature_suggestion)
    // so total = 20 + 500 = 520
    expect(result2.current.totalCoins).toBe(520)
  })
})
