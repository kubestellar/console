import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FeatureRequest } from '../../hooks/useFeatureRequests'
import {
  getVerifiedFixStorageKey,
  readVerifiedFixState,
  writeVerifiedFixState,
} from './updatesTabStorage'

function makeRequest(overrides: Partial<FeatureRequest> = {}): FeatureRequest {
  return {
    id: 'internal-id-1',
    user_id: 'user-1',
    title: 'A request',
    description: 'body',
    request_type: 'bug',
    status: 'fix_complete',
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('getVerifiedFixStorageKey', () => {
  it('prefers github_issue_number and pr_number when available', () => {
    const key = getVerifiedFixStorageKey(
      makeRequest({ github_issue_number: 123, pr_number: 456 })
    )
    expect(key).toBe('ks-console:verified-fix:123:456')
  })

  it('falls back to internal id when github_issue_number is missing', () => {
    const key = getVerifiedFixStorageKey(
      makeRequest({ id: 'abc-xyz', pr_number: 789 })
    )
    expect(key).toBe('ks-console:verified-fix:abc-xyz:789')
  })

  it("uses the 'no-pr' sentinel when pr_number is missing", () => {
    const key = getVerifiedFixStorageKey(
      makeRequest({ github_issue_number: 42 })
    )
    expect(key).toBe('ks-console:verified-fix:42:no-pr')
  })

  it("uses both fallbacks when neither github_issue_number nor pr_number is set", () => {
    const key = getVerifiedFixStorageKey(makeRequest({ id: 'draft-9' }))
    expect(key).toBe('ks-console:verified-fix:draft-9:no-pr')
  })

  it("treats pr_number 0 as a real value (does not use 'no-pr' fallback)", () => {
    const key = getVerifiedFixStorageKey(
      makeRequest({ github_issue_number: 1, pr_number: 0 })
    )
    expect(key).toBe('ks-console:verified-fix:1:0')
  })
})

describe('readVerifiedFixState', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it("returns true only when the stored value is exactly 'true'", () => {
    window.localStorage.setItem('key-a', 'true')
    expect(readVerifiedFixState('key-a')).toBe(true)
  })

  it('returns false when the key is not set', () => {
    expect(readVerifiedFixState('missing-key')).toBe(false)
  })

  it("returns false for non-'true' values (e.g. 'false', '1', empty)", () => {
    window.localStorage.setItem('key-false', 'false')
    window.localStorage.setItem('key-one', '1')
    window.localStorage.setItem('key-empty', '')
    expect(readVerifiedFixState('key-false')).toBe(false)
    expect(readVerifiedFixState('key-one')).toBe(false)
    expect(readVerifiedFixState('key-empty')).toBe(false)
  })

  it('returns false when localStorage.getItem throws', () => {
    const spy = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('storage disabled')
      })
    expect(readVerifiedFixState('any-key')).toBe(false)
    spy.mockRestore()
  })
})

describe('writeVerifiedFixState', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it("stores the literal string 'true' when isVerified is true", () => {
    writeVerifiedFixState('key-write', true)
    expect(window.localStorage.getItem('key-write')).toBe('true')
  })

  it('removes the entry when isVerified is false', () => {
    window.localStorage.setItem('key-remove', 'true')
    writeVerifiedFixState('key-remove', false)
    expect(window.localStorage.getItem('key-remove')).toBeNull()
  })

  it('is a no-op (no throw) when removing a key that does not exist', () => {
    expect(() => writeVerifiedFixState('never-set', false)).not.toThrow()
    expect(window.localStorage.getItem('never-set')).toBeNull()
  })

  it('swallows storage errors when setItem throws', () => {
    const spy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('quota exceeded')
      })
    expect(() => writeVerifiedFixState('key-throw', true)).not.toThrow()
    spy.mockRestore()
  })

  it('swallows storage errors when removeItem throws', () => {
    const spy = vi
      .spyOn(Storage.prototype, 'removeItem')
      .mockImplementation(() => {
        throw new Error('storage disabled')
      })
    expect(() => writeVerifiedFixState('key-throw', false)).not.toThrow()
    spy.mockRestore()
  })

  it('round-trips through readVerifiedFixState', () => {
    const request = { id: 'r1', github_issue_number: 7, pr_number: 8 } as FeatureRequest
    const key = getVerifiedFixStorageKey({
      ...request,
      user_id: 'u',
      title: '',
      description: '',
      request_type: 'bug',
      status: 'open',
      created_at: '2026-01-01T00:00:00.000Z',
    })
    writeVerifiedFixState(key, true)
    expect(readVerifiedFixState(key)).toBe(true)
    writeVerifiedFixState(key, false)
    expect(readVerifiedFixState(key)).toBe(false)
  })
})
