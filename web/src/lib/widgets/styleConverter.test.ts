import { describe, it, expect } from 'vitest'
import {
  tailwindToCSS,
  cssToObjectString,
  generateWidgetStyles,
  generateWidgetShell,
  WIDGET_STYLES,
} from './styleConverter'

// =============================================================================
// tailwindToCSS
// =============================================================================

describe('tailwindToCSS', () => {
  it('returns empty object for empty string', () => {
    expect(tailwindToCSS('')).toEqual({})
  })

  it('converts a single known class', () => {
    expect(tailwindToCSS('flex')).toEqual({ display: 'flex' })
  })

  it('converts multiple classes into merged properties', () => {
    const result = tailwindToCSS('flex items-center gap-4')
    expect(result).toEqual({
      display: 'flex',
      alignItems: 'center',
      gap: '16px',
    })
  })

  it('ignores unknown classes gracefully', () => {
    const result = tailwindToCSS('flex nonexistent-class p-4')
    expect(result).toEqual({
      display: 'flex',
      padding: '16px',
    })
  })

  it('handles extra whitespace between classes', () => {
    const result = tailwindToCSS('  flex   p-2  ')
    expect(result).toEqual({
      display: 'flex',
      padding: '8px',
    })
  })

  it('applies the glass composite style', () => {
    const result = tailwindToCSS('glass')
    expect(result).toHaveProperty('backdropFilter', 'blur(12px)')
    expect(result).toHaveProperty('borderRadius', '12px')
  })

  it('later classes override earlier ones for the same property', () => {
    // 'p-2' sets padding to 8px, 'p-4' sets it to 16px
    const result = tailwindToCSS('p-2 p-4')
    expect(result.padding).toBe('16px')
  })

  it('handles typography classes', () => {
    const result = tailwindToCSS('text-sm font-bold text-center')
    expect(result).toEqual({
      fontSize: '14px',
      lineHeight: '20px',
      fontWeight: 700,
      textAlign: 'center',
    })
  })

  it('handles color classes', () => {
    const result = tailwindToCSS('text-green-500 bg-red-500/10')
    expect(result).toEqual({
      color: '#22c55e',
      backgroundColor: 'rgba(239, 68, 68, 0.1)',
    })
  })

  it('handles border classes', () => {
    const result = tailwindToCSS('border border-border rounded-lg')
    expect(result).toEqual({
      borderWidth: '1px',
      borderStyle: 'solid',
      borderColor: 'rgba(55, 65, 81, 0.5)',
      borderRadius: '8px',
    })
  })

  it('handles position classes', () => {
    const result = tailwindToCSS('absolute inset-0')
    expect(result).toEqual({
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    })
  })

  it('handles the truncate utility', () => {
    const result = tailwindToCSS('truncate')
    expect(result).toEqual({
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    })
  })
})

// =============================================================================
// cssToObjectString
// =============================================================================

describe('cssToObjectString', () => {
  it('returns {} for empty styles', () => {
    expect(cssToObjectString({})).toBe('{}')
  })

  it('formats a single property', () => {
    const result = cssToObjectString({ padding: '8px' })
    expect(result).toContain("padding: '8px'")
    expect(result).toMatch(/^\{/)
    expect(result).toMatch(/\}$/)
  })

  it('formats numeric values with px suffix', () => {
    const result = cssToObjectString({ fontWeight: 700 as unknown as string })
    expect(result).toContain("fontWeight: '700px'")
  })

  it('respects custom indent', () => {
    const result = cssToObjectString({ margin: '0' }, 4)
    // Inner properties should be indented by indent+2 = 6 spaces
    expect(result).toContain("      margin: '0'")
    // Closing brace should be at indent = 4 spaces
    expect(result).toMatch(/\n {4}\}$/)
  })

  it('handles multiple properties', () => {
    const result = cssToObjectString({
      display: 'flex',
      gap: '12px',
    })
    expect(result).toContain("display: 'flex'")
    expect(result).toContain("gap: '12px'")
  })
})

// =============================================================================
// generateWidgetStyles
// =============================================================================

describe('generateWidgetStyles', () => {
  it('returns a string starting with const styles', () => {
    const result = generateWidgetStyles()
    expect(result).toMatch(/^const styles = \{/)
  })

  it('includes all expected style blocks', () => {
    const result = generateWidgetStyles()
    expect(result).toContain('card:')
    expect(result).toContain('statBlock:')
    expect(result).toContain('statValue:')
    expect(result).toContain('statLabel:')
    expect(result).toContain('cardTitle:')
    expect(result).toContain('grid:')
    expect(result).toContain('row:')
    expect(result).toContain('column:')
    expect(result).toContain('statusDot:')
    expect(result).toContain('colors:')
  })

  it('uses single quotes for values (not double quotes)', () => {
    const result = generateWidgetStyles()
    // Should not contain JSON-style double-quoted values
    expect(result).not.toMatch(/"rgba/)
    expect(result).not.toMatch(/"#/)
  })

  it('includes color constants from WIDGET_STYLES', () => {
    const result = generateWidgetStyles()
    expect(result).toContain(WIDGET_STYLES.healthyColor)
    expect(result).toContain(WIDGET_STYLES.warningColor)
    expect(result).toContain(WIDGET_STYLES.errorColor)
  })

  it('includes drag handle and issue button styles', () => {
    const result = generateWidgetStyles()
    expect(result).toContain('dragHandle:')
    expect(result).toContain('dragIndicator:')
    expect(result).toContain('issueBtn:')
  })
})

// =============================================================================
// generateWidgetShell
// =============================================================================

describe('generateWidgetShell', () => {
  it('includes the widget name in storage key', () => {
    const result = generateWidgetShell('my-widget', 'https://console.example.com')
    expect(result).toContain("ks-widget-pos-my-widget")
  })

  it('includes the console URL', () => {
    const result = generateWidgetShell('test', 'https://app.kubestellar.io')
    expect(result).toContain("https://app.kubestellar.io")
  })

  it('exports className with CSS template literal', () => {
    const result = generateWidgetShell('w', 'http://localhost:3000')
    expect(result).toContain('export const className = css`')
  })

  it('includes drag handling infrastructure', () => {
    const result = generateWidgetShell('drag-test', 'https://x.io')
    expect(result).toContain('handleDragStart')
    expect(result).toContain('handleDragMove')
    expect(result).toContain('handleDragEnd')
    expect(result).toContain('getStoredPosition')
    expect(result).toContain('savePosition')
  })

  it('includes UTM tracking parameters', () => {
    const result = generateWidgetShell('analytics', 'https://x.io')
    expect(result).toContain('utm_source=widget')
    expect(result).toContain('utm_medium=ubersicht')
  })

  it('includes issue reporting function with widget name', () => {
    const result = generateWidgetShell('cluster-health', 'https://x.io')
    expect(result).toContain("const WIDGET_NAME = 'cluster-health'")
    expect(result).toContain('openIssue')
  })

  it('imports css and run from uebersicht', () => {
    const result = generateWidgetShell('x', 'https://x.io')
    expect(result).toContain('import { css, run } from "uebersicht"')
  })

  it('includes tooltip CSS classes', () => {
    const result = generateWidgetShell('x', 'https://x.io')
    expect(result).toContain('.tip-wrap')
    expect(result).toContain('.dot-tip-wrap')
    expect(result).toContain('.spark-tip-wrap')
  })
})
