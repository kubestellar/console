import { describe, it, expect } from 'vitest'
import {
  generateMigrationReport,
  generateBatches,
  formatReportAsMarkdown,
  formatReportAsJSON,
  getQuickStats,
} from '../report'

describe('generateMigrationReport', () => {
  it('returns a report with required fields', () => {
    const report = generateMigrationReport()
    expect(report.totalCards).toBeGreaterThan(0)
    expect(report.migrationCandidates).toBeGreaterThan(0)
    expect(report.nonCandidates).toBeGreaterThan(0)
    expect(report.totalEstimatedEffort).toBeGreaterThan(0)
    expect(report.batches.length).toBeGreaterThan(0)
    expect(report.cards.length).toBe(report.totalCards)
    expect(report.generatedAt).toBeInstanceOf(Date)
  })

  it('has byComplexity counts', () => {
    const report = generateMigrationReport()
    expect(typeof report.byComplexity.simple).toBe('number')
    expect(typeof report.byComplexity.moderate).toBe('number')
    expect(typeof report.byComplexity.complex).toBe('number')
    expect(typeof report.byComplexity.custom).toBe('number')
  })
})

describe('generateBatches', () => {
  it('returns empty array for empty candidates', () => {
    expect(generateBatches([])).toHaveLength(0)
  })

  it('groups simple list cards into batch 1', () => {
    const candidates = [
      { cardType: 'test', complexity: 'simple' as const, visualizationType: 'list' as const, estimatedEffort: 0.5 },
    ] as Parameters<typeof generateBatches>[0]
    const batches = generateBatches(candidates)
    expect(batches[0].id).toBe('batch-1-simple-lists')
    expect(batches[0].priority).toBe(1)
  })
})

describe('formatReportAsMarkdown', () => {
  it('generates markdown with headers', () => {
    const report = generateMigrationReport()
    const md = formatReportAsMarkdown(report)
    expect(md).toContain('# Card Migration Report')
    expect(md).toContain('## Summary')
    expect(md).toContain('Total Cards')
    expect(md).toContain('## Cards by Complexity')
    expect(md).toContain('## Recommended Migration Batches')
  })
})

describe('formatReportAsJSON', () => {
  it('generates valid JSON', () => {
    const report = generateMigrationReport()
    const json = formatReportAsJSON(report)
    const parsed = JSON.parse(json)
    expect(parsed.totalCards).toBe(report.totalCards)
  })
})

describe('getQuickStats', () => {
  it('returns quick stats', () => {
    const stats = getQuickStats()
    expect(stats.totalCards).toBeGreaterThan(0)
    expect(stats.migrationCandidates).toBeGreaterThan(0)
    expect(typeof stats.simpleCards).toBe('number')
    expect(stats.estimatedHours).toBeGreaterThan(0)
  })
})
