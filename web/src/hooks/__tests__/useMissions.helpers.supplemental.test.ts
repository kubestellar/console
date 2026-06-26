/**
 * Supplemental tests for hooks/useMissions.helpers.ts — pure utilities
 * not covered by the existing useMissions.helpers.test.ts file.
 *
 * Covers:
 * - generateRequestId: format, uniqueness, custom prefix
 * - shouldAllowMissingToolWarning: flag check
 * - shouldSkipClusterPreflight: flag check
 * - getMissingTools: from error.details vs fallback
 * - getMissionContextTools: all three context key names, type filtering
 * - resolveMissionToolRequirements: gh/helm pattern matching, context tools merge
 * - buildMissingToolWarning: contains tool summary and heading
 * - buildMissionToolUnavailableError: copies error fields, sets missingTools
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// i18n is used for message strings — mock to return predictable values
vi.mock('../../lib/i18n', () => ({
  default: {
    t: vi.fn((key: string, opts?: Record<string, unknown>) => {
      if (opts?.tools) return `missing: ${opts.tools}`
      if (opts?.reasonSuffix) return `desc${opts.reasonSuffix}`
      return key
    }),
  },
}))

vi.mock('../useMissionPromptBuilder', () => ({
  generateMessageId: vi.fn(() => 'msg-id-1'),
}))

vi.mock('../useMissionStorage', () => ({
  getSelectedKagentiAgentFromStorage: vi.fn(() => null),
  persistSelectedKagentiAgentToStorage: vi.fn(),
}))

vi.mock('../../lib/missions/preflightCheck', () => ({
  resolveRequiredTools: vi.fn((type?: string) => (type === 'helm-deploy' ? ['kubectl', 'helm'] : ['kubectl'])),
}))

import {
  generateRequestId,
  shouldAllowMissingToolWarning,
  shouldSkipClusterPreflight,
  getMissingTools,
  getMissionContextTools,
  resolveMissionToolRequirements,
  buildMissingToolWarning,
  buildMissionToolUnavailableError,
} from '../useMissions.helpers'
import type { PreflightError } from '../../lib/missions/preflightCheck'

// ── generateRequestId ─────────────────────────────────────────────────────────

describe('generateRequestId', () => {
  it('uses default prefix "claude"', () => {
    const id = generateRequestId()
    expect(id.startsWith('claude-')).toBe(true)
  })

  it('uses custom prefix when provided', () => {
    const id = generateRequestId('gpt')
    expect(id.startsWith('gpt-')).toBe(true)
  })

  it('generates unique IDs across calls', () => {
    const ids = new Set(Array.from({ length: 10 }, () => generateRequestId()))
    expect(ids.size).toBe(10)
  })

  it('has format prefix-timestamp-counter-hex', () => {
    const id = generateRequestId('test')
    const parts = id.split('-')
    expect(parts[0]).toBe('test')
    expect(Number(parts[1])).toBeGreaterThan(0)  // timestamp
    expect(Number(parts[2])).toBeGreaterThan(0)  // counter
  })
})

// ── shouldAllowMissingToolWarning ─────────────────────────────────────────────

describe('shouldAllowMissingToolWarning', () => {
  it('returns true when allowMissingLocalTools is true', () => {
    expect(shouldAllowMissingToolWarning({ allowMissingLocalTools: true })).toBe(true)
  })

  it('returns false when allowMissingLocalTools is false', () => {
    expect(shouldAllowMissingToolWarning({ allowMissingLocalTools: false })).toBe(false)
  })

  it('returns false when context is undefined', () => {
    expect(shouldAllowMissingToolWarning(undefined)).toBe(false)
  })

  it('returns false when flag is absent', () => {
    expect(shouldAllowMissingToolWarning({})).toBe(false)
  })
})

// ── shouldSkipClusterPreflight ────────────────────────────────────────────────

describe('shouldSkipClusterPreflight', () => {
  it('returns true when skipClusterPreflight is true', () => {
    expect(shouldSkipClusterPreflight({ skipClusterPreflight: true })).toBe(true)
  })

  it('returns false when skipClusterPreflight is false', () => {
    expect(shouldSkipClusterPreflight({ skipClusterPreflight: false })).toBe(false)
  })

  it('returns false for undefined context', () => {
    expect(shouldSkipClusterPreflight(undefined)).toBe(false)
  })
})

// ── getMissingTools ───────────────────────────────────────────────────────────

describe('getMissingTools', () => {
  it('returns tools from error.details.missingTools when valid string array', () => {
    const err = {
      code: 'missing_tools',
      message: 'tools missing',
      details: { missingTools: ['helm', 'kubectl'] },
    } as PreflightError
    expect(getMissingTools(err, [])).toEqual(['helm', 'kubectl'])
  })

  it('returns fallback when missingTools is absent', () => {
    const err = { code: 'missing_tools', message: 'x', details: {} } as PreflightError
    expect(getMissingTools(err, ['kubectl'])).toEqual(['kubectl'])
  })

  it('returns fallback when missingTools contains non-strings', () => {
    const err = {
      code: 'missing_tools',
      message: 'x',
      details: { missingTools: [123, true] as unknown as string[] },
    } as PreflightError
    expect(getMissingTools(err, ['fallback'])).toEqual(['fallback'])
  })

  it('returns fallback when details is undefined', () => {
    const err = { code: 'missing_tools', message: 'x' } as PreflightError
    expect(getMissingTools(err, ['kubectl'])).toEqual(['kubectl'])
  })
})

// ── getMissionContextTools ────────────────────────────────────────────────────

describe('getMissionContextTools', () => {
  it('collects tools from requiredLocalTools', () => {
    expect(getMissionContextTools({ requiredLocalTools: ['helm'] })).toContain('helm')
  })

  it('collects tools from requiredTools', () => {
    expect(getMissionContextTools({ requiredTools: ['gh'] })).toContain('gh')
  })

  it('collects tools from requiredMissionTools', () => {
    expect(getMissionContextTools({ requiredMissionTools: ['kubectl'] })).toContain('kubectl')
  })

  it('merges all three key sources', () => {
    const tools = getMissionContextTools({
      requiredLocalTools: ['a'],
      requiredTools: ['b'],
      requiredMissionTools: ['c'],
    })
    expect(tools).toContain('a')
    expect(tools).toContain('b')
    expect(tools).toContain('c')
  })

  it('filters out non-string values', () => {
    const tools = getMissionContextTools({
      requiredTools: ['kubectl', 42 as unknown as string, null as unknown as string],
    })
    expect(tools).toEqual(['kubectl'])
  })

  it('returns empty array for undefined context', () => {
    expect(getMissionContextTools(undefined)).toEqual([])
  })
})

// ── resolveMissionToolRequirements ────────────────────────────────────────────

describe('resolveMissionToolRequirements', () => {
  it('detects helm in prompt', () => {
    const { missionSpecificOptionalTools } = resolveMissionToolRequirements({
      prompt: 'helm install my-chart',
    })
    expect(missionSpecificOptionalTools).toContain('helm')
  })

  it('detects gh (GitHub CLI) in prompt', () => {
    const { missionSpecificOptionalTools } = resolveMissionToolRequirements({
      prompt: 'use gh to create a PR',
    })
    expect(missionSpecificOptionalTools).toContain('gh')
  })

  it('detects github cli mention in title', () => {
    const { missionSpecificOptionalTools } = resolveMissionToolRequirements({
      prompt: 'deploy app',
      title: 'use github cli to publish release',
    })
    expect(missionSpecificOptionalTools).toContain('gh')
  })

  it('merges context tools into requiredTools', () => {
    const { requiredTools } = resolveMissionToolRequirements({
      prompt: 'do something',
      context: { requiredTools: ['argocd'] },
    })
    expect(requiredTools).toContain('argocd')
  })

  it('deduplicates tools', () => {
    const { requiredTools } = resolveMissionToolRequirements({
      prompt: 'helm upgrade my-chart',
      type: 'helm-deploy',
    })
    const helmCount = requiredTools.filter(t => t === 'helm').length
    expect(helmCount).toBe(1)
  })

  it('prompt with no tool keywords has empty missionSpecificOptionalTools', () => {
    const { missionSpecificOptionalTools } = resolveMissionToolRequirements({
      prompt: 'check cluster health',
    })
    expect(missionSpecificOptionalTools).toEqual([])
  })
})

// ── buildMissingToolWarning ───────────────────────────────────────────────────

describe('buildMissingToolWarning', () => {
  it('includes the tool summary when missingTools is present', () => {
    const err = {
      code: 'missing_tools',
      message: 'helm not found',
      details: { missingTools: ['helm'] },
    } as PreflightError
    const msg = buildMissingToolWarning(err)
    expect(msg).toContain('helm')
  })

  it('falls back to error.message when missingTools is absent', () => {
    const err = { code: 'missing_tools', message: 'custom error', details: {} } as PreflightError
    const msg = buildMissingToolWarning(err)
    expect(msg).toContain('custom error')
  })

  it('contains the warning heading (bold markdown)', () => {
    const err = { code: 'missing_tools', message: 'x', details: { missingTools: ['kubectl'] } } as PreflightError
    const msg = buildMissingToolWarning(err)
    expect(msg).toContain('**')
  })
})

// ── buildMissionToolUnavailableError ──────────────────────────────────────────

describe('buildMissionToolUnavailableError', () => {
  it('returns a PreflightError with updated missingTools', () => {
    const base = { code: 'missing_tools', message: 'old', details: {} } as PreflightError
    const result = buildMissionToolUnavailableError(base, ['gh', 'helm'])
    expect(result.details?.missingTools).toEqual(['gh', 'helm'])
  })

  it('preserves original error code', () => {
    const base = { code: 'missing_tools', message: 'x', details: {} } as PreflightError
    const result = buildMissionToolUnavailableError(base, [])
    expect(result.code).toBe('missing_tools')
  })

  it('merges existing details fields', () => {
    const base = {
      code: 'missing_tools',
      message: 'x',
      details: { remoteCheckFailed: true, missingTools: [] },
    } as PreflightError
    const result = buildMissionToolUnavailableError(base, ['kubectl'])
    expect((result.details as Record<string, unknown>).remoteCheckFailed).toBe(true)
    expect(result.details?.missingTools).toEqual(['kubectl'])
  })
})
