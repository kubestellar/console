/**
 * Typed client for the per-user rewards persistence API (issue #6011).
 *
 * These endpoints back the `useRewards` hook so that coin/point/level
 * balances survive a browser cache wipe, private windows, and switching
 * devices — the prior behavior lost everything because state lived only
 * in `localStorage`.
 *
 * Every function here is a thin wrapper over `api.*` so callers get the
 * shared auth header, backend-availability checks, 401 handling, and
 * typed response envelopes for free.
 */

import { api, UnauthenticatedError, UnauthorizedError } from './api'

/** Server-authoritative rewards row for the current user. */
export interface UserRewardsRecord {
  user_id: string
  coins: number
  points: number
  level: number
  bonus_points: number
  /** RFC3339 timestamp; `undefined` when the daily bonus has never been claimed (server omits the field via `omitempty`). */
  last_daily_bonus_at?: string
  updated_at: string
}

export interface DailyBonusResponse {
  rewards: UserRewardsRecord
  /** Number of bonus points awarded on this claim. */
  bonus_amount: number
}

/**
 * Signals that the user is unauthenticated (no JWT) and the reward
 * endpoints cannot be called. The hook uses this to fall back to
 * localStorage/demo-mode behavior without logging a noisy error.
 */
export class RewardsUnauthenticatedError extends Error {
  constructor() {
    super('rewards endpoints require authentication')
    this.name = 'RewardsUnauthenticatedError'
  }
}

/**
 * Custom error thrown when the daily bonus is still on cooldown. Carries
 * the current rewards state (if the server returned it) so the UI can
 * still render balances without a second GET.
 */
export class DailyBonusUnavailableError extends Error {
  rewards?: UserRewardsRecord
  constructor(rewards?: UserRewardsRecord) {
    super('daily bonus already claimed within cooldown window')
    this.name = 'DailyBonusUnavailableError'
    this.rewards = rewards
  }
}

/** Normalizes `api.*` errors into the RewardsUnauthenticatedError type
 * so callers have one narrow branch to handle for the 401 path. */
function toRewardsError(err: unknown): Error {
  if (err instanceof UnauthenticatedError || err instanceof UnauthorizedError) {
    return new RewardsUnauthenticatedError()
  }
  if (err instanceof Error) return err
  return new Error(String(err))
}

/**
 * Fetch the current user's rewards row. Returns zero-state values for
 * users who have never persisted anything — the server synthesizes the
 * default row on read rather than requiring an explicit PUT first.
 */
export async function getUserRewards(): Promise<UserRewardsRecord> {
  try {
    const { data } = await api.get<UserRewardsRecord>('/api/rewards/me')
    return data
  } catch (err: unknown) {
    throw toRewardsError(err)
  }
}

/** Replace the entire rewards row for the current user (idempotent). */
export async function putUserRewards(payload: {
  coins: number
  points: number
  level: number
  bonus_points: number
}): Promise<UserRewardsRecord> {
  try {
    const { data } = await api.put<UserRewardsRecord>('/api/rewards/me', payload)
    return data
  } catch (err: unknown) {
    throw toRewardsError(err)
  }
}

/**
 * Atomically add `delta` to the user's coin balance. Negative deltas are
 * allowed; the server clamps the resulting balance to zero.
 */
export async function incrementCoins(delta: number): Promise<UserRewardsRecord> {
  try {
    const { data } = await api.post<UserRewardsRecord>('/api/rewards/coins', { delta })
    return data
  } catch (err: unknown) {
    throw toRewardsError(err)
  }
}

/**
 * Claim today's daily bonus. Throws DailyBonusUnavailableError (carrying
 * the unchanged rewards row when available) when the cooldown has not yet
 * elapsed so the UI can display a friendly "come back tomorrow" message.
 */
export async function claimDailyBonus(): Promise<DailyBonusResponse> {
  try {
    const { data } = await api.post<DailyBonusResponse>('/api/rewards/daily-bonus', {})
    return data
  } catch (err: unknown) {
    // api.post throws a plain Error for non-401 failures. We try to parse
    // a 429 body off the message if the backend's JSON leaked through.
    if (err instanceof UnauthenticatedError || err instanceof UnauthorizedError) {
      throw new RewardsUnauthenticatedError()
    }
    if (err instanceof Error && err.message.includes('daily bonus already claimed')) {
      // Body was captured as plain text by api.post — try JSON parse.
      try {
        const parsed = JSON.parse(err.message) as { rewards?: UserRewardsRecord }
        throw new DailyBonusUnavailableError(parsed.rewards)
      } catch {
        throw new DailyBonusUnavailableError()
      }
    }
    throw toRewardsError(err)
  }
}
