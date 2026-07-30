import { describe, it, expect } from 'vitest'
import {
  appendUniqueProblem,
  normalizePodProblems,
  getPrimaryPodProblem,
  parseResourceQuantity,
  parseResourceQuantityMillicores,
} from './kubectlProxy.utils'

describe('appendUniqueProblem', () => {
  it('appends a new problem', () => {
    const problems: string[] = ['CrashLoopBackOff']
    appendUniqueProblem(problems, 'OOMKilled')
    expect(problems).toEqual(['CrashLoopBackOff', 'OOMKilled'])
  })

  it('does not append duplicates', () => {
    const problems: string[] = ['OOMKilled']
    appendUniqueProblem(problems, 'OOMKilled')
    expect(problems).toEqual(['OOMKilled'])
  })

  it('does not append undefined', () => {
    const problems: string[] = ['CrashLoopBackOff']
    appendUniqueProblem(problems, undefined)
    expect(problems).toEqual(['CrashLoopBackOff'])
  })

  it('does not append empty string', () => {
    const problems: string[] = []
    appendUniqueProblem(problems, '')
    expect(problems).toEqual([])
  })
})

describe('normalizePodProblems', () => {
  it('returns problems unchanged when no OOMKilled', () => {
    const problems = ['CrashLoopBackOff', 'ImagePullBackOff']
    expect(normalizePodProblems(problems)).toEqual(['CrashLoopBackOff', 'ImagePullBackOff'])
  })

  it('filters to only OOMKilled-related problems when OOMKilled present', () => {
    const problems = ['OOMKilled', 'CrashLoopBackOff', 'ImagePullBackOff', 'High restarts (5)']
    expect(normalizePodProblems(problems)).toEqual(['OOMKilled', 'CrashLoopBackOff', 'High restarts (5)'])
  })

  it('keeps only OOMKilled when no CrashLoop or High restarts', () => {
    const problems = ['OOMKilled', 'ImagePullBackOff', 'ErrImagePull']
    expect(normalizePodProblems(problems)).toEqual(['OOMKilled'])
  })

  it('handles empty array', () => {
    expect(normalizePodProblems([])).toEqual([])
  })
})

describe('getPrimaryPodProblem', () => {
  it('returns highest priority problem', () => {
    expect(getPrimaryPodProblem(['CrashLoopBackOff', 'OOMKilled'], 'Unknown')).toBe('OOMKilled')
  })

  it('returns CrashLoopBackOff over ImagePullBackOff', () => {
    expect(getPrimaryPodProblem(['ImagePullBackOff', 'CrashLoopBackOff'], 'Unknown')).toBe('CrashLoopBackOff')
  })

  it('returns fallback when no known problem', () => {
    expect(getPrimaryPodProblem(['CustomError'], 'Unknown')).toBe('Unknown')
  })

  it('returns fallback for empty array', () => {
    expect(getPrimaryPodProblem([], 'Pending')).toBe('Pending')
  })

  it('matches exact problem names', () => {
    expect(getPrimaryPodProblem(['Failed'], 'Unknown')).toBe('Failed')
  })
})

describe('parseResourceQuantity', () => {
  it('returns 0 for undefined', () => {
    expect(parseResourceQuantity(undefined)).toBe(0)
  })

  it('returns 0 for empty string', () => {
    expect(parseResourceQuantity('')).toBe(0)
  })

  it('parses plain numbers', () => {
    expect(parseResourceQuantity('4')).toBe(4)
    expect(parseResourceQuantity('0.5')).toBe(0.5)
  })

  it('parses Ki (kibibytes)', () => {
    expect(parseResourceQuantity('256Ki')).toBe(256 * 1024)
  })

  it('parses Mi (mebibytes)', () => {
    expect(parseResourceQuantity('512Mi')).toBe(512 * 1024 * 1024)
  })

  it('parses Gi (gibibytes)', () => {
    expect(parseResourceQuantity('2Gi')).toBe(2 * 1024 * 1024 * 1024)
  })

  it('parses Ti (tebibytes)', () => {
    expect(parseResourceQuantity('1Ti')).toBe(1024 * 1024 * 1024 * 1024)
  })

  it('parses K (kilobytes)', () => {
    expect(parseResourceQuantity('500K')).toBe(500000)
  })

  it('parses M (megabytes)', () => {
    expect(parseResourceQuantity('100M')).toBe(100000000)
  })

  it('parses G (gigabytes)', () => {
    expect(parseResourceQuantity('1G')).toBe(1000000000)
  })

  it('parses T (terabytes)', () => {
    expect(parseResourceQuantity('1T')).toBe(1000000000000)
  })

  it('parses m (millicores/milliunits)', () => {
    expect(parseResourceQuantity('500m')).toBe(0.5)
    expect(parseResourceQuantity('100m')).toBe(0.1)
    expect(parseResourceQuantity('1000m')).toBe(1)
  })

  it('returns 0 for non-numeric garbage', () => {
    expect(parseResourceQuantity('abc')).toBe(0)
  })

  it('parses numeric-only strings without suffix', () => {
    expect(parseResourceQuantity('1024')).toBe(1024)
  })

  it('handles decimal with suffix', () => {
    expect(parseResourceQuantity('1.5Gi')).toBe(1.5 * 1024 * 1024 * 1024)
  })
})

describe('parseResourceQuantityMillicores', () => {
  it('returns 0 for undefined', () => {
    expect(parseResourceQuantityMillicores(undefined)).toBe(0)
  })

  it('returns 0 for empty string', () => {
    expect(parseResourceQuantityMillicores('')).toBe(0)
  })

  it('parses millicores (m suffix)', () => {
    expect(parseResourceQuantityMillicores('500m')).toBe(500)
    expect(parseResourceQuantityMillicores('100m')).toBe(100)
    expect(parseResourceQuantityMillicores('1000m')).toBe(1000)
  })

  it('converts whole cores to millicores', () => {
    expect(parseResourceQuantityMillicores('1')).toBe(1000)
    expect(parseResourceQuantityMillicores('4')).toBe(4000)
    expect(parseResourceQuantityMillicores('0.5')).toBe(500)
  })

  it('returns 0 for non-numeric input', () => {
    expect(parseResourceQuantityMillicores('abc')).toBe(0)
  })

  it('handles whitespace', () => {
    expect(parseResourceQuantityMillicores(' 250m ')).toBe(250)
    expect(parseResourceQuantityMillicores(' 2 ')).toBe(2000)
  })

  it('handles abcm (non-numeric with m suffix)', () => {
    expect(parseResourceQuantityMillicores('abcm')).toBe(0)
  })
})
