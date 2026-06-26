/**
 * Tests for the pure helper functions in UnifiedCardAdapter.tsx.
 *
 * The adapter component itself pulls in UnifiedCard + useDataHookRegistryVersion
 * + getCardConfig, which makes full rendering tests expensive. Instead we test
 * the three exported predicate/status helpers which are pure functions over
 * the UNIFIED_READY_CARDS / UNIFIED_EXCLUDED_CARDS sets + a mocked config
 * registry.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockConfig: { current: Record<string, unknown> | null } = { current: null }
vi.mock('../../../../config/cards', () => ({
  getCardConfig: (_type: string) => mockConfig.current,
}))

import {
  UNIFIED_READY_CARDS,
  UNIFIED_EXCLUDED_CARDS,
  shouldUseUnifiedCard,
  hasValidUnifiedConfig,
  getCardMigrationStatus,
  getCardsByMigrationStatus,
} from '../UnifiedCardAdapter'

describe('UnifiedCardAdapter — static sets', () => {
  it('UNIFIED_READY_CARDS is a non-empty Set', () => {
    expect(UNIFIED_READY_CARDS).toBeInstanceOf(Set)
    expect(UNIFIED_READY_CARDS.size).toBeGreaterThan(0)
  })

  it('UNIFIED_EXCLUDED_CARDS is a Set', () => {
    expect(UNIFIED_EXCLUDED_CARDS).toBeInstanceOf(Set)
  })

  it('no card is in both ready and excluded sets', () => {
    for (const ready of UNIFIED_READY_CARDS) {
      expect(UNIFIED_EXCLUDED_CARDS.has(ready)).toBe(false)
    }
  })
})

describe('shouldUseUnifiedCard', () => {
  it('returns true for a card in the ready set', () => {
    const anyReady = Array.from(UNIFIED_READY_CARDS)[0]
    expect(shouldUseUnifiedCard(anyReady)).toBe(true)
  })

  it('returns false for a card in the excluded set (even if also ready)', () => {
    const anyExcluded = Array.from(UNIFIED_EXCLUDED_CARDS)[0] ?? 'made-up-excluded'
    // Even hypothetically, excluded should short-circuit first.
    if (UNIFIED_EXCLUDED_CARDS.size > 0) {
      expect(shouldUseUnifiedCard(anyExcluded)).toBe(false)
    }
  })

  it('returns false for an unknown card', () => {
    expect(shouldUseUnifiedCard('this-card-does-not-exist-123')).toBe(false)
  })
})

describe('hasValidUnifiedConfig', () => {
  beforeEach(() => { mockConfig.current = null })

  it('returns false when no config is registered', () => {
    mockConfig.current = null
    expect(hasValidUnifiedConfig('whatever')).toBe(false)
  })

  it('returns false when required fields are missing', () => {
    mockConfig.current = { type: 'something' } // missing dataSource and content
    expect(hasValidUnifiedConfig('whatever')).toBe(false)
  })

  it('returns false when content.type is not one of the supported types', () => {
    mockConfig.current = {
      type: 'something',
      dataSource: { type: 'hook', hook: 'useThing' },
      content: { type: 'unsupported-thing' },
    }
    expect(hasValidUnifiedConfig('whatever')).toBe(false)
  })

  it('returns false when dataSource is hook but hook is empty', () => {
    mockConfig.current = {
      type: 'something',
      dataSource: { type: 'hook' },
      content: { type: 'list' },
    }
    expect(hasValidUnifiedConfig('whatever')).toBe(false)
  })

  it('returns true when all required fields are present and content type is supported', () => {
    mockConfig.current = {
      type: 'pod_issues',
      dataSource: { type: 'hook', hook: 'useCachedPodIssues' },
      content: { type: 'list' },
    }
    expect(hasValidUnifiedConfig('pod_issues')).toBe(true)
  })

  it('accepts all four supported content types', () => {
    for (const ct of ['list', 'table', 'chart', 'status-grid']) {
      mockConfig.current = {
        type: 'x',
        dataSource: { type: 'hook', hook: 'h' },
        content: { type: ct },
      }
      expect(hasValidUnifiedConfig('x')).toBe(true)
    }
  })
})

describe('getCardMigrationStatus', () => {
  beforeEach(() => { mockConfig.current = null })

  it('returns status=excluded for excluded cards', () => {
    const excluded = Array.from(UNIFIED_EXCLUDED_CARDS)[0]
    if (!excluded) return
    const result = getCardMigrationStatus(excluded)
    expect(result.status).toBe('excluded')
    expect(result.reason).toBeDefined()
  })

  it('returns status=unified for ready cards', () => {
    const ready = Array.from(UNIFIED_READY_CARDS)[0]
    const result = getCardMigrationStatus(ready)
    expect(result.status).toBe('unified')
  })

  it('returns status=ready when not in ready set but config is valid', () => {
    mockConfig.current = {
      type: 'new-card',
      dataSource: { type: 'hook', hook: 'useNew' },
      content: { type: 'list' },
    }
    const result = getCardMigrationStatus('new-card-not-in-sets')
    expect(result.status).toBe('ready')
  })

  it('returns status=pending when config is incomplete', () => {
    mockConfig.current = null
    const result = getCardMigrationStatus('mystery-card')
    expect(result.status).toBe('pending')
  })
})

describe('getCardsByMigrationStatus', () => {
  it('groups cards by their migration status', () => {
    const groups = getCardsByMigrationStatus()
    expect(groups).toHaveProperty('unified')
    expect(groups).toHaveProperty('ready')
    expect(groups).toHaveProperty('pending')
    expect(groups).toHaveProperty('excluded')
    expect(Array.isArray(groups.unified)).toBe(true)
    expect(groups.unified.length).toBe(UNIFIED_READY_CARDS.size)
    expect(groups.excluded.length).toBe(UNIFIED_EXCLUDED_CARDS.size)
  })
})
