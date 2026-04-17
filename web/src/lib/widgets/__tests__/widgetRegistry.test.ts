import { describe, it, expect } from 'vitest'
import {
  WIDGET_CARDS,
  WIDGET_STATS,
  WIDGET_TEMPLATES,
  NON_EXPORTABLE_CARDS,
  isCardExportable,
  getExportableCardsByCategory,
  getTemplatesByCategory,
} from '../widgetRegistry'

describe('WIDGET_CARDS', () => {
  it('contains known card definitions', () => {
    expect(WIDGET_CARDS.cluster_health).toBeDefined()
    expect(WIDGET_CARDS.pod_issues).toBeDefined()
    expect(WIDGET_CARDS.gpu_overview).toBeDefined()
  })

  it('each card has required fields', () => {
    for (const [key, card] of Object.entries(WIDGET_CARDS)) {
      expect(card.cardType).toBe(key)
      expect(card.displayName).toBeTruthy()
      expect(card.description).toBeTruthy()
      expect(card.apiEndpoints.length).toBeGreaterThan(0)
      expect(typeof card.supportsTheme).toBe('boolean')
      expect(card.minRefreshInterval).toBeGreaterThan(0)
      expect(card.defaultSize.width).toBeGreaterThan(0)
      expect(card.defaultSize.height).toBeGreaterThan(0)
      expect(['cluster', 'workload', 'gpu', 'security', 'monitoring', 'ci-cd']).toContain(card.category)
    }
  })

  it('has a nightly_e2e_status card', () => {
    const card = WIDGET_CARDS.nightly_e2e_status
    expect(card).toBeDefined()
    expect(card.apiEndpoints).toContain('/api/nightly-e2e/runs')
    expect(card.category).toBe('monitoring')
  })
})

describe('WIDGET_STATS', () => {
  it('contains expected stat definitions', () => {
    expect(WIDGET_STATS.total_clusters).toBeDefined()
    expect(WIDGET_STATS.total_pods).toBeDefined()
    expect(WIDGET_STATS.total_gpus).toBeDefined()
    expect(WIDGET_STATS.cpu_usage).toBeDefined()
    expect(WIDGET_STATS.memory_usage).toBeDefined()
    expect(WIDGET_STATS.unhealthy_pods).toBeDefined()
    expect(WIDGET_STATS.active_alerts).toBeDefined()
  })

  it('each stat has required fields', () => {
    for (const [key, stat] of Object.entries(WIDGET_STATS)) {
      expect(stat.statId).toBe(key)
      expect(stat.displayName).toBeTruthy()
      expect(stat.apiEndpoint).toBeTruthy()
      expect(stat.dataPath).toBeTruthy()
      expect(['number', 'percentage', 'bytes', 'duration']).toContain(stat.format)
      expect(stat.color).toMatch(/^#/)
      expect(stat.size.width).toBeGreaterThan(0)
      expect(stat.size.height).toBeGreaterThan(0)
    }
  })
})

describe('WIDGET_TEMPLATES', () => {
  it('contains expected templates', () => {
    expect(WIDGET_TEMPLATES.cluster_overview).toBeDefined()
    expect(WIDGET_TEMPLATES.gpu_dashboard).toBeDefined()
    expect(WIDGET_TEMPLATES.pod_monitor).toBeDefined()
    expect(WIDGET_TEMPLATES.stat_bar).toBeDefined()
    expect(WIDGET_TEMPLATES.mini_dashboard).toBeDefined()
  })

  it('each template has required fields', () => {
    for (const [key, template] of Object.entries(WIDGET_TEMPLATES)) {
      expect(template.templateId).toBe(key)
      expect(template.displayName).toBeTruthy()
      expect(template.description).toBeTruthy()
      expect(Array.isArray(template.cards)).toBe(true)
      expect(['grid', 'row', 'column', 'dashboard']).toContain(template.layout)
      expect(template.size.width).toBeGreaterThan(0)
      expect(template.size.height).toBeGreaterThan(0)
      expect(['overview', 'gpu', 'pods', 'security', 'custom', 'ci-cd']).toContain(template.category)
    }
  })

  it('template card references point to valid cards', () => {
    for (const template of Object.values(WIDGET_TEMPLATES)) {
      for (const cardType of template.cards) {
        expect(WIDGET_CARDS[cardType]).toBeDefined()
      }
    }
  })

  it('template stat references point to valid stats', () => {
    for (const template of Object.values(WIDGET_TEMPLATES)) {
      for (const statId of template.stats || []) {
        expect(WIDGET_STATS[statId]).toBeDefined()
      }
    }
  })
})

describe('NON_EXPORTABLE_CARDS', () => {
  it('contains interactive/WebSocket cards', () => {
    expect(NON_EXPORTABLE_CARDS.has('kubectl_terminal')).toBe(true)
    expect(NON_EXPORTABLE_CARDS.has('log_viewer')).toBe(true)
    expect(NON_EXPORTABLE_CARDS.has('shell_terminal')).toBe(true)
    expect(NON_EXPORTABLE_CARDS.has('arcade')).toBe(true)
  })

  it('does not contain normal exportable cards', () => {
    expect(NON_EXPORTABLE_CARDS.has('cluster_health')).toBe(false)
    expect(NON_EXPORTABLE_CARDS.has('gpu_overview')).toBe(false)
  })
})

describe('isCardExportable', () => {
  it('returns true for known exportable cards', () => {
    expect(isCardExportable('cluster_health')).toBe(true)
    expect(isCardExportable('pod_issues')).toBe(true)
    expect(isCardExportable('gpu_overview')).toBe(true)
  })

  it('returns false for non-exportable cards', () => {
    expect(isCardExportable('kubectl_terminal')).toBe(false)
    expect(isCardExportable('log_viewer')).toBe(false)
  })

  it('returns false for unknown card types', () => {
    expect(isCardExportable('unknown_card_type')).toBe(false)
    expect(isCardExportable('')).toBe(false)
  })
})

describe('getExportableCardsByCategory', () => {
  it('returns cards grouped by category', () => {
    const grouped = getExportableCardsByCategory()
    expect(grouped.cluster).toBeDefined()
    expect(grouped.workload).toBeDefined()
    expect(grouped.gpu).toBeDefined()
  })

  it('each category contains valid card definitions', () => {
    const grouped = getExportableCardsByCategory()
    for (const [category, cards] of Object.entries(grouped)) {
      expect(cards.length).toBeGreaterThan(0)
      for (const card of cards) {
        expect(card.category).toBe(category)
        expect(card.cardType).toBeTruthy()
      }
    }
  })

  it('cluster category contains cluster_health', () => {
    const grouped = getExportableCardsByCategory()
    const clusterCardTypes = grouped.cluster.map(c => c.cardType)
    expect(clusterCardTypes).toContain('cluster_health')
  })
})

describe('getTemplatesByCategory', () => {
  it('returns templates grouped by category', () => {
    const grouped = getTemplatesByCategory()
    expect(grouped.overview).toBeDefined()
    expect(grouped.gpu).toBeDefined()
  })

  it('each category contains valid template definitions', () => {
    const grouped = getTemplatesByCategory()
    for (const [category, templates] of Object.entries(grouped)) {
      expect(templates.length).toBeGreaterThan(0)
      for (const template of templates) {
        expect(template.category).toBe(category)
        expect(template.templateId).toBeTruthy()
      }
    }
  })

  it('overview category contains cluster_overview', () => {
    const grouped = getTemplatesByCategory()
    const overviewIds = grouped.overview.map(t => t.templateId)
    expect(overviewIds).toContain('cluster_overview')
  })
})
