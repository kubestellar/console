/**
 * Tests for lib/llmd/nightlyE2EDemoData.ts
 *
 * Covers:
 * - NIGHTLY_WORKFLOWS: structure, required fields, valid enum values
 * - generateDemoNightlyData: shape, passRate, trend, latestConclusion,
 *   in_progress handling, CKS empty runs
 * - computePassRate (via generated data): only completed runs count
 * - computeTrend (via generated data): up/down/steady from patterns
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  NIGHTLY_WORKFLOWS,
  generateDemoNightlyData,
  type NightlyGuideStatus,
  type NightlyWorkflowConfig,
} from '../nightlyE2EDemoData'

// ── NIGHTLY_WORKFLOWS ──────────────────────────────────────────────────────

describe('NIGHTLY_WORKFLOWS', () => {
  it('has at least one entry per platform', () => {
    const platforms = new Set(NIGHTLY_WORKFLOWS.map(w => w.platform))
    expect(platforms.has('OCP')).toBe(true)
    expect(platforms.has('GKE')).toBe(true)
    expect(platforms.has('CKS')).toBe(true)
  })

  it('every entry has required string fields', () => {
    for (const wf of NIGHTLY_WORKFLOWS as NightlyWorkflowConfig[]) {
      expect(typeof wf.repo).toBe('string')
      expect(wf.repo.length).toBeGreaterThan(0)
      expect(typeof wf.workflowFile).toBe('string')
      expect(wf.workflowFile.length).toBeGreaterThan(0)
      expect(typeof wf.guide).toBe('string')
      expect(typeof wf.acronym).toBe('string')
      expect(typeof wf.model).toBe('string')
      expect(typeof wf.gpuType).toBe('string')
      expect(typeof wf.gpuCount).toBe('number')
      expect(wf.gpuCount).toBeGreaterThan(0)
    }
  })

  it('all platform values are valid', () => {
    const valid = new Set(['OCP', 'GKE', 'CKS'])
    for (const wf of NIGHTLY_WORKFLOWS) {
      expect(valid.has(wf.platform)).toBe(true)
    }
  })

  it('workflowFile names are unique', () => {
    const names = NIGHTLY_WORKFLOWS.map(w => w.workflowFile)
    const unique = new Set(names)
    expect(unique.size).toBe(names.length)
  })
})

// ── generateDemoNightlyData ────────────────────────────────────────────────

describe('generateDemoNightlyData', () => {
  it('returns one entry per NIGHTLY_WORKFLOWS entry', () => {
    const data = generateDemoNightlyData()
    expect(data).toHaveLength(NIGHTLY_WORKFLOWS.length)
  })

  it('each entry has required shape', () => {
    const data = generateDemoNightlyData()
    for (const entry of data as NightlyGuideStatus[]) {
      expect(typeof entry.guide).toBe('string')
      expect(typeof entry.acronym).toBe('string')
      expect(['OCP', 'GKE', 'CKS']).toContain(entry.platform)
      expect(typeof entry.repo).toBe('string')
      expect(typeof entry.workflowFile).toBe('string')
      expect(Array.isArray(entry.runs)).toBe(true)
      expect(typeof entry.passRate).toBe('number')
      expect(['up', 'down', 'steady']).toContain(entry.trend)
    }
  })

  it('passRate is between 0 and 100 inclusive', () => {
    const data = generateDemoNightlyData()
    for (const entry of data) {
      expect(entry.passRate).toBeGreaterThanOrEqual(0)
      expect(entry.passRate).toBeLessThanOrEqual(100)
    }
  })

  it('run ids are unique within each workflow', () => {
    const data = generateDemoNightlyData()
    for (const entry of data) {
      const ids = entry.runs.map(r => r.id)
      const unique = new Set(ids)
      expect(unique.size).toBe(ids.length)
    }
  })

  it('in_progress runs have null conclusion', () => {
    const data = generateDemoNightlyData()
    for (const entry of data) {
      for (const run of entry.runs) {
        if (run.status === 'in_progress') {
          expect(run.conclusion).toBeNull()
        }
      }
    }
  })

  it('completed runs have non-null conclusion', () => {
    const data = generateDemoNightlyData()
    for (const entry of data) {
      for (const run of entry.runs) {
        if (run.status === 'completed') {
          expect(run.conclusion).not.toBeNull()
        }
      }
    }
  })

  it('passRate only counts completed runs (excludes in_progress)', () => {
    const data = generateDemoNightlyData()
    for (const entry of data) {
      const completed = entry.runs.filter(r => r.status === 'completed')
      if (completed.length === 0) {
        expect(entry.passRate).toBe(0)
      } else {
        const succeeded = completed.filter(r => r.conclusion === 'success').length
        const expected = Math.round((succeeded / completed.length) * 100)
        expect(entry.passRate).toBe(expected)
      }
    }
  })

  it('latestConclusion reflects first run conclusion or status', () => {
    const data = generateDemoNightlyData()
    for (const entry of data) {
      if (entry.runs.length > 0) {
        const firstRun = entry.runs[0]
        const expected = firstRun.conclusion ?? firstRun.status
        expect(entry.latestConclusion).toBe(expected)
      } else {
        expect(entry.latestConclusion).toBeNull()
      }
    }
  })

  it('CKS entries with no known pattern have all-success runs', () => {
    const data = generateDemoNightlyData()
    const cksWVA = data.find(d => d.platform === 'CKS' && d.guide === 'WVA')
    // CKS WVA has a DEMO_PATTERN entry
    expect(cksWVA).toBeDefined()
    // Other CKS entries fall back to all-success
    const cksOther = data.filter(d => d.platform === 'CKS' && d.guide !== 'WVA' && d.acronym !== 'PD' && d.acronym !== 'WEP')
    for (const entry of cksOther) {
      for (const run of entry.runs) {
        if (run.status === 'completed') {
          expect(run.conclusion).toBe('success')
        }
      }
    }
  })

  it('run htmlUrl is a valid GitHub Actions URL', () => {
    const data = generateDemoNightlyData()
    for (const entry of data) {
      for (const run of entry.runs) {
        expect(run.htmlUrl).toMatch(/^https:\/\/github\.com\/.+\/actions\/workflows\/.+/)
      }
    }
  })

  it('runs have ascending run numbers in reverse-chronological order', () => {
    const data = generateDemoNightlyData()
    for (const entry of data) {
      if (entry.runs.length < 2) continue
      // runs[0] is most recent, so runNumber should be highest
      expect(entry.runs[0].runNumber).toBeGreaterThan(entry.runs[entry.runs.length - 1].runNumber)
    }
  })

  it('run timestamps are chronologically ordered (newest first)', () => {
    const data = generateDemoNightlyData()
    for (const entry of data) {
      for (let i = 0; i < entry.runs.length - 1; i++) {
        const ts0 = new Date(entry.runs[i].createdAt).getTime()
        const ts1 = new Date(entry.runs[i + 1].createdAt).getTime()
        expect(ts0).toBeGreaterThan(ts1)
      }
    }
  })

  it('trend is steady for entries with fewer than 4 runs', () => {
    const data = generateDemoNightlyData()
    for (const entry of data) {
      if (entry.runs.length < 4) {
        expect(entry.trend).toBe('steady')
      }
    }
  })
})

// ── computeTrend via known DEMO_PATTERNS ──────────────────────────────────

describe('computeTrend via known patterns', () => {
  it('OCP PD Disaggregation (all-success) has steady trend', () => {
    const data = generateDemoNightlyData()
    const entry = data.find(d => d.platform === 'OCP' && d.acronym === 'PD')
    expect(entry).toBeDefined()
    // All-success: recent pass = 1.0, older pass = 1.0 → steady
    expect(entry!.trend).toBe('steady')
  })

  it('trend values cover the valid set across all entries', () => {
    const data = generateDemoNightlyData()
    const trends = new Set(data.map(d => d.trend))
    for (const t of trends) {
      expect(['up', 'down', 'steady']).toContain(t)
    }
  })
})
