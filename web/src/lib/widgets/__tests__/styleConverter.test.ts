import { describe, it, expect } from 'vitest'
import {
  tailwindToCSS,
  cssToObjectString,
  WIDGET_STYLES,
  generateWidgetStyles,
  generateWidgetShell,
} from '../styleConverter'

describe('tailwindToCSS', () => {
  it('returns empty object for empty string', () => {
    expect(tailwindToCSS('')).toEqual({})
  })

  it('converts flex classes', () => {
    const result = tailwindToCSS('flex items-center justify-between')
    expect(result.display).toBe('flex')
    expect(result.alignItems).toBe('center')
    expect(result.justifyContent).toBe('space-between')
  })

  it('converts padding classes', () => {
    const result = tailwindToCSS('p-4')
    expect(result.padding).toBe('16px')
  })

  it('converts text size classes', () => {
    const result = tailwindToCSS('text-sm font-bold')
    expect(result.fontSize).toBe('14px')
    expect(result.fontWeight).toBe(700)
  })

  it('converts color classes', () => {
    const result = tailwindToCSS('text-green-400')
    expect(result.color).toBe('#4ade80')
  })

  it('converts grid classes', () => {
    const result = tailwindToCSS('grid grid-cols-3 gap-4')
    expect(result.display).toBe('grid')
    expect(result.gridTemplateColumns).toContain('repeat(3')
    expect(result.gap).toBe('16px')
  })

  it('converts border-radius', () => {
    const result = tailwindToCSS('rounded-lg')
    expect(result.borderRadius).toBe('8px')
  })

  it('handles truncate', () => {
    const result = tailwindToCSS('truncate')
    expect(result.overflow).toBe('hidden')
    expect(result.textOverflow).toBe('ellipsis')
    expect(result.whiteSpace).toBe('nowrap')
  })

  it('ignores unknown classes', () => {
    const result = tailwindToCSS('custom-class flex')
    expect(result.display).toBe('flex')
  })

  it('handles glass effect', () => {
    const result = tailwindToCSS('glass')
    expect(result.backdropFilter).toContain('blur-sm')
  })

  it('converts hidden', () => {
    const result = tailwindToCSS('hidden')
    expect(result.display).toBe('none')
  })
})

describe('cssToObjectString', () => {
  it('returns {} for empty styles', () => {
    expect(cssToObjectString({})).toBe('{}')
  })

  it('formats properties as string', () => {
    const result = cssToObjectString({ display: 'flex', padding: '8px' })
    expect(result).toContain("display: 'flex'")
    expect(result).toContain("padding: '8px'")
  })

  it('converts numeric values to px strings', () => {
    const result = cssToObjectString({ fontWeight: 700 as unknown as string })
    expect(result).toContain("fontWeight: '700px'")
  })

  it('respects indent parameter', () => {
    const result = cssToObjectString({ display: 'flex' }, 4)
    expect(result).toContain('      display') // 4+2=6 spaces
  })
})

describe('WIDGET_STYLES', () => {
  it('has card styles', () => {
    expect(WIDGET_STYLES.card.backgroundColor).toBeTruthy()
    expect(WIDGET_STYLES.card.borderRadius).toBeTruthy()
  })

  it('has statBlock styles', () => {
    expect(WIDGET_STYLES.statBlock.display).toBe('flex')
    expect(WIDGET_STYLES.statBlock.flexDirection).toBe('column')
  })

  it('has health colors', () => {
    expect(WIDGET_STYLES.healthyColor).toBe('#22c55e')
    expect(WIDGET_STYLES.errorColor).toBe('#ef4444')
    expect(WIDGET_STYLES.warningColor).toBe('#eab308')
  })
})

describe('generateWidgetStyles', () => {
  it('returns a string containing styles object', () => {
    const result = generateWidgetStyles()
    expect(result).toContain('const styles = {')
    expect(result).toContain('card:')
    expect(result).toContain('statBlock:')
    expect(result).toContain('colors:')
  })
})

describe('generateWidgetShell', () => {
  it('generates widget shell with name and URL', () => {
    const result = generateWidgetShell('test-widget', 'http://localhost:8080')
    expect(result).toContain('http://localhost:8080')
    expect(result).toContain('ks-widget-pos-test-widget')
    expect(result).toContain('import')
    expect(result).toContain('openConsole')
  })

  it('includes drag event handlers', () => {
    const result = generateWidgetShell('test-widget', 'http://localhost:8080')
    expect(result).toContain('handleDragStart')
    expect(result).toContain('handleDragMove')
    expect(result).toContain('handleDragEnd')
  })

  it('includes UTM tracking parameters', () => {
    const result = generateWidgetShell('test-widget', 'http://localhost:8080')
    expect(result).toContain('utm_source=widget')
    expect(result).toContain('utm_medium=ubersicht')
  })

  it('includes CSS className export', () => {
    const result = generateWidgetShell('test-widget', 'http://localhost:8080')
    expect(result).toContain('export const className = css`')
    expect(result).toContain('.widget-container')
    expect(result).toContain('.drag-handle')
  })
})
