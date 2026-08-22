import { describe, it, expect } from 'vitest'
import * as ui from '../ui'

/**
 * Behavioural tests for lib/constants/ui — replaces a placeholder
 * "module can be imported" stub. Verifies the runtime shape of
 * CHART_THEME (built from getCSSVar with hex fallbacks), legacy
 * re-exports, numeric thresholds, spacing grid and layout dimensions.
 *
 * Under jsdom, unset CSS custom properties resolve to '' so every
 * CHART_THEME value must fall through to its hex fallback.
 */

const HEX_OR_RGBA = /^(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\))$/

describe('constants/ui: chart dimensions', () => {
  it.each([
    ['CHART_HEIGHT_STANDARD', 160],
    ['CHART_HEIGHT_COMPACT', 100],
    ['CHART_HEIGHT_SM', 128],
    ['CHART_HEIGHT_LG', 192],
    ['CHART_MIN_HEIGHT_PX', 200],
    ['CHART_MIN_HEIGHT_TALL_PX', 250],
  ] as const)('%s = %i (positive integer)', (key, expected) => {
    const v = (ui as Record<string, unknown>)[key]
    expect(v).toBe(expected)
    expect(Number.isInteger(v)).toBe(true)
    expect(v as number).toBeGreaterThan(0)
  })

  it('SM < STANDARD < LG', () => {
    expect(ui.CHART_HEIGHT_SM).toBeLessThan(ui.CHART_HEIGHT_STANDARD)
    expect(ui.CHART_HEIGHT_STANDARD).toBeLessThan(ui.CHART_HEIGHT_LG)
  })

  it('MIN_HEIGHT_PX < MIN_HEIGHT_TALL_PX', () => {
    expect(ui.CHART_MIN_HEIGHT_PX).toBeLessThan(ui.CHART_MIN_HEIGHT_TALL_PX)
  })
})

describe('constants/ui: CHART_THEME structure', () => {
  it('exposes the expected top-level sub-groups', () => {
    expect(ui.CHART_THEME).toEqual(
      expect.objectContaining({
        tooltip: expect.any(Object),
        tooltipGray: expect.any(Object),
        grid: expect.any(Object),
        axis: expect.any(Object),
        dataZoom: expect.any(Object),
        markLine: expect.any(Object),
        text: expect.any(Object),
        emphasis: expect.any(Object),
        series: expect.any(Array),
      }),
    )
  })

  it('tooltip block has fontSize / fontSizeCompact as px strings', () => {
    expect(ui.CHART_THEME.tooltip.fontSize).toBe('12px')
    expect(ui.CHART_THEME.tooltip.fontSizeCompact).toBe('11px')
  })

  it('tooltipGray.radius uses rem units', () => {
    expect(ui.CHART_THEME.tooltipGray.radius).toBe('0.375rem')
  })

  it.each([
    ['tooltip.bg'],
    ['tooltip.border'],
    ['tooltip.text'],
    ['tooltip.label'],
    ['tooltipGray.bg'],
    ['tooltipGray.border'],
    ['grid.stroke'],
    ['axis.stroke'],
    ['axis.tick'],
    ['dataZoom.border'],
    ['dataZoom.bg'],
    ['dataZoom.filler'],
    ['dataZoom.handle'],
    ['dataZoom.text'],
    ['dataZoom.dataLine'],
    ['dataZoom.dataArea'],
    ['markLine.label'],
    ['markLine.stroke'],
    ['text.white'],
    ['text.muted'],
    ['emphasis.shadow'],
  ])('CHART_THEME.%s falls back to a hex/rgba token under jsdom', (path) => {
    const [group, key] = path.split('.')
    const grp = (ui.CHART_THEME as Record<string, Record<string, unknown>>)[group]
    const v = grp[key]
    expect(typeof v).toBe('string')
    expect(v).not.toBe('')
    expect(v as string).toMatch(HEX_OR_RGBA)
  })
})

describe('constants/ui: CHART_THEME.series palette', () => {
  it('has exactly 8 colours', () => {
    expect(ui.CHART_THEME.series).toHaveLength(8)
  })

  it('every colour is a hex/rgba string', () => {
    for (const c of ui.CHART_THEME.series) {
      expect(typeof c).toBe('string')
      expect(c).toMatch(HEX_OR_RGBA)
    }
  })

  it('all 8 colours are distinct', () => {
    const set = new Set(ui.CHART_THEME.series)
    expect(set.size).toBe(ui.CHART_THEME.series.length)
  })

  it('CHART_SERIES_COLORS is the same reference as CHART_THEME.series', () => {
    expect(ui.CHART_SERIES_COLORS).toBe(ui.CHART_THEME.series)
  })
})

describe('constants/ui: legacy re-exports match CHART_THEME', () => {
  it.each([
    ['CHART_TOOLTIP_BG', 'tooltip', 'bg'],
    ['CHART_TOOLTIP_BORDER', 'tooltip', 'border'],
    ['CHART_TOOLTIP_TEXT_COLOR', 'tooltip', 'text'],
    ['CHART_TOOLTIP_LABEL_COLOR', 'tooltip', 'label'],
    ['CHART_TOOLTIP_FONT_SIZE', 'tooltip', 'fontSize'],
    ['CHART_TOOLTIP_FONT_SIZE_COMPACT', 'tooltip', 'fontSizeCompact'],
    ['CHART_GRID_STROKE', 'grid', 'stroke'],
    ['CHART_AXIS_STROKE', 'axis', 'stroke'],
    ['CHART_TICK_COLOR', 'axis', 'tick'],
    ['CHART_DATAZOOM_BORDER', 'dataZoom', 'border'],
    ['CHART_DATAZOOM_BG', 'dataZoom', 'bg'],
    ['CHART_DATAZOOM_FILLER', 'dataZoom', 'filler'],
    ['CHART_DATAZOOM_HANDLE', 'dataZoom', 'handle'],
    ['CHART_DATAZOOM_TEXT', 'dataZoom', 'text'],
    ['CHART_DATAZOOM_DATA_LINE', 'dataZoom', 'dataLine'],
    ['CHART_DATAZOOM_DATA_AREA', 'dataZoom', 'dataArea'],
    ['CHART_MARK_LINE_LABEL', 'markLine', 'label'],
    ['CHART_MARK_LINE_STROKE', 'markLine', 'stroke'],
    ['CHART_TEXT_WHITE', 'text', 'white'],
    ['CHART_TEXT_MUTED', 'text', 'muted'],
    ['EMPHASIS_SHADOW_COLOR', 'emphasis', 'shadow'],
  ] as const)('%s === CHART_THEME.%s.%s', (exportName, group, key) => {
    const legacy = (ui as Record<string, unknown>)[exportName]
    const themed = (ui.CHART_THEME as Record<string, Record<string, unknown>>)[group][key]
    expect(legacy).toBe(themed)
  })

  it('CHART_TOOLTIP_CONTENT_STYLE has the shared shape', () => {
    expect(ui.CHART_TOOLTIP_CONTENT_STYLE).toEqual({
      backgroundColor: ui.CHART_THEME.tooltip.bg,
      border: `1px solid ${ui.CHART_THEME.tooltip.border}`,
      borderRadius: '8px',
      fontSize: ui.CHART_THEME.tooltip.fontSize,
    })
  })

  it('CHART_TOOLTIP_CONTENT_STYLE_GRAY uses the tooltipGray block', () => {
    expect(ui.CHART_TOOLTIP_CONTENT_STYLE_GRAY).toEqual({
      backgroundColor: ui.CHART_THEME.tooltipGray.bg,
      border: `1px solid ${ui.CHART_THEME.tooltipGray.border}`,
      borderRadius: ui.CHART_THEME.tooltipGray.radius,
    })
  })
})

describe('constants/ui: numeric font sizes', () => {
  it.each([
    ['CHART_AXIS_FONT_SIZE', 10],
    ['CHART_AXIS_FONT_SIZE_SM', 9],
    ['CHART_BODY_FONT_SIZE', 12],
    ['CHART_LEGEND_FONT_SIZE', 11],
    ['CLUSTER_MARKER_FONT_SIZE', 8],
  ] as const)('%s = %i (integer, ECharts numeric)', (key, expected) => {
    const v = (ui as Record<string, unknown>)[key]
    expect(v).toBe(expected)
    expect(Number.isInteger(v)).toBe(true)
  })

  it('SM < default axis font size', () => {
    expect(ui.CHART_AXIS_FONT_SIZE_SM).toBeLessThan(ui.CHART_AXIS_FONT_SIZE)
  })
})

describe('constants/ui: kubectl proxy thresholds', () => {
  it('MAX_CONCURRENT_KUBECTL_REQUESTS is a small positive integer', () => {
    expect(ui.MAX_CONCURRENT_KUBECTL_REQUESTS).toBe(4)
  })

  it('MAX_PENDING_KUBECTL_REQUESTS caps queue growth above the concurrency limit', () => {
    expect(ui.MAX_PENDING_KUBECTL_REQUESTS).toBe(64)
    expect(ui.MAX_PENDING_KUBECTL_REQUESTS).toBeGreaterThan(ui.MAX_CONCURRENT_KUBECTL_REQUESTS)
  })

  it('POD_RESTART_ISSUE_THRESHOLD is a positive integer', () => {
    expect(ui.POD_RESTART_ISSUE_THRESHOLD).toBe(5)
    expect(Number.isInteger(ui.POD_RESTART_ISSUE_THRESHOLD)).toBe(true)
  })
})

describe('constants/ui: misc', () => {
  it('COPY_FEEDBACK_TIMEOUT_MS is 2000 (2s user-visible feedback)', () => {
    expect(ui.COPY_FEEDBACK_TIMEOUT_MS).toBe(2000)
  })

  it('DEFAULT_PAGE_SIZE is a small positive integer', () => {
    expect(ui.DEFAULT_PAGE_SIZE).toBe(5)
  })
})

describe('constants/ui: spacing scale (px strings)', () => {
  const scale = [
    ['SPACING_XS', 2],
    ['SPACING_SM', 4],
    ['SPACING_MD', 8],
    ['SPACING_LG', 12],
    ['SPACING_XL', 16],
    ['SPACING_2XL', 20],
    ['SPACING_3XL', 24],
    ['SPACING_BORDER', 1],
  ] as const

  it.each(scale)('%s === "%ipx"', (key, px) => {
    expect((ui as Record<string, string>)[key]).toBe(`${px}px`)
  })

  it('scale (excluding BORDER) is strictly monotonically increasing', () => {
    const sizes = scale
      .filter(([k]) => k !== 'SPACING_BORDER')
      .map(([, px]) => px)
    for (let i = 1; i < sizes.length; i++) {
      expect(sizes[i]).toBeGreaterThan(sizes[i - 1])
    }
  })
})

describe('constants/ui: layout dimensions', () => {
  it('NAVBAR_HEIGHT_PX matches Tailwind h-16 (64px)', () => {
    expect(ui.NAVBAR_HEIGHT_PX).toBe(64)
  })

  it('BANNER_HEIGHT_PX matches min-h-11 (44px)', () => {
    expect(ui.BANNER_HEIGHT_PX).toBe(44)
  })

  it('MOBILE_BANNER_COLLAPSE_THRESHOLD is a small positive integer', () => {
    expect(ui.MOBILE_BANNER_COLLAPSE_THRESHOLD).toBe(2)
    expect(Number.isInteger(ui.MOBILE_BANNER_COLLAPSE_THRESHOLD)).toBe(true)
  })

  it('NAVBAR_FILTER_PANEL_OFFSET_CSS_VAR is a CSS custom property name', () => {
    expect(ui.NAVBAR_FILTER_PANEL_OFFSET_CSS_VAR).toBe('--navbar-filter-panel-offset')
    expect(ui.NAVBAR_FILTER_PANEL_OFFSET_CSS_VAR.startsWith('--')).toBe(true)
  })

  it('NAVBAR_FILTER_PANEL_GAP_PX matches Tailwind mt-2 (8px)', () => {
    expect(ui.NAVBAR_FILTER_PANEL_GAP_PX).toBe(8)
  })

  it('SIDEBAR_CONTROLS_LEFT_OFFSET_PX is -1 (1px overlap with sidebar border)', () => {
    expect(ui.SIDEBAR_CONTROLS_LEFT_OFFSET_PX).toBe(-1)
  })

  it('SIDEBAR_CONTROLS_OFFSET_PX is 48 (button width + breathing gap)', () => {
    expect(ui.SIDEBAR_CONTROLS_OFFSET_PX).toBe(48)
  })

  it('TOUCH_TARGET_SIZE_CLASS enforces WCAG 44×44 touch target', () => {
    expect(ui.TOUCH_TARGET_SIZE_CLASS).toBe('min-h-11 min-w-11')
  })

  it('TOUCH_TARGET_HEIGHT_CLASS enforces WCAG 44px height', () => {
    expect(ui.TOUCH_TARGET_HEIGHT_CLASS).toBe('min-h-11')
  })
})
