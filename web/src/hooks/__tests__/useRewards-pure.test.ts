import { describe, it, expect, beforeEach, vi } from 'vitest'

const { mockGetDemoMode } = vi.hoisted(() => ({
  mockGetDemoMode: vi.fn(() => false),
}))

vi.mock('../../lib/demoMode', () => ({
  getDemoMode: mockGetDemoMode,
  isDemoMode: mockGetDemoMode,
  isNetlifyDeployment: vi.fn(() => false),
}))

vi.mock('../useDemoMode', () => ({
  getDemoMode: mockGetDemoMode,
  useDemoMode: () => ({ isDemoMode: false }),
}))

vi.mock('../../lib/auth', () => ({
  useAuth: () => ({ user: null }),
}))

vi.mock('../useGitHubRewards', () => ({
  useGitHubRewards: () => ({ githubRewards: null, githubPoints: 0, refresh: vi.fn() }),
}))

vi.mock('../useBonusPoints', () => ({
  useBonusPoints: () => ({ bonusPoints: 0 }),
}))

vi.mock('../../lib/rewardsApi', () => ({
  fetchGitHubRewards: vi.fn(),
  fetchBonusPoints: vi.fn(),
  incrementCoins: vi.fn(),
  RewardsUnauthenticatedError: class extends Error {},
}))

vi.mock('../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual, STORAGE_KEY_TOKEN: 'kc-auth-token' }
})

const mod = await import('../useRewards')
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
} = mod.__testables

beforeEach(() => {
  localStorage.clear()
  mockGetDemoMode.mockReturnValue(false)
})

describe('generateId', () => {
  it('returns a non-empty string', () => {
    const id = generateId()
    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(0)
  })

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 10 }, () => generateId()))
    expect(ids.size).toBe(10)
  })
})

describe('loadRewards', () => {
  it('returns null when localStorage is empty', () => {
    expect(loadRewards('user-1')).toBeNull()
  })

  it('returns null for unknown user', () => {
    localStorage.setItem(REWARDS_STORAGE_KEY, JSON.stringify({ 'user-2': { userId: 'user-2', totalCoins: 5 } }))
    expect(loadRewards('user-1')).toBeNull()
  })

  it('returns stored rewards for matching user', () => {
    const rewards = { userId: 'user-1', totalCoins: 42, lifetimeCoins: 42, events: [], achievements: [] }
    localStorage.setItem(REWARDS_STORAGE_KEY, JSON.stringify({ 'user-1': rewards }))
    const result = loadRewards('user-1')
    expect(result).not.toBeNull()
    expect(result!.totalCoins).toBe(42)
  })

  it('handles corrupted JSON gracefully', () => {
    localStorage.setItem(REWARDS_STORAGE_KEY, 'not-json!!!')
    expect(loadRewards('user-1')).toBeNull()
  })
})

describe('saveRewards', () => {
  it('persists rewards for a user', () => {
    const rewards = { userId: 'u1', totalCoins: 10, lifetimeCoins: 10, events: [], achievements: [], lastUpdated: '' }
    saveRewards('u1', rewards as never)
    const stored = JSON.parse(localStorage.getItem(REWARDS_STORAGE_KEY) || '{}')
    expect(stored['u1'].totalCoins).toBe(10)
  })

  it('preserves other users when saving', () => {
    const r1 = { userId: 'u1', totalCoins: 5 }
    const r2 = { userId: 'u2', totalCoins: 99 }
    localStorage.setItem(REWARDS_STORAGE_KEY, JSON.stringify({ u1: r1 }))
    saveRewards('u2', r2 as never)
    const stored = JSON.parse(localStorage.getItem(REWARDS_STORAGE_KEY) || '{}')
    expect(stored['u1'].totalCoins).toBe(5)
    expect(stored['u2'].totalCoins).toBe(99)
  })
})

describe('createInitialRewards', () => {
  it('creates rewards with zero coins', () => {
    const r = createInitialRewards('new-user')
    expect(r.userId).toBe('new-user')
    expect(r.totalCoins).toBe(0)
    expect(r.lifetimeCoins).toBe(0)
    expect(r.events).toEqual([])
    expect(r.achievements).toEqual([])
  })

  it('has a valid lastUpdated ISO string', () => {
    const r = createInitialRewards('u')
    expect(new Date(r.lastUpdated).getTime()).not.toBeNaN()
  })
})

describe('resolveRewardsUserId', () => {
  it('returns null for undefined', () => {
    expect(resolveRewardsUserId(undefined)).toBeNull()
  })

  it('returns demo user ID in demo mode', () => {
    mockGetDemoMode.mockReturnValue(true)
    expect(resolveRewardsUserId('any-user')).toBe(DEMO_REWARDS_USER_ID)
  })

  it('returns the actual user ID when not in demo mode', () => {
    mockGetDemoMode.mockReturnValue(false)
    expect(resolveRewardsUserId('real-user-123')).toBe('real-user-123')
  })

  it('returns demo user ID when userId is demo-user', () => {
    mockGetDemoMode.mockReturnValue(false)
    expect(resolveRewardsUserId(DEMO_REWARDS_USER_ID)).toBe(DEMO_REWARDS_USER_ID)
  })
})

describe('checkAchievements', () => {
  it('returns empty array for fresh user', () => {
    const rewards = createInitialRewards('u')
    expect(checkAchievements(rewards)).toEqual([])
  })
})

describe('constants', () => {
  it('MAX_REWARD_EVENTS is 100', () => {
    expect(MAX_REWARD_EVENTS).toBe(100)
  })

  it('RECENT_EVENTS_LIMIT is 10', () => {
    expect(RECENT_EVENTS_LIMIT).toBe(10)
  })

  it('DEMO_REWARDS_USER_ID is a non-empty string', () => {
    expect(typeof DEMO_REWARDS_USER_ID).toBe('string')
    expect(DEMO_REWARDS_USER_ID.length).toBeGreaterThan(0)
  })

  it('REWARDS_STORAGE_KEY is a non-empty string', () => {
    expect(typeof REWARDS_STORAGE_KEY).toBe('string')
    expect(REWARDS_STORAGE_KEY.length).toBeGreaterThan(0)
  })
})
