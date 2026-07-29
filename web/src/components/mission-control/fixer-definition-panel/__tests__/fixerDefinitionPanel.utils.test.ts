import { describe, it, expect } from 'vitest'
import type { PayloadProject } from '../../types'
import {
  stripMissionPlannerJson,
  getCategoryCounts,
  getPriorityCounts,
  getTotalDependencies,
} from '../fixerDefinitionPanel.utils'

function project(overrides: Partial<PayloadProject>): PayloadProject {
  return {
    name: overrides.name ?? 'p',
    displayName: overrides.displayName ?? 'P',
    reason: overrides.reason ?? '',
    category: overrides.category ?? 'observability',
    priority: overrides.priority ?? 'recommended',
    dependencies: overrides.dependencies ?? [],
    ...overrides,
  }
}

// ─── stripMissionPlannerJson ─────────────────────────────────────────────────

describe('stripMissionPlannerJson', () => {
  it('strips fenced ```json blocks', () => {
    const input = 'Preamble\n```json\n{"a":1}\n```\nTrailer'
    expect(stripMissionPlannerJson(input)).toBe('Preamble\n\nTrailer')
  })

  it('strips generic fenced code blocks after json blocks', () => {
    const input = 'Header\n```\ncode\n```\nFooter'
    expect(stripMissionPlannerJson(input)).toBe('Header\n\nFooter')
  })

  it('strips multiple fenced blocks in one string', () => {
    const input = '```json\n{}\n```\nMiddle\n```\nother\n```'
    expect(stripMissionPlannerJson(input)).toBe('Middle')
  })

  it('trims surrounding whitespace', () => {
    expect(stripMissionPlannerJson('   text   ')).toBe('text')
  })

  it('returns empty string when input is only a fenced block', () => {
    expect(stripMissionPlannerJson('```json\n{"x":true}\n```')).toBe('')
  })

  it('leaves plain text without fences unchanged apart from trimming', () => {
    expect(stripMissionPlannerJson('  hello world  ')).toBe('hello world')
  })
})

// ─── getCategoryCounts ───────────────────────────────────────────────────────

describe('getCategoryCounts', () => {
  it('returns empty array for empty input', () => {
    expect(getCategoryCounts([])).toEqual([])
  })

  it('counts a single category', () => {
    const result = getCategoryCounts([project({ category: 'security' })])
    expect(result).toEqual([['security', 1]])
  })

  it('groups multiple projects by category', () => {
    const result = getCategoryCounts([
      project({ name: 'a', category: 'security' }),
      project({ name: 'b', category: 'security' }),
      project({ name: 'c', category: 'observability' }),
    ])
    expect(result).toEqual([
      ['security', 2],
      ['observability', 1],
    ])
  })

  it('sorts categories by descending count', () => {
    const result = getCategoryCounts([
      project({ name: 'a', category: 'small' }),
      project({ name: 'b', category: 'big' }),
      project({ name: 'c', category: 'big' }),
      project({ name: 'd', category: 'big' }),
      project({ name: 'e', category: 'medium' }),
      project({ name: 'f', category: 'medium' }),
    ])
    expect(result.map(([k]) => k)).toEqual(['big', 'medium', 'small'])
    expect(result.map(([, v]) => v)).toEqual([3, 2, 1])
  })
})

// ─── getPriorityCounts ───────────────────────────────────────────────────────

describe('getPriorityCounts', () => {
  it('returns zeros for empty input', () => {
    expect(getPriorityCounts([])).toEqual({ required: 0, recommended: 0, optional: 0 })
  })

  it('counts each priority bucket independently', () => {
    const projects = [
      project({ priority: 'required' }),
      project({ priority: 'required' }),
      project({ priority: 'recommended' }),
      project({ priority: 'optional' }),
      project({ priority: 'optional' }),
      project({ priority: 'optional' }),
    ]
    expect(getPriorityCounts(projects)).toEqual({ required: 2, recommended: 1, optional: 3 })
  })

  it('ignores unknown priority values by returning zero for known buckets', () => {
    // priority is typed as a union, but at runtime the counter should still
    // safely return zero for buckets that have no matches.
    const projects = [
      project({ priority: 'required' }),
      { ...project({}), priority: 'unknown' as unknown as 'required' },
    ]
    expect(getPriorityCounts(projects)).toEqual({ required: 1, recommended: 0, optional: 0 })
  })
})

// ─── getTotalDependencies ────────────────────────────────────────────────────

describe('getTotalDependencies', () => {
  it('returns 0 for empty input', () => {
    expect(getTotalDependencies([])).toBe(0)
  })

  it('returns 0 when no project has dependencies', () => {
    expect(getTotalDependencies([project({ dependencies: [] }), project({ dependencies: [] })])).toBe(0)
  })

  it('counts the union of dependencies across all projects (deduplicated)', () => {
    const projects = [
      project({ name: 'a', dependencies: ['helm', 'cert-manager'] }),
      project({ name: 'b', dependencies: ['helm', 'prometheus'] }),
      project({ name: 'c', dependencies: ['cert-manager'] }),
    ]
    // Union: helm, cert-manager, prometheus → 3 unique
    expect(getTotalDependencies(projects)).toBe(3)
  })
})
