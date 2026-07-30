/**
 * Unit tests for lib/kubectlProxy.utils.ts
 *
 * Covers all five exported pure functions:
 *   appendUniqueProblem, normalizePodProblems, getPrimaryPodProblem,
 *   parseResourceQuantity, parseResourceQuantityMillicores
 */
import { describe, it, expect } from 'vitest'
import {
  appendUniqueProblem,
  normalizePodProblems,
  getPrimaryPodProblem,
  parseResourceQuantity,
  parseResourceQuantityMillicores,
} from '../kubectlProxy.utils'

// ── appendUniqueProblem ───────────────────────────────────────────────────────

describe('appendUniqueProblem', () => {
  it('appends a new problem', () => {
    const problems: string[] = []
    appendUniqueProblem(problems, 'OOMKilled')
    expect(problems).toEqual(['OOMKilled'])
  })

  it('does not append duplicate problem', () => {
    const problems = ['OOMKilled']
    appendUniqueProblem(problems, 'OOMKilled')
    expect(problems).toEqual(['OOMKilled'])
  })

  it('does not append undefined', () => {
    const problems: string[] = ['OOMKilled']
    appendUniqueProblem(problems, undefined)
    expect(problems).toEqual(['OOMKilled'])
  })

  it('does not append empty string', () => {
    const problems: string[] = []
    appendUniqueProblem(problems, '')
    expect(problems).toEqual([])
  })

  it('appends multiple distinct problems', () => {
    const problems: string[] = []
    appendUniqueProblem(problems, 'OOMKilled')
    appendUniqueProblem(problems, 'CrashLoopBackOff')
    appendUniqueProblem(problems, 'OOMKilled') // duplicate — skipped
    expect(problems).toEqual(['OOMKilled', 'CrashLoopBackOff'])
  })

  it('mutates the array in place', () => {
    const problems: string[] = ['Unschedulable']
    const ref = problems
    appendUniqueProblem(problems, 'Failed')
    expect(ref).toBe(problems)
    expect(ref).toEqual(['Unschedulable', 'Failed'])
  })
})

// ── normalizePodProblems ──────────────────────────────────────────────────────

describe('normalizePodProblems', () => {
  it('returns original array when OOMKilled is absent', () => {
    const problems = ['CrashLoopBackOff', 'Unschedulable']
    const result = normalizePodProblems(problems)
    expect(result).toBe(problems) // same reference
    expect(result).toEqual(['CrashLoopBackOff', 'Unschedulable'])
  })

  it('returns empty array unchanged when OOMKilled is absent', () => {
    const problems: string[] = []
    const result = normalizePodProblems(problems)
    expect(result).toEqual([])
  })

  it('keeps only OOMKilled and CrashLoopBackOff when OOMKilled present', () => {
    const problems = ['OOMKilled', 'CrashLoopBackOff', 'Unschedulable', 'Failed']
    expect(normalizePodProblems(problems)).toEqual(['OOMKilled', 'CrashLoopBackOff'])
  })

  it('keeps OOMKilled alone when no co-present allowed problems', () => {
    const problems = ['OOMKilled', 'Unschedulable']
    expect(normalizePodProblems(problems)).toEqual(['OOMKilled'])
  })

  it('keeps High restarts entries alongside OOMKilled', () => {
    const problems = ['OOMKilled', 'High restarts (10)', 'Unschedulable']
    expect(normalizePodProblems(problems)).toEqual(['OOMKilled', 'High restarts (10)'])
  })

  it('keeps multiple High restarts entries', () => {
    const problems = ['High restarts (5)', 'OOMKilled', 'High restarts (3)', 'Failed']
    expect(normalizePodProblems(problems)).toEqual(['High restarts (5)', 'OOMKilled', 'High restarts (3)'])
  })

  it('keeps all three allowed types when all present', () => {
    const problems = ['OOMKilled', 'CrashLoopBackOff', 'High restarts (7)', 'ImagePullBackOff']
    expect(normalizePodProblems(problems)).toEqual(['OOMKilled', 'CrashLoopBackOff', 'High restarts (7)'])
  })
})

// ── getPrimaryPodProblem ──────────────────────────────────────────────────────

describe('getPrimaryPodProblem', () => {
  it('returns OOMKilled (highest priority) when present', () => {
    expect(getPrimaryPodProblem(['OOMKilled', 'CrashLoopBackOff', 'Failed'], 'Unknown')).toBe('OOMKilled')
  })

  it('returns CrashLoopBackOff when OOMKilled absent', () => {
    expect(getPrimaryPodProblem(['CrashLoopBackOff', 'Unschedulable'], 'Unknown')).toBe('CrashLoopBackOff')
  })

  it('returns ImagePullBackOff when higher-priority entries absent', () => {
    expect(getPrimaryPodProblem(['ImagePullBackOff', 'Failed'], 'Unknown')).toBe('ImagePullBackOff')
  })

  it('returns ErrImagePull at its priority position', () => {
    expect(getPrimaryPodProblem(['ErrImagePull', 'Failed'], 'Unknown')).toBe('ErrImagePull')
  })

  it('returns Failed (lowest priority) when only that present', () => {
    expect(getPrimaryPodProblem(['Failed'], 'Unknown')).toBe('Failed')
  })

  it('returns fallback when no priority reason present', () => {
    expect(getPrimaryPodProblem(['SomeOtherReason'], 'NodeNotReady')).toBe('NodeNotReady')
  })

  it('returns fallback for empty list', () => {
    expect(getPrimaryPodProblem([], 'default')).toBe('default')
  })

  it('respects priority order: OOMKilled beats CrashLoopBackOff', () => {
    expect(getPrimaryPodProblem(['CrashLoopBackOff', 'OOMKilled'], 'Unknown')).toBe('OOMKilled')
  })

  it('Unschedulable beats Failed', () => {
    expect(getPrimaryPodProblem(['Failed', 'Unschedulable'], 'Unknown')).toBe('Unschedulable')
  })

  it('CreateContainerConfigError beats RunContainerError', () => {
    expect(getPrimaryPodProblem(['RunContainerError', 'CreateContainerConfigError'], 'x')).toBe('CreateContainerConfigError')
  })
})

// ── parseResourceQuantity ─────────────────────────────────────────────────────

describe('parseResourceQuantity (utils)', () => {
  it('returns 0 for undefined', () => {
    expect(parseResourceQuantity(undefined)).toBe(0)
  })

  it('returns 0 for empty string', () => {
    expect(parseResourceQuantity('')).toBe(0)
  })

  it('returns 0 for non-numeric string', () => {
    expect(parseResourceQuantity('abc')).toBe(0)
  })

  it('converts Ki suffix', () => {
    expect(parseResourceQuantity('1Ki')).toBe(1024)
  })

  it('converts Mi suffix', () => {
    expect(parseResourceQuantity('1Mi')).toBe(1024 * 1024)
  })

  it('converts Gi suffix', () => {
    expect(parseResourceQuantity('2Gi')).toBe(2 * 1024 * 1024 * 1024)
  })

  it('converts m suffix (millicores)', () => {
    expect(parseResourceQuantity('500m')).toBeCloseTo(0.5)
  })

  it('returns plain number without suffix', () => {
    expect(parseResourceQuantity('42')).toBe(42)
  })
})

// ── parseResourceQuantityMillicores ──────────────────────────────────────────

describe('parseResourceQuantityMillicores (utils)', () => {
  it('returns 0 for undefined', () => {
    expect(parseResourceQuantityMillicores(undefined)).toBe(0)
  })

  it('returns 0 for empty string', () => {
    expect(parseResourceQuantityMillicores('')).toBe(0)
  })

  it('parses m-suffix as millicores', () => {
    expect(parseResourceQuantityMillicores('250m')).toBe(250)
  })

  it('multiplies plain numeric string by 1000', () => {
    expect(parseResourceQuantityMillicores('2')).toBe(2000)
  })

  it('trims whitespace before parsing', () => {
    expect(parseResourceQuantityMillicores('  500m  ')).toBe(500)
  })
})
