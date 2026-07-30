/**
 * Unit tests for getWidgetPreviewDimensions and getWidgetPreviewScale
 * from WidgetExportModalPreview.tsx
 */
import { describe, it, expect, vi } from 'vitest'
import { getWidgetPreviewDimensions, getWidgetPreviewScale } from '../WidgetExportModalPreview'
import type { WidgetConfig } from '../../../../lib/widgets/codeGenerator'

// Mock the widget registries with known dimensions
vi.mock('../../../../lib/widgets/widgetRegistry', () => ({
  WIDGET_CARDS: {
    'cluster-health': { cardType: 'cluster-health', defaultSize: { width: 300, height: 200 } },
    'gpu-monitor': { cardType: 'gpu-monitor', defaultSize: { width: 400, height: 300 } },
  },
  WIDGET_STATS: {
    'cpu-usage': { statId: 'cpu-usage', size: { width: 120, height: 80 } },
    'memory-usage': { statId: 'memory-usage', size: { width: 140, height: 80 } },
    'pod-count': { statId: 'pod-count', size: { width: 100, height: 60 } },
  },
  WIDGET_TEMPLATES: {
    'cluster_overview': { templateId: 'cluster_overview', size: { width: 500, height: 400 } },
    'compact_stats': { templateId: 'compact_stats', size: { width: 200, height: 100 } },
  },
}))

// ---------------------------------------------------------------------------
// getWidgetPreviewDimensions
// ---------------------------------------------------------------------------

describe('getWidgetPreviewDimensions', () => {
  it('returns null when config is null', () => {
    expect(getWidgetPreviewDimensions(null)).toBeNull()
  })

  it('returns card defaultSize for card type config', () => {
    const config: WidgetConfig = {
      type: 'card',
      cardType: 'cluster-health',
      apiEndpoint: 'http://localhost:3000',
      refreshInterval: 30000,
      theme: 'dark',
    }
    expect(getWidgetPreviewDimensions(config)).toEqual({ width: 300, height: 200 })
  })

  it('returns null for unknown card type', () => {
    const config: WidgetConfig = {
      type: 'card',
      cardType: 'non-existent-card',
      apiEndpoint: 'http://localhost:3000',
      refreshInterval: 30000,
      theme: 'dark',
    }
    expect(getWidgetPreviewDimensions(config)).toBeNull()
  })

  it('returns combined dimensions for stat type (sum width, max height)', () => {
    const config: WidgetConfig = {
      type: 'stat',
      statIds: ['cpu-usage', 'memory-usage'],
      apiEndpoint: 'http://localhost:3000',
      refreshInterval: 30000,
      theme: 'dark',
    }
    const dims = getWidgetPreviewDimensions(config)
    expect(dims).toEqual({ width: 260, height: 80 }) // 120+140, max(80,80)
  })

  it('returns null for stat type with empty statIds', () => {
    const config: WidgetConfig = {
      type: 'stat',
      statIds: [],
      apiEndpoint: 'http://localhost:3000',
      refreshInterval: 30000,
      theme: 'dark',
    }
    expect(getWidgetPreviewDimensions(config)).toBeNull()
  })

  it('returns null for stat type with all unknown stat ids', () => {
    const config: WidgetConfig = {
      type: 'stat',
      statIds: ['unknown-stat-1', 'unknown-stat-2'],
      apiEndpoint: 'http://localhost:3000',
      refreshInterval: 30000,
      theme: 'dark',
    }
    expect(getWidgetPreviewDimensions(config)).toBeNull()
  })

  it('filters out unknown stat ids and computes from known ones', () => {
    const config: WidgetConfig = {
      type: 'stat',
      statIds: ['cpu-usage', 'unknown-stat'],
      apiEndpoint: 'http://localhost:3000',
      refreshInterval: 30000,
      theme: 'dark',
    }
    const dims = getWidgetPreviewDimensions(config)
    expect(dims).toEqual({ width: 120, height: 80 })
  })

  it('returns template size for template type config', () => {
    const config: WidgetConfig = {
      type: 'template',
      templateId: 'cluster_overview',
      apiEndpoint: 'http://localhost:3000',
      refreshInterval: 30000,
      theme: 'dark',
    }
    expect(getWidgetPreviewDimensions(config)).toEqual({ width: 500, height: 400 })
  })

  it('returns null for unknown template id', () => {
    const config: WidgetConfig = {
      type: 'template',
      templateId: 'non-existent-template',
      apiEndpoint: 'http://localhost:3000',
      refreshInterval: 30000,
      theme: 'dark',
    }
    expect(getWidgetPreviewDimensions(config)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// getWidgetPreviewScale
// ---------------------------------------------------------------------------

describe('getWidgetPreviewScale', () => {
  // Max width: 260, Max height: 220

  it('returns 1 when dimensions are null', () => {
    expect(getWidgetPreviewScale(null)).toBe(1)
  })

  it('returns 1 when dimensions fit within max bounds', () => {
    expect(getWidgetPreviewScale({ width: 200, height: 150 })).toBe(1)
  })

  it('scales down by width when width exceeds max', () => {
    // 260 / 520 = 0.5 (width-constrained)
    expect(getWidgetPreviewScale({ width: 520, height: 100 })).toBeCloseTo(0.5)
  })

  it('scales down by height when height exceeds max', () => {
    // 220 / 440 = 0.5 (height-constrained)
    expect(getWidgetPreviewScale({ width: 100, height: 440 })).toBeCloseTo(0.5)
  })

  it('uses the smaller scale factor when both exceed', () => {
    // width: 260/600 ≈ 0.433, height: 220/500 = 0.44 → picks min = 0.433
    const scale = getWidgetPreviewScale({ width: 600, height: 500 })
    expect(scale).toBeCloseTo(260 / 600)
  })

  it('returns exactly 1 for dimensions equal to max bounds', () => {
    expect(getWidgetPreviewScale({ width: 260, height: 220 })).toBe(1)
  })

  it('handles very small dimensions (returns 1)', () => {
    expect(getWidgetPreviewScale({ width: 10, height: 10 })).toBe(1)
  })
})
