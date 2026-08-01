import { describe, it, expect } from 'vitest'
import { Gauge, Cpu, HardDrive, Box, Zap } from 'lucide-react'
import {
  SORT_OPTIONS,
  QUOTA_SORT_COMPARATORS,
  LIMIT_SORT_COMPARATORS,
  USAGE_TEXT_CLASSES,
  USAGE_BAR_CLASSES,
  getColor,
  getIcon,
  parseQuantity,
  formatResourceName,
  formatLimits,
} from './NamespaceQuotas.utils'
import type { QuotaUsage, LimitRangeItem } from './NamespaceQuotas.types'

describe('SORT_OPTIONS', () => {
  it('exposes name and percent options', () => {
    expect(SORT_OPTIONS).toEqual([
      { value: 'name', label: 'Name' },
      { value: 'percent', label: 'Usage' },
    ])
  })
})

describe('getColor', () => {
  it('returns red at or above 90%', () => {
    expect(getColor(90)).toBe('red')
    expect(getColor(100)).toBe('red')
    expect(getColor(150)).toBe('red')
  })

  it('returns orange between 70% and 90%', () => {
    expect(getColor(70)).toBe('orange')
    expect(getColor(80)).toBe('orange')
    expect(getColor(89.99)).toBe('orange')
  })

  it('returns green below 70%', () => {
    expect(getColor(0)).toBe('green')
    expect(getColor(50)).toBe('green')
    expect(getColor(69.99)).toBe('green')
  })
})

describe('getIcon', () => {
  it('maps CPU resources to the Cpu icon', () => {
    expect(getIcon('cpu')).toBe(Cpu)
    expect(getIcon('requests.cpu')).toBe(Cpu)
    expect(getIcon('CPU')).toBe(Cpu)
  })

  it('maps memory resources to HardDrive', () => {
    expect(getIcon('memory')).toBe(HardDrive)
    expect(getIcon('limits.memory')).toBe(HardDrive)
  })

  it('maps pod resources to Box', () => {
    expect(getIcon('pods')).toBe(Box)
  })

  it('maps GPU resources to Zap', () => {
    expect(getIcon('nvidia.com/gpu')).toBe(Zap)
    expect(getIcon('GPU')).toBe(Zap)
  })

  it('defaults to Gauge for unknown resources', () => {
    expect(getIcon('services')).toBe(Gauge)
    expect(getIcon('')).toBe(Gauge)
  })
})

describe('parseQuantity', () => {
  it('returns 0 for empty input', () => {
    expect(parseQuantity('')).toBe(0)
  })

  it('parses binary suffixes (Gi/Mi/Ki)', () => {
    expect(parseQuantity('1Gi')).toBe(1024 * 1024 * 1024)
    expect(parseQuantity('2Mi')).toBe(2 * 1024 * 1024)
    expect(parseQuantity('4Ki')).toBe(4 * 1024)
  })

  it('parses decimal suffixes (G/M/K)', () => {
    expect(parseQuantity('1G')).toBe(1_000_000_000)
    expect(parseQuantity('3M')).toBe(3_000_000)
    expect(parseQuantity('5K')).toBe(5_000)
  })

  it('parses milli suffix (m) as divide-by-1000', () => {
    expect(parseQuantity('500m')).toBe(0.5)
    expect(parseQuantity('2000m')).toBe(2)
  })

  it('parses raw numbers with no suffix', () => {
    expect(parseQuantity('42')).toBe(42)
    expect(parseQuantity('3.14')).toBeCloseTo(3.14)
  })
})

describe('formatResourceName', () => {
  it('strips requests. and limits. prefixes', () => {
    expect(formatResourceName('requests.cpu')).toBe('CPU')
    expect(formatResourceName('limits.memory')).toBe('Memory')
  })

  it('maps well-known Kubernetes resource names', () => {
    expect(formatResourceName('cpu')).toBe('CPU')
    expect(formatResourceName('memory')).toBe('Memory')
    expect(formatResourceName('storage')).toBe('Storage')
    expect(formatResourceName('nvidia.com/gpu')).toBe('GPU (NVIDIA)')
    expect(formatResourceName('amd.com/gpu')).toBe('GPU (AMD)')
  })

  it('capitalizes the first character of unknown resources', () => {
    expect(formatResourceName('services')).toBe('Services')
    expect(formatResourceName('configmaps')).toBe('Configmaps')
  })

  it('handles empty strings without throwing', () => {
    expect(formatResourceName('')).toBe('')
  })
})

describe('formatLimits', () => {
  it('joins entries with formatted resource names', () => {
    const result = formatLimits({ 'requests.cpu': '100m', 'limits.memory': '256Mi' })
    expect(result).toBe('CPU: 100m, Memory: 256Mi')
  })

  it('returns an empty string for an empty map', () => {
    expect(formatLimits({})).toBe('')
  })
})

describe('QUOTA_SORT_COMPARATORS', () => {
  const a: QuotaUsage = { resource: 'apple', rawResource: 'apple', used: '', limit: '', percent: 20 }
  const b: QuotaUsage = { resource: 'banana', rawResource: 'banana', used: '', limit: '', percent: 80 }

  it('sorts by resource name for the name comparator', () => {
    expect(QUOTA_SORT_COMPARATORS.name(a, b)).toBeLessThan(0)
    expect(QUOTA_SORT_COMPARATORS.name(b, a)).toBeGreaterThan(0)
    expect(QUOTA_SORT_COMPARATORS.name(a, a)).toBe(0)
  })

  it('sorts by percent for the percent comparator', () => {
    expect(QUOTA_SORT_COMPARATORS.percent(a, b)).not.toBe(0)
    expect(Math.sign(QUOTA_SORT_COMPARATORS.percent(a, b))).toBe(
      -Math.sign(QUOTA_SORT_COMPARATORS.percent(b, a)),
    )
  })
})

describe('LIMIT_SORT_COMPARATORS', () => {
  const a: LimitRangeItem = { name: 'alpha', type: 'Container', limits: { type: 'Container' } }
  const b: LimitRangeItem = { name: 'beta', type: 'Container', limits: { type: 'Container' } }

  it('sorts by name for both comparators', () => {
    expect(LIMIT_SORT_COMPARATORS.name(a, b)).toBeLessThan(0)
    expect(LIMIT_SORT_COMPARATORS.percent(a, b)).toBeLessThan(0)
  })
})

describe('USAGE_TEXT_CLASSES / USAGE_BAR_CLASSES', () => {
  it('exposes matching keys for the three status colors', () => {
    expect(Object.keys(USAGE_TEXT_CLASSES).sort()).toEqual(['green', 'orange', 'red'])
    expect(Object.keys(USAGE_BAR_CLASSES).sort()).toEqual(['green', 'orange', 'red'])
  })
})
