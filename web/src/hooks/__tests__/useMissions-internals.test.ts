import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../mcp/shared', () => ({
  agentFetch: vi.fn(),
  clusterCacheRef: { clusters: [] },
  REFRESH_INTERVAL_MS: 120_000,
  CLUSTER_POLL_INTERVAL_MS: 60_000,
}))
vi.mock('../useDemoMode', () => ({
  getDemoMode: vi.fn(() => false),
  default: vi.fn(() => false),
}))
vi.mock('../useLocalAgent', () => ({
  useLocalAgent: vi.fn(() => ({ isConnected: false })),
  isAgentUnavailable: vi.fn(() => false),
  isAgentConnected: vi.fn(() => false),
  reportAgentDataSuccess: vi.fn(),
  reportAgentDataError: vi.fn(),
}))
vi.mock('../../lib/utils/wsAuth', () => ({
  appendWsAuthToken: vi.fn((url: string) => url),
}))
vi.mock('../useTokenUsage', () => ({
  addCategoryTokens: vi.fn(),
  setActiveTokenCategory: vi.fn(),
  clearActiveTokenCategory: vi.fn(),
  getActiveTokenCategories: vi.fn(() => []),
}))
vi.mock('../useResolutions', () => ({
  detectIssueSignature: vi.fn(() => ({ type: 'Unknown' })),
  findSimilarResolutionsStandalone: vi.fn(() => []),
  generateResolutionPromptContext: vi.fn(() => ''),
}))
vi.mock('../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
    LOCAL_AGENT_WS_URL: 'ws://localhost:8585/ws',
    LOCAL_AGENT_HTTP_URL: 'http://localhost:8585',
  }
})
vi.mock('../../lib/analytics', () => ({
  emitMissionStarted: vi.fn(),
  emitMissionCompleted: vi.fn(),
  emitMissionError: vi.fn(),
  emitMissionRated: vi.fn(),
  emitAgentTokenFailure: vi.fn(),
  emitWsAuthMissing: vi.fn(),
  emitSseAuthFailure: vi.fn(),
}))

const { __missionsTestables } = await import('../useMissions')

const {
  generateRequestId,
  isStaleAgentErrorMessage,
  MISSION_RECONNECT_DELAY_MS,
  MISSION_RECONNECT_MAX_AGE_MS,
  MAX_RESENT_MESSAGES,
  WS_RECONNECT_INITIAL_DELAY_MS,
  WS_RECONNECT_MAX_DELAY_MS,
  WS_RECONNECT_MAX_RETRIES,
  WS_CONNECTION_TIMEOUT_MS,
  STATUS_WAITING_DELAY_MS,
  STATUS_PROCESSING_DELAY_MS,
  MISSION_TIMEOUT_MS,
  MISSION_TIMEOUT_CHECK_INTERVAL_MS,
  MISSION_INACTIVITY_TIMEOUT_MS,
  CANCEL_ACK_TIMEOUT_MS,
  CANCEL_ACK_MESSAGE_TYPE,
  CANCEL_CONFIRMED_MESSAGE_TYPE,
  WAITING_INPUT_TIMEOUT_MS,
  AGENT_DISCONNECT_ERROR_PATTERNS,
} = __missionsTestables

beforeEach(() => {
  localStorage.clear()
})

// ── Constants ──

describe('mission constants', () => {
  it('MISSION_RECONNECT_DELAY_MS is a positive number', () => {
    expect(MISSION_RECONNECT_DELAY_MS).toBeGreaterThan(0)
  })

  it('MISSION_RECONNECT_MAX_AGE_MS is at least 10 minutes', () => {
    expect(MISSION_RECONNECT_MAX_AGE_MS).toBeGreaterThanOrEqual(600_000)
  })

  it('MAX_RESENT_MESSAGES is a positive integer', () => {
    expect(Number.isInteger(MAX_RESENT_MESSAGES)).toBe(true)
    expect(MAX_RESENT_MESSAGES).toBeGreaterThan(0)
  })

  it('WS_RECONNECT_INITIAL_DELAY_MS is positive', () => {
    expect(WS_RECONNECT_INITIAL_DELAY_MS).toBeGreaterThan(0)
  })

  it('WS_RECONNECT_MAX_DELAY_MS is greater than initial delay', () => {
    expect(WS_RECONNECT_MAX_DELAY_MS).toBeGreaterThan(WS_RECONNECT_INITIAL_DELAY_MS)
  })

  it('WS_RECONNECT_MAX_RETRIES is a positive integer', () => {
    expect(Number.isInteger(WS_RECONNECT_MAX_RETRIES)).toBe(true)
    expect(WS_RECONNECT_MAX_RETRIES).toBeGreaterThan(0)
  })

  it('WS_CONNECTION_TIMEOUT_MS is positive', () => {
    expect(WS_CONNECTION_TIMEOUT_MS).toBeGreaterThan(0)
  })

  it('STATUS_WAITING_DELAY_MS is positive', () => {
    expect(STATUS_WAITING_DELAY_MS).toBeGreaterThan(0)
  })

  it('STATUS_PROCESSING_DELAY_MS is greater than waiting delay', () => {
    expect(STATUS_PROCESSING_DELAY_MS).toBeGreaterThan(STATUS_WAITING_DELAY_MS)
  })

  it('MISSION_TIMEOUT_MS is at least 5 minutes', () => {
    expect(MISSION_TIMEOUT_MS).toBeGreaterThanOrEqual(300_000)
  })

  it('MISSION_TIMEOUT_CHECK_INTERVAL_MS is shorter than timeout', () => {
    expect(MISSION_TIMEOUT_CHECK_INTERVAL_MS).toBeLessThan(MISSION_TIMEOUT_MS)
  })

  it('MISSION_INACTIVITY_TIMEOUT_MS is positive', () => {
    expect(MISSION_INACTIVITY_TIMEOUT_MS).toBeGreaterThan(0)
  })

  it('CANCEL_ACK_TIMEOUT_MS is positive', () => {
    expect(CANCEL_ACK_TIMEOUT_MS).toBeGreaterThan(0)
  })

  it('CANCEL_ACK_MESSAGE_TYPE is a non-empty string', () => {
    expect(typeof CANCEL_ACK_MESSAGE_TYPE).toBe('string')
    expect(CANCEL_ACK_MESSAGE_TYPE.length).toBeGreaterThan(0)
  })

  it('CANCEL_CONFIRMED_MESSAGE_TYPE is a non-empty string', () => {
    expect(typeof CANCEL_CONFIRMED_MESSAGE_TYPE).toBe('string')
    expect(CANCEL_CONFIRMED_MESSAGE_TYPE.length).toBeGreaterThan(0)
  })

  it('WAITING_INPUT_TIMEOUT_MS is at least 5 minutes', () => {
    expect(WAITING_INPUT_TIMEOUT_MS).toBeGreaterThanOrEqual(300_000)
  })

  it('AGENT_DISCONNECT_ERROR_PATTERNS has at least one pattern', () => {
    expect(AGENT_DISCONNECT_ERROR_PATTERNS.length).toBeGreaterThan(0)
    for (const p of AGENT_DISCONNECT_ERROR_PATTERNS) {
      expect(typeof p).toBe('string')
    }
  })
})

// ── generateRequestId ──

describe('generateRequestId', () => {
  it('generates unique IDs', () => {
    const id1 = generateRequestId()
    const id2 = generateRequestId()
    expect(id1).not.toBe(id2)
  })

  it('uses default prefix', () => {
    const id = generateRequestId()
    expect(id.startsWith('claude-')).toBe(true)
  })

  it('uses custom prefix', () => {
    const id = generateRequestId('test')
    expect(id.startsWith('test-')).toBe(true)
  })

  it('contains a timestamp-like segment', () => {
    const id = generateRequestId()
    const parts = id.split('-')
    expect(parts.length).toBeGreaterThanOrEqual(3)
    const timestamp = parseInt(parts[1], 10)
    expect(timestamp).toBeGreaterThan(0)
  })

  it('contains a counter segment that increments', () => {
    const id1 = generateRequestId()
    const id2 = generateRequestId()
    const counter1 = parseInt(id1.split('-')[2], 10)
    const counter2 = parseInt(id2.split('-')[2], 10)
    expect(counter2).toBeGreaterThan(counter1)
  })

  it('contains a random suffix', () => {
    const id = generateRequestId()
    const parts = id.split('-')
    const suffix = parts[parts.length - 1]
    expect(suffix.length).toBe(6)
  })
})

// ── isStaleAgentErrorMessage ──

describe('isStaleAgentErrorMessage', () => {
  it('returns true for system message with "Local Agent Not Connected"', () => {
    expect(isStaleAgentErrorMessage({
      role: 'system',
      content: 'Local Agent Not Connected — check agent status',
    })).toBe(true)
  })

  it('returns true for system message with "agent not available"', () => {
    expect(isStaleAgentErrorMessage({
      role: 'system',
      content: 'Error: agent not available at this time',
    })).toBe(true)
  })

  it('returns true for system message with "agent not responding"', () => {
    expect(isStaleAgentErrorMessage({
      role: 'system',
      content: 'The agent not responding after 30 seconds',
    })).toBe(true)
  })

  it('returns false for non-system messages', () => {
    expect(isStaleAgentErrorMessage({
      role: 'user',
      content: 'Local Agent Not Connected',
    })).toBe(false)
  })

  it('returns false for assistant messages', () => {
    expect(isStaleAgentErrorMessage({
      role: 'assistant',
      content: 'agent not available',
    })).toBe(false)
  })

  it('returns false for system messages without error patterns', () => {
    expect(isStaleAgentErrorMessage({
      role: 'system',
      content: 'Mission started successfully',
    })).toBe(false)
  })

  it('returns false for empty system message', () => {
    expect(isStaleAgentErrorMessage({
      role: 'system',
      content: '',
    })).toBe(false)
  })
})
