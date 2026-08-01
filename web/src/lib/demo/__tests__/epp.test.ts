import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EPP_DEMO_DATA, generateEPPStatus } from '../epp'

describe('generateEPPStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-01T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('returns an object with the full EPPStatusData shape', () => {
    const s = generateEPPStatus()
    expect(s).toEqual(
      expect.objectContaining({
        instanceCount: expect.any(Number),
        queueDepth: expect.any(Number),
        latencyP50Ms: expect.any(Number),
        latencyP99Ms: expect.any(Number),
        errorRate: expect.any(Number),
        lastCheckTime: expect.any(String),
      }),
    )
  })

  it('always reports the fixed demo instance count of 3', () => {
    for (let i = 0; i < 25; i++) {
      expect(generateEPPStatus().instanceCount).toBe(3)
    }
  })

  it('produces integer queue depth and latency values', () => {
    const s = generateEPPStatus()
    expect(Number.isInteger(s.queueDepth)).toBe(true)
    expect(Number.isInteger(s.latencyP50Ms)).toBe(true)
    expect(Number.isInteger(s.latencyP99Ms)).toBe(true)
  })

  it('never yields a negative queue depth (Math.max(0, ...) floor)', () => {
    // Force worst-case wave + jitter
    const sinSpy = vi.spyOn(Math, 'sin').mockReturnValue(-1)
    const rndSpy = vi.spyOn(Math, 'random').mockReturnValue(0)
    try {
      const s = generateEPPStatus()
      expect(s.queueDepth).toBeGreaterThanOrEqual(0)
      expect(s.errorRate).toBeGreaterThanOrEqual(0)
    } finally {
      sinSpy.mockRestore()
      rndSpy.mockRestore()
    }
  })

  it('keeps queue depth within the expected bounded range', () => {
    // base 12 + wave*5 + rand*3 → [12-5, 12+5+3] rounded = [7, 20]
    for (let i = 0; i < 50; i++) {
      const q = generateEPPStatus().queueDepth
      expect(q).toBeGreaterThanOrEqual(0)
      expect(q).toBeLessThanOrEqual(20)
    }
  })

  it('keeps p50 latency within the expected bounded range', () => {
    // base 85 + wave*12 + rand*8 → [73, 105]
    for (let i = 0; i < 50; i++) {
      const v = generateEPPStatus().latencyP50Ms
      expect(v).toBeGreaterThanOrEqual(73)
      expect(v).toBeLessThanOrEqual(105)
    }
  })

  it('keeps p99 latency within the expected bounded range', () => {
    // base 420 + wave*50 + rand*30 → [370, 500]
    for (let i = 0; i < 50; i++) {
      const v = generateEPPStatus().latencyP99Ms
      expect(v).toBeGreaterThanOrEqual(370)
      expect(v).toBeLessThanOrEqual(500)
    }
  })

  it('keeps error rate within the expected bounded range', () => {
    // base 0.023 + wave*0.01 + rand*0.005 → [0.013, 0.038]; clamped >= 0
    for (let i = 0; i < 50; i++) {
      const v = generateEPPStatus().errorRate
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(0.038 + 1e-9)
    }
  })

  it('lastCheckTime is a valid ISO-8601 timestamp reflecting the current time', () => {
    const s = generateEPPStatus()
    expect(s.lastCheckTime).toBe('2026-06-01T12:00:00.000Z')
    expect(new Date(s.lastCheckTime).toISOString()).toBe(s.lastCheckTime)
  })

  it('varies output as time advances (wave uses Date.now())', () => {
    const first = generateEPPStatus()
    vi.setSystemTime(new Date('2026-06-01T12:00:02.000Z'))
    const later = generateEPPStatus()
    expect(later.lastCheckTime).not.toBe(first.lastCheckTime)
  })
})

describe('EPP_DEMO_DATA', () => {
  it('is a valid EPPStatusData snapshot captured at module load', () => {
    expect(EPP_DEMO_DATA).toEqual(
      expect.objectContaining({
        instanceCount: 3,
        queueDepth: expect.any(Number),
        latencyP50Ms: expect.any(Number),
        latencyP99Ms: expect.any(Number),
        errorRate: expect.any(Number),
        lastCheckTime: expect.any(String),
      }),
    )
    expect(new Date(EPP_DEMO_DATA.lastCheckTime).toString()).not.toBe('Invalid Date')
  })
})
