/**
 * Tests for useMissions.helpers
 * Pure utility functions — no React needed.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../lib/i18n', () => ({
  default: {
    t: vi.fn((key: string, opts?: { reasonSuffix?: string }) => {
      const map: Record<string, string> = {
        'missions.kagenti.providerUnavailableTitle': 'Provider Unavailable',
        'missions.kagenti.providerUnavailableDescription': `Could not reach provider${opts?.reasonSuffix ?? ''}`,
        'missions.kagenti.noAgentsTitle': 'No Agents Found',
        'missions.kagenti.noAgentsDescription': 'No agents were discovered.',
      }
      return map[key] ?? key
    }),
  },
}))

vi.mock('./useMissions.constants', () => ({
  AGENT_DISCONNECT_ERROR_PATTERNS: [
    'Local Agent Not Connected',
    'agent not available',
    'agent not responding',
  ],
}))

import {
  getMissionMessages,
  isStaleAgentErrorMessage,
  buildKagentiDiscoveryErrorMessage,
  KAGENTI_PROVIDER_UNAVAILABLE_EVENT,
  KAGENTI_NO_AGENTS_DISCOVERED_EVENT,
} from '../useMissions.helpers'
import type { MissionMessage } from '../useMissionTypes'
import type { KagentiDiscoveryFailure } from '../useMissions.helpers'

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeMessage(role: MissionMessage['role'], content: string): MissionMessage {
  return { id: '1', role, content, timestamp: new Date() }
}

// ─── getMissionMessages ───────────────────────────────────────────────────────

describe('getMissionMessages', () => {
  it('returns the same array when messages are provided', () => {
    const msgs = [makeMessage('user', 'hello')]
    expect(getMissionMessages(msgs)).toBe(msgs)
  })

  it('returns empty array when messages is undefined', () => {
    expect(getMissionMessages(undefined)).toEqual([])
  })

  it('returns empty array when passed an empty array', () => {
    expect(getMissionMessages([])).toEqual([])
  })
})

// ─── isStaleAgentErrorMessage ─────────────────────────────────────────────────

describe('isStaleAgentErrorMessage', () => {
  it('returns true for system message matching first pattern', () => {
    const msg = makeMessage('system', 'Local Agent Not Connected')
    expect(isStaleAgentErrorMessage(msg)).toBe(true)
  })

  it('returns true for system message matching second pattern', () => {
    const msg = makeMessage('system', 'agent not available right now')
    expect(isStaleAgentErrorMessage(msg)).toBe(true)
  })

  it('returns true for system message matching third pattern', () => {
    const msg = makeMessage('system', 'agent not responding to requests')
    expect(isStaleAgentErrorMessage(msg)).toBe(true)
  })

  it('returns false for system message with no matching pattern', () => {
    const msg = makeMessage('system', 'Mission started successfully')
    expect(isStaleAgentErrorMessage(msg)).toBe(false)
  })

  it('returns false for user role even with matching content', () => {
    const msg = makeMessage('user', 'Local Agent Not Connected')
    expect(isStaleAgentErrorMessage(msg)).toBe(false)
  })

  it('returns false for assistant role with matching content', () => {
    const msg = makeMessage('assistant', 'agent not available')
    expect(isStaleAgentErrorMessage(msg)).toBe(false)
  })
})

// ─── buildKagentiDiscoveryErrorMessage ────────────────────────────────────────

it('returns provider unreachable message for provider_unreachable reason', () => {
  const result: KagentiDiscoveryFailure = { ok: false, reason: 'provider_unreachable' }
  const msg = buildKagentiDiscoveryErrorMessage(result)
  expect(msg).toContain('Kagenti provider unavailable')
  expect(msg).toContain('Mission Control could not reach the Kagenti provider')
})

  it('includes detail in suffix when detail is provided', () => {
    const result: KagentiDiscoveryFailure = { ok: false, reason: 'provider_unreachable', detail: 'timeout' }
    const msg = buildKagentiDiscoveryErrorMessage(result)
    expect(msg).toContain('(timeout)')
  })

  it('has no suffix when detail is absent', () => {
    const result: KagentiDiscoveryFailure = { ok: false, reason: 'provider_unreachable' }
    const msg = buildKagentiDiscoveryErrorMessage(result)
    expect(msg).not.toContain('(')
  })
it('returns no agents message for no_agents_discovered reason', () => {
  const result: KagentiDiscoveryFailure = { ok: false, reason: 'no_agents_discovered' }
  const msg = buildKagentiDiscoveryErrorMessage(result)
  expect(msg).toContain('No Kagenti agents discovered')
  expect(msg).toContain('Kagenti is reachable')
})

  it('formats title with bold markdown', () => {
    const result: KagentiDiscoveryFailure = { ok: false, reason: 'provider_unreachable' }
    expect(buildKagentiDiscoveryErrorMessage(result)).toMatch(/^\*\*/)
  })

  it('separates title and body with double newline', () => {
    const result: KagentiDiscoveryFailure = { ok: false, reason: 'no_agents_discovered' }
    expect(buildKagentiDiscoveryErrorMessage(result)).toContain('\n\n')
  })


// ─── Constants ───────────────────────────────────────────────────────────────

describe('exported constants', () => {
  it('KAGENTI_PROVIDER_UNAVAILABLE_EVENT has correct value', () => {
    expect(KAGENTI_PROVIDER_UNAVAILABLE_EVENT).toBe('kagenti_provider_unavailable')
  })

  it('KAGENTI_NO_AGENTS_DISCOVERED_EVENT has correct value', () => {
    expect(KAGENTI_NO_AGENTS_DISCOVERED_EVENT).toBe('kagenti_no_agents_discovered')
  })
})