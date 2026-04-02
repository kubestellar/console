import { describe, it, expect } from 'vitest'
import {
  generateMigrationReport,
  generateBatches,
  formatReportAsMarkdown,
  formatReportAsJSON,
  getQuickStats,
} from '../report'
import type { CardAnalysis, MigrationReport } from '../types'

// ---------------------------------------------------------------------------
// Helper to build a minimal CardAnalysis for testing generateBatches
// ---------------------------------------------------------------------------
function makeAnalysis(
  overrides: Partial<CardAnalysis>
): CardAnalysis {
  return {
    cardType: 'test-card',
    componentFile: 'TestCard.tsx',
    configFile: null,
    complexity: 'simple',
    visualizationType: 'list',
    patterns: {
      usesCardData: false,
      usesCardListItem: false,
      usesPagination: false,
      usesSearch: false,
      usesControlsRow: false,
      usesAIActions: false,
      usesLoadingState: false,
      usesDrillDown: false,
      hasClusterFilter: false,
      hasNamespaceFilter: false,
    },
    dataSource: null,
    linesOfCode: 100,
    isMigrationCandidate: true,
    estimatedEffort: 1,
    manualHandlingNeeded: [],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// generateMigrationReport
// ---------------------------------------------------------------------------
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

  it('has byComplexity counts that sum to totalCards', () => {
    const report = generateMigrationReport()
    const complexitySum =
      report.byComplexity.simple +
      report.byComplexity.moderate +
      report.byComplexity.complex +
      report.byComplexity.custom
    expect(complexitySum).toBe(report.totalCards)
  })

  it('has byVisualization counts that sum to totalCards', () => {
    const report = generateMigrationReport()
    const vizSum = Object.values(report.byVisualization).reduce((a, b) => a + b, 0)
    expect(vizSum).toBe(report.totalCards)
  })

  it('migrationCandidates + nonCandidates equals totalCards', () => {
    const report = generateMigrationReport()
    expect(report.migrationCandidates + report.nonCandidates).toBe(report.totalCards)
  })
})

// ---------------------------------------------------------------------------
// generateBatches
// ---------------------------------------------------------------------------
describe('generateBatches', () => {
  it('returns empty array for empty candidates', () => {
    expect(generateBatches([])).toHaveLength(0)
  })

  it('groups simple list cards into batch 1', () => {
    const candidates = [
      makeAnalysis({ cardType: 'a', complexity: 'simple', visualizationType: 'list', estimatedEffort: 0.5 }),
      makeAnalysis({ cardType: 'b', complexity: 'simple', visualizationType: 'list', estimatedEffort: 1.5 }),
    ]
    const batches = generateBatches(candidates)
    const batch1 = batches.find(b => b.id === 'batch-1-simple-lists')
    expect(batch1).toBeDefined()
    expect(batch1!.priority).toBe(1)
    expect(batch1!.cards).toEqual(['a', 'b'])
    expect(batch1!.estimatedEffort).toBe(2)
  })

  it('groups status-grid cards into batch 2', () => {
    const candidates = [
      makeAnalysis({ cardType: 'sg1', visualizationType: 'status-grid', estimatedEffort: 3 }),
    ]
    const batches = generateBatches(candidates)
    const batch2 = batches.find(b => b.id === 'batch-2-status-grids')
    expect(batch2).toBeDefined()
    expect(batch2!.priority).toBe(2)
    expect(batch2!.cards).toContain('sg1')
  })

  it('groups chart and gauge cards into batch 3', () => {
    const candidates = [
      makeAnalysis({ cardType: 'chart1', visualizationType: 'chart', estimatedEffort: 2 }),
      makeAnalysis({ cardType: 'gauge1', visualizationType: 'gauge', estimatedEffort: 2 }),
    ]
    const batches = generateBatches(candidates)
    const batch3 = batches.find(b => b.id === 'batch-3-charts')
    expect(batch3).toBeDefined()
    expect(batch3!.priority).toBe(3)
    expect(batch3!.cards).toEqual(expect.arrayContaining(['chart1', 'gauge1']))
    expect(batch3!.estimatedEffort).toBe(4)
  })

  it('groups table cards into batch 4', () => {
    const candidates = [
      makeAnalysis({ cardType: 't1', visualizationType: 'table', estimatedEffort: 5 }),
    ]
    const batches = generateBatches(candidates)
    const batch4 = batches.find(b => b.id === 'batch-4-tables')
    expect(batch4).toBeDefined()
    expect(batch4!.priority).toBe(4)
  })

  it('groups complex and custom viz cards into batch 5', () => {
    const candidates = [
      makeAnalysis({ cardType: 'cx1', complexity: 'complex', visualizationType: 'list', estimatedEffort: 8 }),
      makeAnalysis({ cardType: 'custom1', complexity: 'moderate', visualizationType: 'custom', estimatedEffort: 6 }),
    ]
    const batches = generateBatches(candidates)
    const batch5 = batches.find(b => b.id === 'batch-5-complex')
    expect(batch5).toBeDefined()
    expect(batch5!.priority).toBe(5)
    expect(batch5!.cards).toEqual(expect.arrayContaining(['cx1', 'custom1']))
  })

  it('omits empty batches', () => {
    // Only chart cards, no lists / status-grids / tables / complex
    const candidates = [
      makeAnalysis({ cardType: 'c1', complexity: 'moderate', visualizationType: 'chart', estimatedEffort: 2 }),
    ]
    const batches = generateBatches(candidates)
    expect(batches.some(b => b.id === 'batch-1-simple-lists')).toBe(false)
    expect(batches.some(b => b.id === 'batch-3-charts')).toBe(true)
  })

  it('assigns ascending priority to batches', () => {
    const report = generateMigrationReport()
    const batchPriorities = report.batches.map(b => b.priority)
    for (let i = 1; i < batchPriorities.length; i++) {
      expect(batchPriorities[i]).toBeGreaterThan(batchPriorities[i - 1])
    }
  })
})

// ---------------------------------------------------------------------------
// formatReportAsMarkdown
// ---------------------------------------------------------------------------
describe('formatReportAsMarkdown', () => {
  let report: MigrationReport

  beforeAll(() => {
    report = generateMigrationReport()
  })

  it('generates markdown with all major sections', () => {
    const md = formatReportAsMarkdown(report)
    expect(md).toContain('# Card Migration Report')
    expect(md).toContain('## Summary')
    expect(md).toContain('## Cards by Complexity')
    expect(md).toContain('## Cards by Visualization Type')
    expect(md).toContain('## Recommended Migration Batches')
  })

  it('includes the generated-at timestamp', () => {
    const md = formatReportAsMarkdown(report)
    expect(md).toContain(report.generatedAt.toISOString())
  })

  it('includes total cards and estimated effort in summary table', () => {
    const md = formatReportAsMarkdown(report)
    expect(md).toContain(`| Total Cards | ${report.totalCards} |`)
    expect(md).toContain(`| Estimated Total Effort | ${report.totalEstimatedEffort} hours |`)
  })

  it('lists batch cards with backtick code formatting', () => {
    const md = formatReportAsMarkdown(report)
    // Each card in a batch is listed as `- \`cardType\``
    for (const batch of report.batches) {
      for (const card of batch.cards) {
        expect(md).toContain(`\`${card}\``)
      }
    }
  })

  it('includes non-candidate cards section when present', () => {
    const nonCandidates = report.cards.filter(c => !c.isMigrationCandidate)
    if (nonCandidates.length > 0) {
      const md = formatReportAsMarkdown(report)
      expect(md).toContain('## Non-Migration Candidates')
      for (const nc of nonCandidates) {
        expect(md).toContain(`\`${nc.cardType}\``)
      }
    }
  })

  it('only shows visualization types with count > 0', () => {
    const md = formatReportAsMarkdown(report)
    for (const [type, count] of Object.entries(report.byVisualization)) {
      if (count === 0) {
        // Should NOT appear in the visualization table
        expect(md).not.toContain(`| ${type} | 0 |`)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// formatReportAsJSON
// ---------------------------------------------------------------------------
describe('formatReportAsJSON', () => {
  it('generates valid JSON that round-trips', () => {
    const report = generateMigrationReport()
    const json = formatReportAsJSON(report)
    const parsed = JSON.parse(json)
    expect(parsed.totalCards).toBe(report.totalCards)
    expect(parsed.migrationCandidates).toBe(report.migrationCandidates)
    expect(parsed.batches.length).toBe(report.batches.length)
  })

  it('preserves batch structure in JSON', () => {
    const report = generateMigrationReport()
    const parsed = JSON.parse(formatReportAsJSON(report))
    for (const batch of parsed.batches) {
      expect(batch).toHaveProperty('id')
      expect(batch).toHaveProperty('name')
      expect(batch).toHaveProperty('cards')
      expect(batch).toHaveProperty('estimatedEffort')
      expect(batch).toHaveProperty('priority')
    }
  })
})

// ---------------------------------------------------------------------------
// getQuickStats
// ---------------------------------------------------------------------------
describe('getQuickStats', () => {
  it('returns quick stats with positive totalCards', () => {
    const stats = getQuickStats()
    expect(stats.totalCards).toBeGreaterThan(0)
  })

  it('migrationCandidates <= totalCards', () => {
    const stats = getQuickStats()
    expect(stats.migrationCandidates).toBeLessThanOrEqual(stats.totalCards)
  })

  it('simpleCards <= migrationCandidates', () => {
    const stats = getQuickStats()
    expect(stats.simpleCards).toBeLessThanOrEqual(stats.migrationCandidates)
  })

  it('estimatedHours is a positive number', () => {
    const stats = getQuickStats()
    expect(stats.estimatedHours).toBeGreaterThan(0)
    expect(typeof stats.estimatedHours).toBe('number')
  })
})
