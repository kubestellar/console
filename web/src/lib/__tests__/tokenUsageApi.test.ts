/**
 * Tests for lib/tokenUsageApi.ts — 3 CRUD functions + error mapping.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGet = vi.fn()
const mockPost = vi.fn()

vi.mock('../api', () => ({
  api: { get: (...a: unknown[]) => mockGet(...a), post: (...a: unknown[]) => mockPost(...a) },
  UnauthenticatedError: class extends Error { name = 'UnauthenticatedError' },
  UnauthorizedError: class extends Error { name = 'UnauthorizedError' },
}))

import {
  getUserTokenUsage,
  putUserTokenUsage,
  postTokenDelta,
  TokenUsageUnauthenticatedError,
} from '../tokenUsageApi'

const FAKE_RECORD = {
  user_id: 'u1',
  total_tokens: 100,
  tokens_by_category: { chat: 80, mission: 20 },
  last_agent_session_id: 'sess-1',
  updated_at: '2026-01-01T00:00:00Z',
}

describe('tokenUsageApi', () => {
  beforeEach(() => { mockGet.mockReset(); mockPost.mockReset() })

  describe('getUserTokenUsage', () => {
    it('returns the data on success', async () => {
      mockGet.mockResolvedValue({ data: FAKE_RECORD })
      const result = await getUserTokenUsage()
      expect(result).toEqual(FAKE_RECORD)
      expect(mockGet).toHaveBeenCalledWith('/api/token-usage/me')
    })

    it('wraps UnauthenticatedError → TokenUsageUnauthenticatedError', async () => {
      const { UnauthenticatedError } = await import('../api')
      mockGet.mockRejectedValue(new UnauthenticatedError('no jwt'))
      await expect(getUserTokenUsage()).rejects.toBeInstanceOf(TokenUsageUnauthenticatedError)
    })

    it('passes through other errors unchanged', async () => {
      mockGet.mockRejectedValue(new Error('network down'))
      await expect(getUserTokenUsage()).rejects.toThrow('network down')
    })
  })

  describe('putUserTokenUsage', () => {
    it('posts to /api/token-usage/me and returns the result', async () => {
      mockPost.mockResolvedValue({ data: FAKE_RECORD })
      const payload = { total_tokens: 100, tokens_by_category: {}, last_agent_session_id: 's' }
      const result = await putUserTokenUsage(payload)
      expect(result).toEqual(FAKE_RECORD)
      expect(mockPost).toHaveBeenCalledWith('/api/token-usage/me', payload)
    })
  })

  describe('postTokenDelta', () => {
    it('posts to /api/token-usage/delta and returns the result', async () => {
      mockPost.mockResolvedValue({ data: FAKE_RECORD })
      const payload = { category: 'chat', delta: 10, agent_session_id: 's' }
      const result = await postTokenDelta(payload)
      expect(result).toEqual(FAKE_RECORD)
      expect(mockPost).toHaveBeenCalledWith('/api/token-usage/delta', payload)
    })

    it('wraps auth errors', async () => {
      const { UnauthorizedError } = await import('../api')
      mockPost.mockRejectedValue(new UnauthorizedError('forbidden'))
      await expect(postTokenDelta({ category: 'x', delta: 1, agent_session_id: 's' }))
        .rejects.toBeInstanceOf(TokenUsageUnauthenticatedError)
    })
  })

  describe('TokenUsageUnauthenticatedError', () => {
    it('has the correct name', () => {
      const err = new TokenUsageUnauthenticatedError()
      expect(err.name).toBe('TokenUsageUnauthenticatedError')
      expect(err.message).toBeTruthy()
    })
  })
})
