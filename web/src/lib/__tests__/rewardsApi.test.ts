/**
 * Tests for lib/rewardsApi.ts — CRUD functions + error mapping.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGet = vi.fn()
const mockPost = vi.fn()
const mockPut = vi.fn()

vi.mock('../api', () => ({
  api: { get: (...a: unknown[]) => mockGet(...a), post: (...a: unknown[]) => mockPost(...a), put: (...a: unknown[]) => mockPut(...a) },
  UnauthenticatedError: class extends Error { name = 'UnauthenticatedError' },
  UnauthorizedError: class extends Error { name = 'UnauthorizedError' },
}))

import {
  getUserRewards,
  putUserRewards,
  incrementCoins,
  claimDailyBonus,
  RewardsUnauthenticatedError,
  DailyBonusUnavailableError,
} from '../rewardsApi'

const FAKE_REWARDS = {
  user_id: 'u1',
  coins: 500,
  points: 1200,
  level: 3,
  bonus_points: 50,
  updated_at: '2026-01-01T00:00:00Z',
}

describe('rewardsApi', () => {
  beforeEach(() => { mockGet.mockReset(); mockPost.mockReset(); mockPut.mockReset() })

  describe('getUserRewards', () => {
    it('fetches /api/rewards/me', async () => {
      mockGet.mockResolvedValue({ data: FAKE_REWARDS })
      const result = await getUserRewards()
      expect(result).toEqual(FAKE_REWARDS)
    })

    it('wraps auth errors → RewardsUnauthenticatedError', async () => {
      const { UnauthenticatedError } = await import('../api')
      mockGet.mockRejectedValue(new UnauthenticatedError('no jwt'))
      await expect(getUserRewards()).rejects.toBeInstanceOf(RewardsUnauthenticatedError)
    })
  })

  describe('putUserRewards', () => {
    it('puts to the rewards endpoint', async () => {
      mockPut.mockResolvedValue({ data: FAKE_REWARDS })
      const result = await putUserRewards({ coins: 500, points: 1200 })
      expect(result).toEqual(FAKE_REWARDS)
    })
  })

  describe('incrementCoins', () => {
    it('posts the delta', async () => {
      mockPost.mockResolvedValue({ data: FAKE_REWARDS })
      const result = await incrementCoins(50)
      expect(result).toEqual(FAKE_REWARDS)
    })
  })

  describe('claimDailyBonus', () => {
    it('returns bonus response on success', async () => {
      mockPost.mockResolvedValue({ data: { rewards: FAKE_REWARDS, bonus_amount: 50 } })
      const result = await claimDailyBonus()
      expect(result.bonus_amount).toBe(50)
    })
  })

  describe('error classes', () => {
    it('RewardsUnauthenticatedError has the correct name', () => {
      const err = new RewardsUnauthenticatedError()
      expect(err.name).toBe('RewardsUnauthenticatedError')
      expect(err.message).toBeTruthy()
    })

    it('DailyBonusUnavailableError has the correct name', () => {
      const err = new DailyBonusUnavailableError('cooldown')
      expect(err.name).toBe('DailyBonusUnavailableError')
    })
  })
})
