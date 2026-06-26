/**
 * Tests for lib/kubectlProxy.utils.ts — pure utility functions.
 *
 * Covers:
 * - appendUniqueProblem: no-op on undefined/dup, appends new
 * - normalizePodProblems: OOMKilled filter, no-op when absent
 * - getPrimaryPodProblem: priority ordering, fallback
 * - parseResourceQuantity: all SI suffixes, plain numbers, edge cases
 * - parseResourceQuantityMillicores: millicores suffix, plain, edge cases
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
  it('appends a new problem to the list', () => {
    const problems: string[] = []
    appendUniqueProblem(problems, 'OOMKilled')
    expect(problems).toEqual(['OOMKilled'])
  })

  it('does not append duplicate problems', () => {
    const problems = ['OOMKilled']
    appendUniqueProblem(problems, 'OOMKilled')
    expect(problems).toHaveLength(1)
  })

  it('appends multiple distinct problems', () => {
    const problems: string[] = []
    appendUniqueProblem(problems, 'OOMKilled')
    appendUniqueProblem(problems, 'CrashLoopBackOff')
    expect(problems).toEqual(['OOMKilled', 'CrashLoopBackOff'])
  })

  it('is a no-op for undefined problem', () => {
    const problems: string[] = ['existing']
    appendUniqueProblem(problems, undefined)
    expect(problems).toEqual(['existing'])
  })

  it('is a no-op for empty string problem', () => {
    const problems: string[] = []
    appendUniqueProblem(problems, '')
    expect(problems).toHaveLength(0)
  })
})

// ── normalizePodProblems ──────────────────────────────────────────────────────

describe('normalizePodProblems', () => {
  it('returns original list when OOMKilled is absent', () => {
    const problems = ['CrashLoopBackOff', 'ImagePullBackOff']
    expect(normalizePodProblems(problems)).toEqual(problems)
  })

  it('keeps only OOMKilled and CrashLoopBackOff when OOMKilled present', () => {
    const problems = ['OOMKilled', 'CrashLoopBackOff', 'ImagePullBackOff', 'Failed']
    const result = normalizePodProblems(problems)
    expect(result).toContain('OOMKilled')
    expect(result).toContain('CrashLoopBackOff')
    expect(result).not.toContain('ImagePullBackOff')
    expect(result).not.toContain('Failed')
  })

  it('keeps High restarts problem when OOMKilled present', () => {
    const problems = ['OOMKilled', 'High restarts (5)']
    const result = normalizePodProblems(problems)
    expect(result).toContain('OOMKilled')
    expect(result).toContain('High restarts (5)')
  })

  it('returns just OOMKilled when nothing else to keep', () => {
    const problems = ['OOMKilled', 'Unschedulable']
    const result = normalizePodProblems(problems)
    expect(result).toEqual(['OOMKilled'])
  })

  it('handles empty array', () => {
    expect(normalizePodProblems([])).toEqual([])
  })
})

// ── getPrimaryPodProblem ──────────────────────────────────────────────────────

describe('getPrimaryPodProblem', () => {
  it('returns OOMKilled as highest priority', () => {
    const problems = ['Failed', 'OOMKilled', 'CrashLoopBackOff']
    expect(getPrimaryPodProblem(problems, 'Unknown')).toBe('OOMKilled')
  })

  it('returns CrashLoopBackOff over lower-priority items', () => {
    const problems = ['Failed', 'CrashLoopBackOff', 'Unschedulable']
    expect(getPrimaryPodProblem(problems, 'Unknown')).toBe('CrashLoopBackOff')
  })

  it('returns ImagePullBackOff over ErrImagePull', () => {
    const problems = ['ErrImagePull', 'ImagePullBackOff']
    expect(getPrimaryPodProblem(problems, 'Unknown')).toBe('ImagePullBackOff')
  })

  it('returns fallback when no priority problem found', () => {
    const problems = ['SomeUnknownReason']
    expect(getPrimaryPodProblem(problems, 'fallback')).toBe('fallback')
  })

  it('returns fallback for empty problems list', () => {
    expect(getPrimaryPodProblem([], 'default')).toBe('default')
  })

  it('returns Failed as lowest-priority problem', () => {
    const problems = ['Failed']
    expect(getPrimaryPodProblem(problems, 'fallback')).toBe('Failed')
  })

  it('returns Unschedulable over Failed', () => {
    const problems = ['Failed', 'Unschedulable']
    expect(getPrimaryPodProblem(problems, 'fallback')).toBe('Unschedulable')
  })
})

// ── parseResourceQuantity ─────────────────────────────────────────────────────

describe('parseResourceQuantity', () => {
  it('returns 0 for undefined', () => {
    expect(parseResourceQuantity(undefined)).toBe(0)
  })

  it('returns 0 for empty string', () => {
    expect(parseResourceQuantity('')).toBe(0)
  })

  it('parses plain integer', () => {
    expect(parseResourceQuantity('8')).toBe(8)
  })

  it('parses decimal number', () => {
    expect(parseResourceQuantity('1.5')).toBe(1.5)
  })

  it('parses Ki (kibibytes)', () => {
    expect(parseResourceQuantity('1Ki')).toBe(1024)
    expect(parseResourceQuantity('8Ki')).toBe(8 * 1024)
  })

  it('parses Mi (mebibytes)', () => {
    expect(parseResourceQuantity('1Mi')).toBe(1024 * 1024)
  })

  it('parses Gi (gibibytes)', () => {
    expect(parseResourceQuantity('1Gi')).toBe(1024 * 1024 * 1024)
  })

  it('parses Ti (tebibytes)', () => {
    expect(parseResourceQuantity('1Ti')).toBe(1024 ** 4)
  })

  it('parses K (kilobytes)', () => {
    expect(parseResourceQuantity('1K')).toBe(1000)
  })

  it('parses M (megabytes)', () => {
    expect(parseResourceQuantity('1M')).toBe(1_000_000)
  })

  it('parses G (gigabytes)', () => {
    expect(parseResourceQuantity('1G')).toBe(1_000_000_000)
  })

  it('parses T (terabytes)', () => {
    expect(parseResourceQuantity('1T')).toBe(1_000_000_000_000)
  })

  it('parses m suffix (millicores → fractional)', () => {
    expect(parseResourceQuantity('500m')).toBe(0.5)
    expect(parseResourceQuantity('1000m')).toBe(1)
  })

  it('returns 0 for non-numeric string', () => {
    expect(parseResourceQuantity('abc')).toBe(0)
  })

  it('falls through to parseFloat for unrecognised format', () => {
    // e.g. "3.14" with no suffix
    expect(parseResourceQuantity('3.14')).toBeCloseTo(3.14)
  })
})

// ── parseResourceQuantityMillicores ──────────────────────────────────────────

describe('parseResourceQuantityMillicores', () => {
  it('returns 0 for undefined', () => {
    expect(parseResourceQuantityMillicores(undefined)).toBe(0)
  })

  it('returns 0 for empty string', () => {
    expect(parseResourceQuantityMillicores('')).toBe(0)
  })

  it('parses explicit millicores suffix (500m → 500)', () => {
    expect(parseResourceQuantityMillicores('500m')).toBe(500)
  })

  it('parses 1000m → 1000', () => {
    expect(parseResourceQuantityMillicores('1000m')).toBe(1000)
  })

  it('parses plain number (cores) → multiply by 1000', () => {
    expect(parseResourceQuantityMillicores('2')).toBe(2000)
    expect(parseResourceQuantityMillicores('0.5')).toBe(500)
  })

  it('handles whitespace-padded string', () => {
    expect(parseResourceQuantityMillicores('  250m  ')).toBe(250)
  })

  it('returns 0 for non-numeric string', () => {
    expect(parseResourceQuantityMillicores('abc')).toBe(0)
  })
})
