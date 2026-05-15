import { describe, it, expect, vi } from 'vitest'
import type { MissionMessage } from '../useMissionTypes'

vi.mock('../../lib/i18n', () => ({
  default: {
    t: (key: string, params?: { reasonSuffix?: string }) => `t:${key}${params?.reasonSuffix || ''}`,
  },
}))

import {
  getMissionMessages,
  isStaleAgentErrorMessage,
  buildKagentiDiscoveryErrorMessage,
  KAGENTI_PROVIDER_UNAVAILABLE_EVENT,
  KAGENTI_NO_AGENTS_DISCOVERED_EVENT,
} from '../useMissions.helpers'

describe('useMissions.helpers', () => {
  it('returns empty array when messages missing', () => {
    expect(getMissionMessages()).toEqual([])
  })

  it('returns same array reference when messages provided', () => {
    const messages: MissionMessage[] = [
      { id: 'm1', role: 'user', content: 'hello', timestamp: new Date() },
    ]
    expect(getMissionMessages(messages)).toBe(messages)
  })

  it('detects stale agent disconnect system messages', () => {
    const stale: MissionMessage = {
      id: 'm2',
      role: 'system',
      content: 'Local Agent Not Connected — retry later',
      timestamp: new Date(),
    }
    const fresh: MissionMessage = {
      id: 'm3',
      role: 'assistant',
      content: 'Local Agent Not Connected',
      timestamp: new Date(),
    }
    expect(isStaleAgentErrorMessage(stale)).toBe(true)
    expect(isStaleAgentErrorMessage(fresh)).toBe(false)
  })

  it('builds provider-unreachable message with detail suffix', () => {
    const msg = buildKagentiDiscoveryErrorMessage({
      ok: false,
      reason: 'provider_unreachable',
      detail: 'HTTP 503',
    })

    expect(msg).toContain('t:missions.kagenti.providerUnavailableTitle')
    expect(msg).toContain('(HTTP 503)')
  })

  it('builds no-agents-discovered message', () => {
    const msg = buildKagentiDiscoveryErrorMessage({
      ok: false,
      reason: 'no_agents_discovered',
    })
    expect(msg).toContain('t:missions.kagenti.noAgentsTitle')
    expect(msg).toContain('t:missions.kagenti.noAgentsDescription')
  })

  it('exports analytics event names for discovery failures', () => {
    expect(KAGENTI_PROVIDER_UNAVAILABLE_EVENT).toBe('kagenti_provider_unavailable')
    expect(KAGENTI_NO_AGENTS_DISCOVERED_EVENT).toBe('kagenti_no_agents_discovered')
  })
})
