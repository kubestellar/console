import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DRASI_PIPELINES_DEMO_DATA,
  generateDrasiPipelines,
  type DrasiPipelineData,
  type DrasiPipelineStatus,
} from '../drasi'

const EXPECTED_PIPELINE_NAMES = [
  'stock-ticker',
  'fraud-detection',
  'retail-analytics',
  'iot-telemetry',
  'supply-chain',
] as const

const VALID_STATUSES: DrasiPipelineStatus[] = ['running', 'stopped', 'error']

describe('generateDrasiPipelines', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-01T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('returns exactly 5 pipeline entries', () => {
    expect(generateDrasiPipelines()).toHaveLength(5)
  })

  it('returns the expected pipeline names in a stable order', () => {
    const names = generateDrasiPipelines().map(p => p.pipelineName)
    expect(names).toEqual([...EXPECTED_PIPELINE_NAMES])
  })

  it('every entry has the full DrasiPipelineData shape', () => {
    for (const p of generateDrasiPipelines()) {
      expect(p).toEqual(
        expect.objectContaining({
          pipelineName: expect.any(String),
          status: expect.any(String),
          continuousQueriesCount: expect.any(Number),
          reactionsCount: expect.any(Number),
          lastEventAt: expect.any(String),
        }),
      )
    }
  })

  it('every status is one of the DrasiPipelineStatus union values', () => {
    for (const p of generateDrasiPipelines()) {
      expect(VALID_STATUSES).toContain(p.status)
    }
  })

  it('assigns the documented status per pipeline', () => {
    const byName: Record<string, DrasiPipelineData> = Object.fromEntries(
      generateDrasiPipelines().map(p => [p.pipelineName, p]),
    )
    expect(byName['stock-ticker'].status).toBe('running')
    expect(byName['fraud-detection'].status).toBe('running')
    expect(byName['retail-analytics'].status).toBe('running')
    expect(byName['iot-telemetry'].status).toBe('stopped')
    expect(byName['supply-chain'].status).toBe('error')
  })

  it('counts are positive integers', () => {
    for (const p of generateDrasiPipelines()) {
      expect(Number.isInteger(p.continuousQueriesCount)).toBe(true)
      expect(Number.isInteger(p.reactionsCount)).toBe(true)
      expect(p.continuousQueriesCount).toBeGreaterThan(0)
      expect(p.reactionsCount).toBeGreaterThan(0)
    }
  })

  it('lastEventAt is a valid ISO-8601 timestamp at or before now', () => {
    const now = Date.now()
    for (const p of generateDrasiPipelines()) {
      const t = new Date(p.lastEventAt).getTime()
      expect(Number.isNaN(t)).toBe(false)
      expect(t).toBeLessThanOrEqual(now)
      expect(new Date(t).toISOString()).toBe(p.lastEventAt)
    }
  })

  it('respects documented per-pipeline recency windows (worst-case rand=1)', () => {
    const rndSpy = vi.spyOn(Math, 'random').mockReturnValue(0.999999)
    try {
      const now = Date.now()
      const byName: Record<string, DrasiPipelineData> = Object.fromEntries(
        generateDrasiPipelines().map(p => [p.pipelineName, p]),
      )
      const ageMs = (name: string) => now - new Date(byName[name].lastEventAt).getTime()

      expect(ageMs('stock-ticker')).toBeLessThanOrEqual(60_000)
      expect(ageMs('fraud-detection')).toBeLessThanOrEqual(120_000)
      expect(ageMs('retail-analytics')).toBeLessThanOrEqual(300_000)
      expect(ageMs('iot-telemetry')).toBeLessThanOrEqual(3_600_000)
      expect(ageMs('supply-chain')).toBeLessThanOrEqual(600_000)
    } finally {
      rndSpy.mockRestore()
    }
  })

  it('with rand=0 every lastEventAt equals now', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const now = new Date().toISOString()
    for (const p of generateDrasiPipelines()) {
      expect(p.lastEventAt).toBe(now)
    }
  })

  it('produces fresh timestamps on each call as time advances', () => {
    const first = generateDrasiPipelines()[0].lastEventAt
    vi.setSystemTime(new Date('2026-06-01T12:00:05.000Z'))
    const later = generateDrasiPipelines()[0].lastEventAt
    expect(later).not.toBe(first)
  })
})

describe('DRASI_PIPELINES_DEMO_DATA', () => {
  it('is a snapshot with the expected number of pipelines', () => {
    expect(DRASI_PIPELINES_DEMO_DATA).toHaveLength(5)
  })

  it('snapshot pipeline names match the expected set', () => {
    expect(DRASI_PIPELINES_DEMO_DATA.map(p => p.pipelineName)).toEqual([
      ...EXPECTED_PIPELINE_NAMES,
    ])
  })
})
