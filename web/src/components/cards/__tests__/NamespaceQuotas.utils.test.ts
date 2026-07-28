/**
 * Coverage for NamespaceQuotas.utils.ts.
 *
 * These pure helpers back the NamespaceQuotas card's rendering, sorting,
 * and unit conversion. Every quota bar/label runs through getColor +
 * parseQuantity + formatResourceName + formatLimits, and every list-order
 * decision runs through QUOTA_SORT_COMPARATORS / LIMIT_SORT_COMPARATORS.
 *
 * The wrapping .tsx test focuses on rendering and does not exercise the
 * util contracts (thresholds, K/Ki/Mi/Gi unit conversion, resource-name
 * normalisation), so this file covers the pure logic directly.
 */
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
} from '../NamespaceQuotas.utils'
import type { QuotaUsage, LimitRangeItem } from '../NamespaceQuotas.types'

function makeQuota(overrides: Partial<QuotaUsage> = {}): QuotaUsage {
  return {
    resource: 'cpu',
    rawResource: 'cpu',
    used: '1',
    limit: '2',
    percent: 50,
    ...overrides,
  }
}

function makeLimit(overrides: Partial<LimitRangeItem> = {}): LimitRangeItem {
  return {
    name: 'default',
    type: 'Container',
    limits: { type: 'Container' },
    ...overrides,
  }
}

// ── SORT_OPTIONS ───────────────────────────────────────────────

describe('SORT_OPTIONS', () => {
  it('exposes exactly two entries: Name and Usage', () => {
    expect(SORT_OPTIONS).toEqual([
      { value: 'name', label: 'Name' },
      { value: 'percent', label: 'Usage' },
    ])
  })
})

// ── USAGE_TEXT_CLASSES / USAGE_BAR_CLASSES ─────────────────────

describe('USAGE_TEXT_CLASSES / USAGE_BAR_CLASSES', () => {
  it('maps each color to a Tailwind text-* class', () => {
    expect(USAGE_TEXT_CLASSES).toEqual({
      red: 'text-red-400',
      orange: 'text-orange-400',
      green: 'text-green-400',
    })
  })

  it('maps each color to a Tailwind bg-* class', () => {
    expect(USAGE_BAR_CLASSES).toEqual({
      red: 'bg-red-500',
      orange: 'bg-orange-500',
      green: 'bg-green-500',
    })
  })
})

// ── QUOTA_SORT_COMPARATORS ─────────────────────────────────────

describe('QUOTA_SORT_COMPARATORS', () => {
  const rows: QuotaUsage[] = [
    makeQuota({ resource: 'memory', percent: 40 }),
    makeQuota({ resource: 'cpu', percent: 80 }),
    makeQuota({ resource: 'pods', percent: 10 }),
  ]

  it('sorts by resource name alphabetically', () => {
    const sorted = [...rows].sort(QUOTA_SORT_COMPARATORS.name)
    expect(sorted.map((r) => r.resource)).toEqual(['cpu', 'memory', 'pods'])
  })

  it('sorts by percent numerically ascending', () => {
    const sorted = [...rows].sort(QUOTA_SORT_COMPARATORS.percent)
    expect(sorted.map((r) => r.percent)).toEqual([10, 40, 80])
  })
})

// ── LIMIT_SORT_COMPARATORS ─────────────────────────────────────

describe('LIMIT_SORT_COMPARATORS', () => {
  const items: LimitRangeItem[] = [
    makeLimit({ name: 'zeta' }),
    makeLimit({ name: 'alpha' }),
    makeLimit({ name: 'mid' }),
  ]

  it('sorts by name for the name option', () => {
    const sorted = [...items].sort(LIMIT_SORT_COMPARATORS.name)
    expect(sorted.map((i) => i.name)).toEqual(['alpha', 'mid', 'zeta'])
  })

  it('also sorts by name for the percent option (limits have no percent field)', () => {
    // Documented in source: both comparators use name for LimitRange items.
    const sorted = [...items].sort(LIMIT_SORT_COMPARATORS.percent)
    expect(sorted.map((i) => i.name)).toEqual(['alpha', 'mid', 'zeta'])
  })
})

// ── getColor ───────────────────────────────────────────────────

describe('getColor', () => {
  it('returns green below the warning threshold', () => {
    expect(getColor(0)).toBe('green')
    expect(getColor(50)).toBe('green')
    expect(getColor(69.99)).toBe('green')
  })

  it('returns orange between 70 (inclusive) and 90 (exclusive)', () => {
    expect(getColor(70)).toBe('orange')
    expect(getColor(85)).toBe('orange')
    expect(getColor(89.99)).toBe('orange')
  })

  it('returns red at 90 and above', () => {
    expect(getColor(90)).toBe('red')
    expect(getColor(100)).toBe('red')
    expect(getColor(1000)).toBe('red')
  })
})

// ── getIcon ────────────────────────────────────────────────────

describe('getIcon', () => {
  it('returns Cpu for cpu resources (case-insensitive)', () => {
    expect(getIcon('cpu')).toBe(Cpu)
    expect(getIcon('CPU')).toBe(Cpu)
    expect(getIcon('requests.cpu')).toBe(Cpu)
  })

  it('returns HardDrive for memory resources', () => {
    expect(getIcon('memory')).toBe(HardDrive)
    expect(getIcon('Memory')).toBe(HardDrive)
    expect(getIcon('limits.memory')).toBe(HardDrive)
  })

  it('returns Box for pod-count resources', () => {
    expect(getIcon('pods')).toBe(Box)
    expect(getIcon('count/pods')).toBe(Box)
  })

  it('returns Zap for gpu resources', () => {
    expect(getIcon('nvidia.com/gpu')).toBe(Zap)
    expect(getIcon('amd.com/gpu')).toBe(Zap)
  })

  it('returns Gauge as the fallback for unknown resources', () => {
    expect(getIcon('storage')).toBe(Gauge)
    expect(getIcon('services.loadbalancers')).toBe(Gauge)
    expect(getIcon('')).toBe(Gauge)
  })

  it('prioritises cpu match over later branches when combined', () => {
    // Ordering matters: cpu is checked first, so a memory+cpu string still
    // resolves to Cpu.
    expect(getIcon('cpu-and-memory')).toBe(Cpu)
  })
})

// ── parseQuantity ──────────────────────────────────────────────

describe('parseQuantity', () => {
  it('returns 0 for empty strings', () => {
    expect(parseQuantity('')).toBe(0)
  })

  it('parses a bare number', () => {
    expect(parseQuantity('42')).toBe(42)
    expect(parseQuantity('3.14')).toBe(3.14)
  })

  it('converts binary IEC suffixes (Gi / Mi / Ki)', () => {
    expect(parseQuantity('1Gi')).toBe(1024 * 1024 * 1024)
    expect(parseQuantity('2Mi')).toBe(2 * 1024 * 1024)
    expect(parseQuantity('4Ki')).toBe(4 * 1024)
  })

  it('converts decimal SI suffixes (G / M / K)', () => {
    expect(parseQuantity('1G')).toBe(1_000_000_000)
    expect(parseQuantity('2M')).toBe(2_000_000)
    expect(parseQuantity('4K')).toBe(4_000)
  })

  it('treats a trailing lowercase "m" as milli (divide by 1000)', () => {
    // Kubernetes cpu quantity: "500m" = 0.5 cores
    expect(parseQuantity('500m')).toBe(0.5)
    expect(parseQuantity('2000m')).toBe(2)
  })

  it('checks binary suffix before decimal (Gi wins over G)', () => {
    // parseFloat('1Gi') gives 1, and 'Gi' branch runs first.
    expect(parseQuantity('1Gi')).not.toBe(1_000_000_000)
    expect(parseQuantity('1Gi')).toBe(1024 * 1024 * 1024)
  })

  it('handles fractional binary quantities', () => {
    expect(parseQuantity('0.5Gi')).toBe(0.5 * 1024 * 1024 * 1024)
  })

  it('returns NaN for non-numeric strings', () => {
    // parseFloat('notanumber') → NaN; no suffix matches → NaN passthrough.
    expect(Number.isNaN(parseQuantity('notanumber'))).toBe(true)
  })
})

// ── formatResourceName ─────────────────────────────────────────

describe('formatResourceName', () => {
  it('strips "requests." and "limits." prefixes', () => {
    expect(formatResourceName('requests.cpu')).toBe('CPU')
    expect(formatResourceName('limits.memory')).toBe('Memory')
  })

  it('maps nvidia.com/gpu to "GPU (NVIDIA)"', () => {
    expect(formatResourceName('nvidia.com/gpu')).toBe('GPU (NVIDIA)')
    expect(formatResourceName('requests.nvidia.com/gpu')).toBe('GPU (NVIDIA)')
  })

  it('maps amd.com/gpu to "GPU (AMD)"', () => {
    expect(formatResourceName('amd.com/gpu')).toBe('GPU (AMD)')
    expect(formatResourceName('limits.amd.com/gpu')).toBe('GPU (AMD)')
  })

  it('normalises cpu / memory to canonical labels', () => {
    expect(formatResourceName('cpu')).toBe('CPU')
    expect(formatResourceName('memory')).toBe('Memory')
  })

  it('maps storage variants to their canonical label', () => {
    // Note: ephemeral-storage contains 'storage', which is checked first,
    // so it currently maps to 'Storage'. This documents the current
    // (implementation-defined) behaviour.
    expect(formatResourceName('storage')).toBe('Storage')
    expect(formatResourceName('ephemeral-storage')).toBe('Storage')
  })

  it('title-cases the first letter for unknown resources', () => {
    expect(formatResourceName('services.loadbalancers')).toBe('Services.loadbalancers')
    expect(formatResourceName('configmaps')).toBe('Configmaps')
    expect(formatResourceName('secrets')).toBe('Secrets')
  })

  it('preserves the rest of the string as-is (no lowercasing)', () => {
    expect(formatResourceName('MyResource')).toBe('MyResource')
  })

  it('returns the empty string unchanged (no crash on empty)', () => {
    // charAt(0) on '' returns '', slice(1) on '' returns '' → ''
    expect(formatResourceName('')).toBe('')
  })
})

// ── formatLimits ───────────────────────────────────────────────

describe('formatLimits', () => {
  it('renders a comma-separated "Resource: value" list', () => {
    const out = formatLimits({ cpu: '500m', memory: '1Gi' })
    expect(out).toBe('CPU: 500m, Memory: 1Gi')
  })

  it('applies formatResourceName to each key', () => {
    const out = formatLimits({ 'requests.cpu': '100m', 'nvidia.com/gpu': '2' })
    expect(out).toBe('CPU: 100m, GPU (NVIDIA): 2')
  })

  it('returns an empty string for an empty object', () => {
    expect(formatLimits({})).toBe('')
  })

  it('produces a single entry without a separator for one key', () => {
    expect(formatLimits({ cpu: '2' })).toBe('CPU: 2')
  })
})
