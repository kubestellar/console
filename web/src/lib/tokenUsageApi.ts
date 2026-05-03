/**
 * Typed client for the per-user token-usage persistence API (folded into
 * issue #6011 PR). The token-budget widget now reads from a server-side
 * SQLite row instead of localStorage only, so clearing the browser cache,
 * using a private window, or switching devices no longer wipes the
 * accumulated counters. localStorage is preserved as a write-through
 * cache for fast reads — see useTokenUsage.ts.
 */

import { api, UnauthenticatedError, UnauthorizedError } from './api'

/** Server-authoritative token usage row for the current user. */
export interface UserTokenUsageRecord {
  user_id: string
  total_tokens: number
  /** Per-category breakdown; always a non-null object on the wire. */
  tokens_by_category: Record<string, number>
  /** Last kc-agent session marker the server has observed for this user. */
  last_agent_session_id: string
  /** RFC3339 timestamp of the last server-side write. */
  updated_at: string
}

/**
 * Body for `POST /api/token-usage/me` — clients send their full desired
 * state and the server replaces the row.
 */
export interface PutUserTokenUsagePayload {
  total_tokens: number
  tokens_by_category: Record<string, number>
  last_agent_session_id: string
}

/**
 * Body for `POST /api/token-usage/delta` — atomic increment with
 * restart-detection semantics: when `agent_session_id` differs from the
 * stored marker, the server treats this call as a baseline reset and does
 * NOT add the delta to the totals.
 */
export interface PostTokenDeltaPayload {
  category: string
  delta: number
  agent_session_id: string
}

/**
 * Signals that the user is unauthenticated and the token usage endpoints
 * cannot be called. The hook uses this to fall back to localStorage-only
 * behavior without logging a noisy error.
 */
export class TokenUsageUnauthenticatedError extends Error {
  constructor() {
    super('token usage endpoints require authentication')
    this.name = 'TokenUsageUnauthenticatedError'
  }
}

function toTokenUsageError(err: unknown): Error {
  if (err instanceof UnauthenticatedError || err instanceof UnauthorizedError) {
    return new TokenUsageUnauthenticatedError()
  }
  if (err instanceof Error) return err
  return new Error(String(err))
}

/** Fetch the current user's token-usage row (zero-state if never written). */
export async function getUserTokenUsage(): Promise<UserTokenUsageRecord> {
  try {
    const { data } = await api.get<UserTokenUsageRecord>('/api/token-usage/me')
    return data
  } catch (err: unknown) {
    throw toTokenUsageError(err)
  }
}

/** Replace the entire token-usage row for the current user. */
export async function putUserTokenUsage(
  payload: PutUserTokenUsagePayload
): Promise<UserTokenUsageRecord> {
  try {
    const { data } = await api.post<UserTokenUsageRecord>('/api/token-usage/me', payload)
    return data
  } catch (err: unknown) {
    throw toTokenUsageError(err)
  }
}

/** Atomically add a delta to one category's counter. */
export async function postTokenDelta(
  payload: PostTokenDeltaPayload
): Promise<UserTokenUsageRecord> {
  try {
    const { data } = await api.post<UserTokenUsageRecord>('/api/token-usage/delta', payload)
    return data
  } catch (err: unknown) {
    throw toTokenUsageError(err)
  }
}
