/**
 * Unit coverage for apiKeySettingsUtils.ts.
 *
 * buildBaseURLPayload drives the API-key settings dialog "Base URL" save
 * action. Its two branches encode a meaningful UX difference:
 *
 *   - empty draft → { clearBaseURL: true } tells the backend to reset the
 *     provider's baseURL to the built-in default.
 *   - non-empty draft → { baseURL } persists the user's override verbatim.
 *
 * A regression that flipped these branches (or dropped either flag) would
 * silently persist wrong endpoints, so lock the shape in with tests.
 */
import { describe, it, expect } from 'vitest'
import { buildBaseURLPayload, KC_AGENT_URL } from '../apiKeySettingsUtils'
import { KC_AGENT } from '../../../config/externalApis'

describe('buildBaseURLPayload', () => {
  it('returns a clearBaseURL payload when the draft is empty', () => {
    expect(buildBaseURLPayload('openai', '')).toEqual({
      provider: 'openai',
      clearBaseURL: true,
    })
  })

  it('returns a baseURL payload when the draft is a non-empty URL', () => {
    expect(buildBaseURLPayload('anthropic', 'https://example.com/v1')).toEqual({
      provider: 'anthropic',
      baseURL: 'https://example.com/v1',
    })
  })

  it('treats a whitespace-only draft as a real value (no trimming)', () => {
    // buildBaseURLPayload does not trim: whitespace-only strings are persisted
    // verbatim. Callers are responsible for validation. Pin the behavior so
    // future changes are intentional.
    const result = buildBaseURLPayload('openai', '   ')
    expect(result).toEqual({ provider: 'openai', baseURL: '   ' })
    expect('clearBaseURL' in result).toBe(false)
  })

  it('preserves the provider string unchanged in both branches', () => {
    expect(buildBaseURLPayload('custom-provider-x', '').provider).toBe('custom-provider-x')
    expect(buildBaseURLPayload('custom-provider-x', 'https://x').provider).toBe(
      'custom-provider-x'
    )
  })

  it('never emits both clearBaseURL and baseURL on the same payload', () => {
    const cleared = buildBaseURLPayload('p', '') as Record<string, unknown>
    const set = buildBaseURLPayload('p', 'https://x') as Record<string, unknown>
    expect('baseURL' in cleared).toBe(false)
    expect('clearBaseURL' in set).toBe(false)
  })
})

describe('KC_AGENT_URL', () => {
  it('re-exports the kc-agent URL from externalApis config', () => {
    expect(KC_AGENT_URL).toBe(KC_AGENT.url)
    expect(typeof KC_AGENT_URL).toBe('string')
  })
})
