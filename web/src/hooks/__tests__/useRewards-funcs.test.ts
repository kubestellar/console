import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/demoMode', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/demoMode')>()
  return {
    ...actual,
    getDemoMode: vi.fn(() => false),
  }
})

import { __testables } from '../useRewards'
import { getDemoMode } from '../../lib/demoMode'
import type { UserRewards } from '../../types/rewards'

const {
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
} = __testables

function makeRewards(overrides: Partial<UserRewards> = {}): UserRewards {
  return {
    userId: 'test-user',
    totalCoins: 0,
    lifetimeCoins: 0,
    events: [],
    achievements: [],
    lastUpdated: new Date().toISOString(),
    ...overrides,
  }
}

beforeEach(() => {
  localStorage.clear()
  vi.mocked(getDemoMode).mockReturnValue(false)
})

describe('constants', () => {
  it('REWARDS_STORAGE_KEY is a non-empty string', () => {
    expect(typeof REWARDS_STORAGE_KEY).toBe('string')
    expect(REWARDS_STORAGE_KEY.length).toBeGreaterThan(0)
  })

  it('MAX_REWARD_EVENTS is a positive integer', () => {
    expect(Number.isInteger(MAX_REWARD_EVENTS)).toBe(true)
    expect(MAX_REWARD_EVENTS).toBeGreaterThan(0)
  })

  it('RECENT_EVENTS_LIMIT is a positive integer less than MAX_REWARD_EVENTS', () => {
    expect(Number.isInteger(RECENT_EVENTS_LIMIT)).toBe(true)
    expect(RECENT_EVENTS_LIMIT).toBeGreaterThan(0)
    expect(RECENT_EVENTS_LIMIT).toBeLessThanOrEqual(MAX_REWARD_EVENTS)
  })

  it('DEMO_REWARDS_USER_ID is a non-empty string', () => {
    expect(typeof DEMO_REWARDS_USER_ID).toBe('string')
    expect(DEMO_REWARDS_USER_ID.length).toBeGreaterThan(0)
  })
})

describe('generateId', () => {
  it('returns a string containing a timestamp prefix and random suffix', () => {
    const id = generateId()
    expect(typeof id).toBe('string')
    expect(id).toContain('-')
    const [timestampPart] = id.split('-')
    expect(Number(timestampPart)).toBeGreaterThan(0)
  })

  it('generates unique ids on successive calls', () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateId()))
    expect(ids.size).toBe(50)
  })
})

describe('loadRewards', () => {
  it('returns null when localStorage is empty', () => {
    expect(loadRewards('user-1')).toBeNull()
  })

  it('returns null when the key exists but the user is not present', () => {
    localStorage.setItem(REWARDS_STORAGE_KEY, JSON.stringify({ 'other-user': makeRewards({ userId: 'other-user' }) }))
    expect(loadRewards('user-1')).toBeNull()
  })

  it('returns the stored rewards for the matching user', () => {
    const rewards = makeRewards({ userId: 'user-1', totalCoins: 42 })
    localStorage.setItem(REWARDS_STORAGE_KEY, JSON.stringify({ 'user-1': rewards }))
    const loaded = loadRewards('user-1')
    expect(loaded).not.toBeNull()
    expect(loaded!.totalCoins).toBe(42)
    expect(loaded!.userId).toBe('user-1')
  })

  it('returns null and logs error when localStorage contains invalid JSON', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    localStorage.setItem(REWARDS_STORAGE_KEY, '{bad json')
    expect(loadRewards('user-1')).toBeNull()
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})

describe('saveRewards', () => {
  it('saves rewards for a user into localStorage', () => {
    const rewards = makeRewards({ userId: 'user-1', totalCoins: 100 })
    saveRewards('user-1', rewards)
    const stored = JSON.parse(localStorage.getItem(REWARDS_STORAGE_KEY)!)
    expect(stored['user-1'].totalCoins).toBe(100)
  })

  it('preserves existing users when saving a new user', () => {
    const r1 = makeRewards({ userId: 'user-1', totalCoins: 10 })
    const r2 = makeRewards({ userId: 'user-2', totalCoins: 20 })
    saveRewards('user-1', r1)
    saveRewards('user-2', r2)
    const stored = JSON.parse(localStorage.getItem(REWARDS_STORAGE_KEY)!)
    expect(stored['user-1'].totalCoins).toBe(10)
    expect(stored['user-2'].totalCoins).toBe(20)
  })

  it('overwrites rewards for an existing user', () => {
    saveRewards('user-1', makeRewards({ userId: 'user-1', totalCoins: 10 }))
    saveRewards('user-1', makeRewards({ userId: 'user-1', totalCoins: 99 }))
    const stored = JSON.parse(localStorage.getItem(REWARDS_STORAGE_KEY)!)
    expect(stored['user-1'].totalCoins).toBe(99)
  })

  it('handles corrupt existing data gracefully', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    // setItem with invalid JSON so getItem inside saveRewards throws on parse
    localStorage.setItem(REWARDS_STORAGE_KEY, '{corrupt')
    saveRewards('user-1', makeRewards({ userId: 'user-1' }))
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})

describe('createInitialRewards', () => {
  it('creates a rewards object with the given userId', () => {
    const rewards = createInitialRewards('new-user')
    expect(rewards.userId).toBe('new-user')
  })

  it('starts with zero coins and empty collections', () => {
    const rewards = createInitialRewards('new-user')
    expect(rewards.totalCoins).toBe(0)
    expect(rewards.lifetimeCoins).toBe(0)
    expect(rewards.events).toEqual([])
    expect(rewards.achievements).toEqual([])
  })

  it('sets lastUpdated to a valid ISO timestamp', () => {
    const before = new Date().toISOString()
    const rewards = createInitialRewards('new-user')
    const after = new Date().toISOString()
    expect(rewards.lastUpdated >= before).toBe(true)
    expect(rewards.lastUpdated <= after).toBe(true)
  })
})

describe('resolveRewardsUserId', () => {
  it('returns null for undefined input', () => {
    expect(resolveRewardsUserId(undefined)).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(resolveRewardsUserId('')).toBeNull()
  })

  it('returns the userId as-is for non-demo authenticated sessions', () => {
    vi.mocked(getDemoMode).mockReturnValue(false)
    expect(resolveRewardsUserId('real-user-123')).toBe('real-user-123')
  })

  it('returns DEMO_REWARDS_USER_ID when getDemoMode returns true', () => {
    vi.mocked(getDemoMode).mockReturnValue(true)
    expect(resolveRewardsUserId('any-user')).toBe(DEMO_REWARDS_USER_ID)
  })

  it('returns DEMO_REWARDS_USER_ID when userId matches DEMO_REWARDS_USER_ID', () => {
    vi.mocked(getDemoMode).mockReturnValue(false)
    expect(resolveRewardsUserId(DEMO_REWARDS_USER_ID)).toBe(DEMO_REWARDS_USER_ID)
  })
})

describe('checkAchievements', () => {
  it('returns empty array for fresh user with no coins or events', () => {
    const rewards = makeRewards()
    expect(checkAchievements(rewards)).toEqual([])
  })

  it('awards coin-based achievements when lifetimeCoins meets the threshold', () => {
    const rewards = makeRewards({ lifetimeCoins: 1000 })
    const result = checkAchievements(rewards)
    expect(result).toContain('coin_collector')
  })

  it('awards higher coin-based achievements at higher thresholds', () => {
    const rewards = makeRewards({ lifetimeCoins: 5000 })
    const result = checkAchievements(rewards)
    expect(result).toContain('coin_collector')
    expect(result).toContain('treasure_hunter')
  })

  it('awards action-based achievement with default requiredCount of 1', () => {
    const rewards = makeRewards({
      events: [
        { id: '1', userId: 'test', action: 'bug_report', coins: 300, timestamp: new Date().toISOString() },
      ],
    })
    const result = checkAchievements(rewards)
    expect(result).toContain('bug_hunter')
  })

  it('awards action-based achievement when requiredCount is met', () => {
    const events = Array.from({ length: 5 }, (_, i) => ({
      id: String(i),
      userId: 'test',
      action: 'feature_suggestion' as const,
      coins: 100,
      timestamp: new Date().toISOString(),
    }))
    const rewards = makeRewards({ events })
    const result = checkAchievements(rewards)
    expect(result).toContain('idea_machine')
  })

  it('does not award action-based achievement when count is below requiredCount', () => {
    const events = Array.from({ length: 4 }, (_, i) => ({
      id: String(i),
      userId: 'test',
      action: 'feature_suggestion' as const,
      coins: 100,
      timestamp: new Date().toISOString(),
    }))
    const rewards = makeRewards({ events })
    const result = checkAchievements(rewards)
    expect(result).not.toContain('idea_machine')
  })

  it('skips achievements the user already has', () => {
    const rewards = makeRewards({
      lifetimeCoins: 1000,
      achievements: ['coin_collector'],
    })
    const result = checkAchievements(rewards)
    expect(result).not.toContain('coin_collector')
  })

  it('can return multiple new achievements at once', () => {
    const rewards = makeRewards({
      lifetimeCoins: 5000,
      events: [
        { id: '1', userId: 'test', action: 'complete_onboarding', coins: 100, timestamp: new Date().toISOString() },
        { id: '2', userId: 'test', action: 'bug_report', coins: 300, timestamp: new Date().toISOString() },
        { id: '3', userId: 'test', action: 'github_invite', coins: 500, timestamp: new Date().toISOString() },
        { id: '4', userId: 'test', action: 'linkedin_share', coins: 200, timestamp: new Date().toISOString() },
      ],
    })
    const result = checkAchievements(rewards)
    expect(result).toContain('first_steps')
    expect(result).toContain('bug_hunter')
    expect(result).toContain('coin_collector')
    expect(result).toContain('treasure_hunter')
    expect(result).toContain('community_champion')
    expect(result).toContain('social_butterfly')
  })
})
