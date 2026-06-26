/**
 * Pure-function coverage for useRewards.tsx
 *
 * The functions checkAchievements, resolveRewardsUserId, and generateId are
 * module-private. We exercise them indirectly through the RewardsProvider
 * (which calls them internally) by observing their effects on the public API.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { renderHook, act } from '@testing-library/react'

// ---------- Mocks ----------

const mockGetDemoMode = vi.fn(() => false)
vi.mock('../../lib/demoMode', () => ({
  getDemoMode: () => mockGetDemoMode(),
}))

vi.mock('../../lib/analytics', () => ({
  emitEvent: vi.fn(),
  emitRewardUnlocked: vi.fn(),
}))

const mockUser = { id: 'test-user-123', github_login: 'tester' }
const mockUseAuth = vi.fn(() => ({ user: mockUser, isAuthenticated: true }))
vi.mock('../../lib/auth', () => ({
  useAuth: () => mockUseAuth(),
}))

vi.mock('../useGitHubRewards', () => ({
  useGitHubRewards: vi.fn(() => ({
    githubRewards: null,
    githubPoints: 0,
    refresh: vi.fn(),
  })),
}))

vi.mock('../useBonusPoints', () => ({
  useBonusPoints: vi.fn(() => ({ bonusPoints: 0 })),
}))

vi.mock('../../lib/rewardsApi', () => ({
  getUserRewards: vi.fn(() => Promise.reject(new Error('not authed'))),
  incrementCoins: vi.fn(() => Promise.resolve()),
  RewardsUnauthenticatedError: class extends Error {},
}))

import { useRewards, RewardsProvider, ACHIEVEMENTS } from '../useRewards'

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
  const all: Record<string, unknown> = {}
  all[userId] = { ...defaults, ...overrides }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
}

// ---------- Tests ----------

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  mockGetDemoMode.mockReturnValue(false)
  mockUseAuth.mockReturnValue({ user: mockUser, isAuthenticated: true })
})

// ── generateId (tested indirectly through event id format) ──────────

describe('generateId (indirect)', () => {
  it('produces event ids in timestamp-random format', () => {
    const { result } = renderHook(() => useRewards(), { wrapper })
    act(() => {
      result.current.awardCoins('daily_login')
    })
    const event = result.current.recentEvents[0]
    expect(event).toBeDefined()
    // Format: "<timestamp>-<alphanumeric>"
    expect(event.id).toMatch(/^\d+-[a-z0-9]+$/)
  })

  it('generates unique ids across multiple awards', () => {
    const { result } = renderHook(() => useRewards(), { wrapper })
    act(() => {
      result.current.awardCoins('daily_login')
    })
    act(() => {
      result.current.awardCoins('daily_login')
    })
    const ids = result.current.recentEvents.map(e => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

// ── resolveRewardsUserId (tested indirectly through demo mode behavior) ──

describe('resolveRewardsUserId (indirect)', () => {
  it('uses the real user id in normal mode', () => {
    mockGetDemoMode.mockReturnValue(false)
    const { result } = renderHook(() => useRewards(), { wrapper })
    act(() => {
      result.current.awardCoins('daily_login')
    })
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    expect(stored['test-user-123']).toBeDefined()
    expect(stored['demo-user']).toBeUndefined()
  })

  it('collapses to demo-user when getDemoMode returns true', () => {
    mockGetDemoMode.mockReturnValue(true)
    const { result } = renderHook(() => useRewards(), { wrapper })
    act(() => {
      result.current.awardCoins('daily_login')
    })
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    expect(stored['demo-user']).toBeDefined()
  })

  it('collapses to demo-user when userId is "demo-user"', () => {
    mockGetDemoMode.mockReturnValue(false)
    mockUseAuth.mockReturnValue({ user: { id: 'demo-user', github_login: 'demo' }, isAuthenticated: true })
    const { result } = renderHook(() => useRewards(), { wrapper })
    act(() => {
      result.current.awardCoins('daily_login')
    })
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    expect(stored['demo-user']).toBeDefined()
  })

  it('returns null rewards when no user is present', () => {
    mockUseAuth.mockReturnValue({ user: null, isAuthenticated: false })
    const { result } = renderHook(() => useRewards(), { wrapper })
    expect(result.current.rewards).toBeNull()
    expect(result.current.totalCoins).toBe(0)
  })

  it('returns null rewards when user id is undefined', () => {
    mockUseAuth.mockReturnValue({ user: { id: undefined, github_login: '' }, isAuthenticated: false })
    const { result } = renderHook(() => useRewards(), { wrapper })
    expect(result.current.rewards).toBeNull()
  })
})

// ── checkAchievements (tested indirectly through achievement unlocking) ──

describe('checkAchievements (indirect)', () => {
  it('unlocks coin_collector when lifetimeCoins reaches 1000', () => {
    seedRewards('test-user-123', {
      totalCoins: 990,
      lifetimeCoins: 990,
    })
    const { result } = renderHook(() => useRewards(), { wrapper })
    // daily_login = 10 coins, pushing to 1000
    act(() => {
      result.current.awardCoins('daily_login')
    })
    expect(result.current.earnedAchievements.map(a => a.id)).toContain('coin_collector')
  })

  it('does not unlock coin_collector below threshold', () => {
    seedRewards('test-user-123', {
      totalCoins: 980,
      lifetimeCoins: 980,
    })
    const { result } = renderHook(() => useRewards(), { wrapper })
    // 980 + 10 = 990, below 1000
    act(() => {
      result.current.awardCoins('daily_login')
    })
    expect(result.current.earnedAchievements.map(a => a.id)).not.toContain('coin_collector')
  })

  it('unlocks treasure_hunter at 5000 lifetime coins', () => {
    seedRewards('test-user-123', {
      totalCoins: 4990,
      lifetimeCoins: 4990,
    })
    const { result } = renderHook(() => useRewards(), { wrapper })
    act(() => {
      result.current.awardCoins('daily_login')
    })
    expect(result.current.earnedAchievements.map(a => a.id)).toContain('treasure_hunter')
  })

  it('skips already-earned achievements', () => {
    seedRewards('test-user-123', {
      totalCoins: 4990,
      lifetimeCoins: 4990,
      achievements: ['coin_collector'],
    })
    const { result } = renderHook(() => useRewards(), { wrapper })
    act(() => {
      result.current.awardCoins('daily_login')
    })
    // coin_collector already earned; should still be there only once
    const ids = result.current.earnedAchievements.map(a => a.id)
    expect(ids.filter(id => id === 'coin_collector').length).toBe(1)
  })

  it('unlocks action-count achievement (idea_machine) at exact threshold', () => {
    const REQUIRED_COUNT = 5
    const featureEvents = Array.from({ length: REQUIRED_COUNT - 1 }, (_, i) => ({
      id: `e-${i}`,
      userId: 'test-user-123',
      action: 'feature_suggestion',
      coins: 100,
      timestamp: new Date().toISOString(),
    }))
    seedRewards('test-user-123', {
      totalCoins: 400,
      lifetimeCoins: 400,
      events: featureEvents,
    })
    const { result } = renderHook(() => useRewards(), { wrapper })
    // 5th feature_suggestion should trigger idea_machine
    act(() => {
      result.current.awardCoins('feature_suggestion')
    })
    expect(result.current.earnedAchievements.map(a => a.id)).toContain('idea_machine')
  })

  it('unlocks multiple achievements in a single award', () => {
    // bug_report = 300 coins. With 700 existing, total = 1000 -> coin_collector
    // Plus the bug_report action -> bug_hunter
    seedRewards('test-user-123', {
      totalCoins: 700,
      lifetimeCoins: 700,
    })
    const { result } = renderHook(() => useRewards(), { wrapper })
    act(() => {
      result.current.awardCoins('bug_report')
    })
    const ids = result.current.earnedAchievements.map(a => a.id)
    expect(ids).toContain('coin_collector')
    expect(ids).toContain('bug_hunter')
  })

  it('returns empty array when no achievements are met', () => {
    seedRewards('test-user-123', {
      totalCoins: 0,
      lifetimeCoins: 0,
    })
    const { result } = renderHook(() => useRewards(), { wrapper })
    act(() => {
      result.current.awardCoins('daily_login')
    })
    // 10 coins, no action-count thresholds met
    expect(result.current.earnedAchievements.length).toBe(0)
  })

  it('community_champion unlocks on github_invite', () => {
    const { result } = renderHook(() => useRewards(), { wrapper })
    act(() => {
      result.current.awardCoins('github_invite')
    })
    expect(result.current.earnedAchievements.map(a => a.id)).toContain('community_champion')
  })

  it('social_butterfly unlocks on linkedin_share', () => {
    const { result } = renderHook(() => useRewards(), { wrapper })
    act(() => {
      result.current.awardCoins('linkedin_share')
    })
    expect(result.current.earnedAchievements.map(a => a.id)).toContain('social_butterfly')
  })

  it('first_steps unlocks on complete_onboarding', () => {
    const { result } = renderHook(() => useRewards(), { wrapper })
    act(() => {
      result.current.awardCoins('complete_onboarding')
    })
    expect(result.current.earnedAchievements.map(a => a.id)).toContain('first_steps')
  })
})
