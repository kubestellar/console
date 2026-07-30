/**
 * Extended coverage for useMissions.helpers.ts — pure helper functions.
 *
 * Covers functions not tested in the base test file:
 * getLastAssistantMessage, canAutoCompleteMissionFromResponse, generateRequestId,
 * shouldAllowMissingToolWarning, shouldSkipClusterPreflight, getMissingTools,
 * getMissionContextTools, resolveMissionToolRequirements, buildMissingToolWarning,
 * buildMissionToolUnavailableError.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/i18n', () => ({
  default: {
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts) return `[${key}] ${JSON.stringify(opts)}`
      return `[${key}]`
    },
  },
}))

vi.mock('../../lib/missions/preflightCheck', () => ({
  resolveRequiredTools: (type?: string) => {
    if (type === 'deploy') return ['kubectl', 'helm']
    if (type === 'maintain') return ['kubectl']
    if (type === 'repair') return ['kubectl']
    if (type === 'upgrade') return ['kubectl', 'helm']
    return ['kubectl']
  },
}))

vi.mock('../useMissions.constants', () => ({
  AGENT_DISCONNECT_ERROR_PATTERNS: [
    'Local Agent Not Connected',
    'agent not available',
    'agent not responding',
  ],
  isInteractiveContent: (content: string) => {
    const patterns = [
      /\?\s*$/m,
      /\b(?:confirm|choose|select|pick)\b/i,
      /^\s*\d+[.)]\s+/m,
      /before I proceed/i,
      /which (?:option|approach|method)/i,
      /would you (?:like|prefer)/i,
    ]
    return patterns.some(p => p.test(content))
  },
}))

vi.mock('../useMissionPromptBuilder', () => ({
  generateMessageId: () => 'mock-msg-id',
}))

vi.mock('../useMissionStorage', () => ({
  getSelectedKagentiAgentFromStorage: () => null,
  persistSelectedKagentiAgentToStorage: vi.fn(),
}))

vi.mock('../../lib/kagentiProviderBackend', () => ({}))

import {
  getLastAssistantMessage,
  canAutoCompleteMissionFromResponse,
  generateRequestId,
  shouldAllowMissingToolWarning,
  shouldSkipClusterPreflight,
  getMissingTools,
  getMissionContextTools,
  resolveMissionToolRequirements,
  buildMissingToolWarning,
  buildMissionToolUnavailableError,
} from '../useMissions.helpers'

import type { MissionMessage } from '../useMissionTypes'

function makeMessage(role: MissionMessage['role'], content: string, id = 'msg-1'): MissionMessage {
  return { id, role, content, timestamp: new Date() }
}

// ─── getLastAssistantMessage ─────────────────────────────────────────────────

describe('getLastAssistantMessage', () => {
  it('returns undefined for undefined input', () => {
    expect(getLastAssistantMessage(undefined)).toBeUndefined()
  })

  it('returns undefined for empty array', () => {
    expect(getLastAssistantMessage([])).toBeUndefined()
  })

  it('returns undefined when no assistant messages exist', () => {
    const msgs = [makeMessage('user', 'hi'), makeMessage('system', 'connected')]
    expect(getLastAssistantMessage(msgs)).toBeUndefined()
  })

  it('returns the last assistant message when multiple exist', () => {
    const msgs = [
      makeMessage('assistant', 'first', 'a1'),
      makeMessage('user', 'question'),
      makeMessage('assistant', 'second', 'a2'),
    ]
    const result = getLastAssistantMessage(msgs)
    expect(result?.content).toBe('second')
    expect(result?.id).toBe('a2')
  })

  it('returns the only assistant message', () => {
    const msgs = [makeMessage('user', 'hi'), makeMessage('assistant', 'hello', 'a1')]
    expect(getLastAssistantMessage(msgs)?.content).toBe('hello')
  })

  it('ignores system and user messages after last assistant', () => {
    const msgs = [
      makeMessage('assistant', 'response', 'a1'),
      makeMessage('user', 'follow-up'),
      makeMessage('system', 'info'),
    ]
    expect(getLastAssistantMessage(msgs)?.id).toBe('a1')
  })
})

// ─── canAutoCompleteMissionFromResponse ──────────────────────────────────────

describe('canAutoCompleteMissionFromResponse', () => {
  it('returns false when content is empty and no messages', () => {
    expect(canAutoCompleteMissionFromResponse({ content: '', type: 'query' })).toBe(false)
  })

  it('returns false when content is only whitespace', () => {
    expect(canAutoCompleteMissionFromResponse({ content: '   ', type: 'query' })).toBe(false)
  })

  it('returns true for non-interactive content on query type', () => {
    expect(canAutoCompleteMissionFromResponse({ content: 'Done.', type: 'query' })).toBe(true)
  })

  it('returns false for interactive content (ends with ?)', () => {
    expect(canAutoCompleteMissionFromResponse({ content: 'Should I proceed?', type: 'query' })).toBe(false)
  })

  it('returns false for interactive content with numbered options', () => {
    expect(canAutoCompleteMissionFromResponse({
      content: 'Choose an option:\n1. Deploy\n2. Skip',
      type: 'query',
    })).toBe(false)
  })

  it('returns false for deploy type without tools executed', () => {
    expect(canAutoCompleteMissionFromResponse({
      content: 'Deployment complete.',
      type: 'deploy',
      toolsExecuted: false,
    })).toBe(false)
  })

  it('returns true for deploy type with tools executed', () => {
    expect(canAutoCompleteMissionFromResponse({
      content: 'Deployment complete.',
      type: 'deploy',
      toolsExecuted: true,
    })).toBe(true)
  })

  it('returns false for maintain type without tools executed', () => {
    expect(canAutoCompleteMissionFromResponse({
      content: 'Maintenance done.',
      type: 'maintain',
      toolsExecuted: false,
    })).toBe(false)
  })

  it('returns true for maintain type with tools executed', () => {
    expect(canAutoCompleteMissionFromResponse({
      content: 'Maintenance done.',
      type: 'maintain',
      toolsExecuted: true,
    })).toBe(true)
  })

  it('returns true for repair type with tools executed', () => {
    expect(canAutoCompleteMissionFromResponse({
      content: 'Fixed.',
      type: 'repair',
      toolsExecuted: true,
    })).toBe(true)
  })

  it('returns true for upgrade type with tools executed', () => {
    expect(canAutoCompleteMissionFromResponse({
      content: 'Upgraded.',
      type: 'upgrade',
      toolsExecuted: true,
    })).toBe(true)
  })

  it('returns true for unknown type without tools (not in tool-requiring list)', () => {
    expect(canAutoCompleteMissionFromResponse({
      content: 'Result.',
      type: 'query',
      toolsExecuted: false,
    })).toBe(true)
  })

  it('falls back to last assistant message when content is empty', () => {
    const msgs = [makeMessage('assistant', 'All done.')]
    expect(canAutoCompleteMissionFromResponse({ messages: msgs, type: 'query' })).toBe(true)
  })

  it('falls back to last assistant message with interactive content', () => {
    const msgs = [makeMessage('assistant', 'Which option would you prefer?')]
    expect(canAutoCompleteMissionFromResponse({ messages: msgs, type: 'query' })).toBe(false)
  })

  it('returns false when content is undefined and no messages', () => {
    expect(canAutoCompleteMissionFromResponse({ type: 'query' })).toBe(false)
  })
})

// ─── generateRequestId ───────────────────────────────────────────────────────

describe('generateRequestId', () => {
  beforeEach(() => {
    vi.stubGlobal('crypto', {
      randomUUID: () => '12345678-abcd-1234-efgh-123456789012',
    })
  })

  it('starts with default "claude" prefix', () => {
    const id = generateRequestId()
    expect(id.startsWith('claude-')).toBe(true)
  })

  it('supports custom prefix', () => {
    const id = generateRequestId('kagent')
    expect(id.startsWith('kagent-')).toBe(true)
  })

  it('generates unique IDs on consecutive calls', () => {
    const ids = new Set(Array.from({ length: 10 }, () => generateRequestId()))
    expect(ids.size).toBe(10)
  })

  it('includes timestamp in the ID', () => {
    const before = Date.now()
    const id = generateRequestId()
    const parts = id.split('-')
    const timestamp = parseInt(parts[1], 10)
    expect(timestamp).toBeGreaterThanOrEqual(before)
    expect(timestamp).toBeLessThanOrEqual(Date.now())
  })

  it('includes monotonic counter to prevent collisions', () => {
    const id1 = generateRequestId()
    const id2 = generateRequestId()
    const counter1 = parseInt(id1.split('-')[2], 10)
    const counter2 = parseInt(id2.split('-')[2], 10)
    expect(counter2).toBeGreaterThan(counter1)
  })
})

// ─── shouldAllowMissingToolWarning ───────────────────────────────────────────

describe('shouldAllowMissingToolWarning', () => {
  it('returns false for undefined context', () => {
    expect(shouldAllowMissingToolWarning(undefined)).toBe(false)
  })

  it('returns false for empty context', () => {
    expect(shouldAllowMissingToolWarning({})).toBe(false)
  })

  it('returns false when allowMissingLocalTools is false', () => {
    expect(shouldAllowMissingToolWarning({ allowMissingLocalTools: false })).toBe(false)
  })

  it('returns true when allowMissingLocalTools is true', () => {
    expect(shouldAllowMissingToolWarning({ allowMissingLocalTools: true })).toBe(true)
  })

  it('returns false for truthy non-boolean value', () => {
    expect(shouldAllowMissingToolWarning({ allowMissingLocalTools: 'yes' })).toBe(false)
  })
})

// ─── shouldSkipClusterPreflight ──────────────────────────────────────────────

describe('shouldSkipClusterPreflight', () => {
  it('returns false for undefined context', () => {
    expect(shouldSkipClusterPreflight(undefined)).toBe(false)
  })

  it('returns false for empty context', () => {
    expect(shouldSkipClusterPreflight({})).toBe(false)
  })

  it('returns false when skipClusterPreflight is false', () => {
    expect(shouldSkipClusterPreflight({ skipClusterPreflight: false })).toBe(false)
  })

  it('returns true when skipClusterPreflight is true', () => {
    expect(shouldSkipClusterPreflight({ skipClusterPreflight: true })).toBe(true)
  })
})

// ─── getMissingTools ─────────────────────────────────────────────────────────

describe('getMissingTools', () => {
  it('returns missingTools from error details when valid string array', () => {
    const error = {
      code: 'tool_missing' as const,
      message: 'Tools not found',
      details: { missingTools: ['kubectl', 'helm'] },
    }
    expect(getMissingTools(error, ['fallback'])).toEqual(['kubectl', 'helm'])
  })

  it('returns fallback when details.missingTools is not an array', () => {
    const error = {
      code: 'tool_missing' as const,
      message: 'Tools not found',
      details: { missingTools: 'kubectl' },
    }
    expect(getMissingTools(error, ['default-tool'])).toEqual(['default-tool'])
  })

  it('returns fallback when details is undefined', () => {
    const error = {
      code: 'tool_missing' as const,
      message: 'Tools not found',
    }
    expect(getMissingTools(error, ['kubectl'])).toEqual(['kubectl'])
  })

  it('returns fallback when missingTools contains non-strings', () => {
    const error = {
      code: 'tool_missing' as const,
      message: 'Tools not found',
      details: { missingTools: [123, null] },
    }
    expect(getMissingTools(error, ['fallback'])).toEqual(['fallback'])
  })

  it('returns empty array from details when missingTools is empty', () => {
    const error = {
      code: 'tool_missing' as const,
      message: 'None',
      details: { missingTools: [] },
    }
    expect(getMissingTools(error, ['fallback'])).toEqual([])
  })
})

// ─── getMissionContextTools ──────────────────────────────────────────────────

describe('getMissionContextTools', () => {
  it('returns empty array for undefined context', () => {
    expect(getMissionContextTools(undefined)).toEqual([])
  })

  it('returns empty array for empty context', () => {
    expect(getMissionContextTools({})).toEqual([])
  })

  it('extracts from requiredLocalTools', () => {
    expect(getMissionContextTools({ requiredLocalTools: ['kubectl'] })).toEqual(['kubectl'])
  })

  it('extracts from requiredTools', () => {
    expect(getMissionContextTools({ requiredTools: ['helm', 'kubectl'] })).toEqual(['helm', 'kubectl'])
  })

  it('extracts from requiredMissionTools', () => {
    expect(getMissionContextTools({ requiredMissionTools: ['gh'] })).toEqual(['gh'])
  })

  it('combines tools from all context keys', () => {
    const result = getMissionContextTools({
      requiredLocalTools: ['kubectl'],
      requiredTools: ['helm'],
      requiredMissionTools: ['gh'],
    })
    expect(result).toEqual(['kubectl', 'helm', 'gh'])
  })

  it('filters out non-string values', () => {
    const result = getMissionContextTools({
      requiredLocalTools: ['kubectl', 123, null, 'helm'] as unknown as string[],
    })
    expect(result).toEqual(['kubectl', 'helm'])
  })

  it('ignores non-array values for context keys', () => {
    const result = getMissionContextTools({
      requiredLocalTools: 'kubectl' as unknown as string[],
      requiredTools: ['helm'],
    })
    expect(result).toEqual(['helm'])
  })
})

// ─── resolveMissionToolRequirements ──────────────────────────────────────────

describe('resolveMissionToolRequirements', () => {
  it('includes base required tools from type', () => {
    const result = resolveMissionToolRequirements({ prompt: 'test', type: 'deploy' })
    expect(result.requiredTools).toContain('kubectl')
    expect(result.requiredTools).toContain('helm')
  })

  it('detects gh from prompt text', () => {
    const result = resolveMissionToolRequirements({ prompt: 'use gh to create PR' })
    expect(result.missionSpecificOptionalTools).toContain('gh')
    expect(result.requiredTools).toContain('gh')
  })

  it('detects helm from title', () => {
    const result = resolveMissionToolRequirements({ title: 'Deploy with helm', prompt: '' })
    expect(result.missionSpecificOptionalTools).toContain('helm')
  })

  it('detects github cli from description', () => {
    const result = resolveMissionToolRequirements({ description: 'Use github cli to PR', prompt: '' })
    expect(result.missionSpecificOptionalTools).toContain('gh')
  })

  it('includes context tools', () => {
    const result = resolveMissionToolRequirements({
      prompt: 'test',
      context: { requiredTools: ['custom-tool'] },
    })
    expect(result.requiredTools).toContain('custom-tool')
  })

  it('deduplicates tools', () => {
    const result = resolveMissionToolRequirements({
      prompt: 'use helm chart',
      type: 'deploy',
      context: { requiredTools: ['helm'] },
    })
    const helmCount = result.requiredTools.filter(t => t === 'helm').length
    expect(helmCount).toBe(1)
  })

  it('returns empty optional tools when no optional patterns match', () => {
    const result = resolveMissionToolRequirements({ prompt: 'simple query', type: 'query' })
    expect(result.missionSpecificOptionalTools).toEqual([])
  })
})

// ─── buildMissingToolWarning ─────────────────────────────────────────────────

describe('buildMissingToolWarning', () => {
  it('includes heading and suffix i18n keys', () => {
    const error = {
      code: 'tool_missing' as const,
      message: 'Some tools missing',
      details: { missingTools: ['kubectl'] },
    }
    const result = buildMissingToolWarning(error)
    expect(result).toContain('missions.preflight.toolWarning.heading')
    expect(result).toContain('missions.preflight.toolWarning.suffix')
  })

  it('includes tool names via summary i18n key', () => {
    const error = {
      code: 'tool_missing' as const,
      message: 'msg',
      details: { missingTools: ['kubectl', 'helm'] },
    }
    const result = buildMissingToolWarning(error)
    expect(result).toContain('missions.preflight.toolWarning.summary')
    expect(result).toContain('kubectl, helm')
  })

  it('falls back to error.message when no missingTools in details', () => {
    const error = {
      code: 'tool_missing' as const,
      message: 'Something went wrong',
    }
    const result = buildMissingToolWarning(error)
    expect(result).toContain('Something went wrong')
  })

  it('uses bold markdown formatting for heading', () => {
    const error = {
      code: 'tool_missing' as const,
      message: 'test',
      details: { missingTools: ['x'] },
    }
    const result = buildMissingToolWarning(error)
    expect(result).toMatch(/^\*\*/)
  })
})

// ─── buildMissionToolUnavailableError ────────────────────────────────────────

describe('buildMissionToolUnavailableError', () => {
  it('returns error with updated message containing tool names', () => {
    const error = {
      code: 'tool_missing' as const,
      message: 'original',
      details: { existing: true },
    }
    const result = buildMissionToolUnavailableError(error, ['gh', 'helm'])
    expect(result.code).toBe('tool_missing')
    expect(result.message).toContain('missions.preflight.optionalToolUnavailable.message')
    expect(result.message).toContain('gh, helm')
  })

  it('preserves existing details and adds missingTools', () => {
    const error = {
      code: 'tool_missing' as const,
      message: 'original',
      details: { existing: true },
    }
    const result = buildMissionToolUnavailableError(error, ['kubectl'])
    expect(result.details?.missingTools).toEqual(['kubectl'])
    expect(result.details?.existing).toBe(true)
  })

  it('handles error without existing details', () => {
    const error = {
      code: 'tool_missing' as const,
      message: 'original',
    }
    const result = buildMissionToolUnavailableError(error, ['kubectl'])
    expect(result.details?.missingTools).toEqual(['kubectl'])
  })
})
