import { describe, it, expect } from 'vitest'
import {
  stripMissionPlannerJson,
  getCategoryCounts,
  getPriorityCounts,
  getTotalDependencies,
} from '../fixerDefinitionPanel.utils'
import type { PayloadProject } from '../../types'

const makeProject = (overrides: Partial<PayloadProject> = {}): PayloadProject => ({
  name: 'falco',
  displayName: 'Falco',
  reason: 'runtime security',
  category: 'Security',
  priority: 'required',
  dependencies: [],
  ...overrides,
})

describe('stripMissionPlannerJson', () => {
  it('removes fenced ```json blocks', () => {
    const input = 'intro\n```json\n{"a":1}\n```\ntrailing'
    expect(stripMissionPlannerJson(input)).toBe('intro\n\ntrailing')
  })

  it('removes generic fenced code blocks after json blocks are stripped', () => {
    const input = 'hello\n```\nsome code\n```\nworld'
    expect(stripMissionPlannerJson(input)).toBe('hello\n\nworld')
  })

  it('removes multiple fenced blocks in one string', () => {
    const input = '```json\n{}\n```\nA\n```\nx\n```\nB'
    expect(stripMissionPlannerJson(input)).toBe('A\n\nB')
  })

  it('trims surrounding whitespace', () => {
    expect(stripMissionPlannerJson('   \n```json\n{}\n```\n   ')).toBe('')
  })

  it('returns plain content unchanged (aside from trimming)', () => {
    expect(stripMissionPlannerJson('  hello world  ')).toBe('hello world')
  })

  it('handles empty input', () => {
    expect(stripMissionPlannerJson('')).toBe('')
  })
})

describe('getCategoryCounts', () => {
  it('returns an empty array for no projects', () => {
    expect(getCategoryCounts([])).toEqual([])
  })

  it('counts categories and sorts descending by count', () => {
    const projects = [
      makeProject({ category: 'Security' }),
      makeProject({ category: 'Monitoring' }),
      makeProject({ category: 'Security' }),
      makeProject({ category: 'Security' }),
      makeProject({ category: 'Monitoring' }),
      makeProject({ category: 'Networking' }),
    ]
    expect(getCategoryCounts(projects)).toEqual([
      ['Security', 3],
      ['Monitoring', 2],
      ['Networking', 1],
    ])
  })

  it('handles a single-category input', () => {
    const projects = [makeProject({ category: 'Security' })]
    expect(getCategoryCounts(projects)).toEqual([['Security', 1]])
  })
})

describe('getPriorityCounts', () => {
  it('returns zero counts for empty input', () => {
    expect(getPriorityCounts([])).toEqual({
      required: 0,
      recommended: 0,
      optional: 0,
    })
  })

  it('counts each priority bucket independently', () => {
    const projects = [
      makeProject({ priority: 'required' }),
      makeProject({ priority: 'required' }),
      makeProject({ priority: 'recommended' }),
      makeProject({ priority: 'optional' }),
      makeProject({ priority: 'optional' }),
      makeProject({ priority: 'optional' }),
    ]
    expect(getPriorityCounts(projects)).toEqual({
      required: 2,
      recommended: 1,
      optional: 3,
    })
  })
})

describe('getTotalDependencies', () => {
  it('returns 0 for no projects', () => {
    expect(getTotalDependencies([])).toBe(0)
  })

  it('returns 0 when no project has dependencies', () => {
    const projects = [makeProject(), makeProject({ name: 'other' })]
    expect(getTotalDependencies(projects)).toBe(0)
  })

  it('deduplicates dependencies across projects', () => {
    const projects = [
      makeProject({ name: 'a', dependencies: ['helm', 'kustomize'] }),
      makeProject({ name: 'b', dependencies: ['helm'] }),
      makeProject({ name: 'c', dependencies: ['kustomize', 'argo'] }),
    ]
    // unique deps: helm, kustomize, argo
    expect(getTotalDependencies(projects)).toBe(3)
  })

  it('counts a single unique dependency', () => {
    const projects = [makeProject({ dependencies: ['helm'] })]
    expect(getTotalDependencies(projects)).toBe(1)
  })
})
