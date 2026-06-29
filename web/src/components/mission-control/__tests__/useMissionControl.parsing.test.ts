import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getAssistantMessagesSinceLastUser,
  getAssistantContentSinceLastUser,
  createBalancedBlockScanCursor,
  resetBalancedBlockScanCursor,
  resetOversizedWarnings,
  extractJSON,
} from '../useMissionControl.parsing'
import type { MissionConversationMessage } from '../useMissionControl.types'

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}))

const msg = (role: 'user' | 'assistant', content: string): MissionConversationMessage => ({
  role,
  content,
})

describe('getAssistantMessagesSinceLastUser', () => {
  it('returns assistant messages after last user message', () => {
    const messages = [
      msg('user', 'hello'),
      msg('assistant', 'first reply'),
      msg('user', 'second question'),
      msg('assistant', 'second reply'),
      msg('assistant', 'follow-up'),
    ]
    const result = getAssistantMessagesSinceLastUser(messages)
    expect(result).toHaveLength(2)
    expect(result[0].content).toBe('second reply')
    expect(result[1].content).toBe('follow-up')
  })

  it('returns all messages when no user messages exist', () => {
    const messages = [
      msg('assistant', 'greeting'),
      msg('assistant', 'more'),
    ]
    const result = getAssistantMessagesSinceLastUser(messages)
    expect(result).toHaveLength(2)
  })

  it('returns empty array for null/undefined input', () => {
    expect(getAssistantMessagesSinceLastUser(null)).toEqual([])
    expect(getAssistantMessagesSinceLastUser(undefined)).toEqual([])
  })

  it('returns empty array when last message is from user', () => {
    const messages = [
      msg('assistant', 'hi'),
      msg('user', 'bye'),
    ]
    const result = getAssistantMessagesSinceLastUser(messages)
    expect(result).toEqual([])
  })
})

describe('getAssistantContentSinceLastUser', () => {
  it('concatenates assistant content after last user message', () => {
    const messages = [
      msg('user', 'q'),
      msg('assistant', 'part1'),
      msg('assistant', 'part2'),
    ]
    expect(getAssistantContentSinceLastUser(messages)).toBe('part1part2')
  })

  it('returns empty string for no messages', () => {
    expect(getAssistantContentSinceLastUser([])).toBe('')
  })
})

describe('createBalancedBlockScanCursor', () => {
  it('creates a cursor with initial state', () => {
    const cursor = createBalancedBlockScanCursor()
    expect(cursor.lastScanIndex).toBe(0)
    expect(cursor.inString).toBe(false)
    expect(cursor.escape).toBe(false)
    expect(cursor.frames).toEqual([])
    expect(cursor.completedBlocks).toEqual([])
  })
})

describe('resetBalancedBlockScanCursor', () => {
  it('resets all cursor fields to initial state', () => {
    const cursor = createBalancedBlockScanCursor()
    cursor.lastScanIndex = 100
    cursor.inString = true
    cursor.frames = [{ startIndex: 0, opener: '{', expectedCloser: '}' }]
    cursor.completedBlocks = ['{"a":1}']

    resetBalancedBlockScanCursor(cursor)
    expect(cursor.lastScanIndex).toBe(0)
    expect(cursor.inString).toBe(false)
    expect(cursor.frames).toEqual([])
    expect(cursor.completedBlocks).toEqual([])
  })
})

describe('extractJSON', () => {
  beforeEach(() => {
    resetOversizedWarnings()
  })

  it('extracts JSON from fenced code block', () => {
    const text = 'Some text\n```json\n{"projects": [{"name": "falco"}]}\n```\nMore text'
    const result = extractJSON<{ projects: Array<{ name: string }> }>(text, 'projects')
    expect(result).not.toBeNull()
    expect(result?.projects[0].name).toBe('falco')
  })

  it('extracts JSON from bare balanced block when no fence', () => {
    const text = 'Here is the data: {"items": [1, 2, 3]} end'
    const result = extractJSON<{ items: number[] }>(text)
    expect(result).not.toBeNull()
    expect(result?.items).toEqual([1, 2, 3])
  })

  it('returns null when no valid JSON found', () => {
    const text = 'No JSON here at all'
    expect(extractJSON(text)).toBeNull()
  })

  it('prefers block with requiredKey when multiple blocks exist', () => {
    const text = '```json\n{"other": true}\n```\n```json\n{"projects": [{"name": "trivy"}]}\n```'
    const result = extractJSON<{ projects: Array<{ name: string }> }>(text, 'projects')
    expect(result?.projects[0].name).toBe('trivy')
  })

  it('handles malformed JSON gracefully', () => {
    const text = '```json\n{invalid json}\n```'
    expect(extractJSON(text)).toBeNull()
  })

  it('handles nested JSON structures', () => {
    const text = '{"outer": {"inner": [1, 2, {"deep": true}]}}'
    const result = extractJSON<{ outer: { inner: unknown[] } }>(text)
    expect(result?.outer?.inner).toHaveLength(3)
  })

  it('works with cursor for incremental parsing', () => {
    const cursor = createBalancedBlockScanCursor()
    const text = 'prefix {"key": "value"} suffix'
    const result = extractJSON<{ key: string }>(text, undefined, 'test', cursor)
    expect(result?.key).toBe('value')
    // Cursor should be advanced
    expect(cursor.lastScanIndex).toBe(text.length)
  })

  it('handles arrays as top-level JSON', () => {
    const text = 'data: [{"name": "a"}, {"name": "b"}]'
    const result = extractJSON<Array<{ name: string }>>(text)
    expect(result).toHaveLength(2)
  })
})
