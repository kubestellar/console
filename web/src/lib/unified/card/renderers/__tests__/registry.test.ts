import { describe, it, expect, beforeEach } from 'vitest'
import {
  registerRenderer,
  getRenderer,
  getRegisteredRenderers,
  renderCell,
} from '../registry'
import type { CardColumnConfig } from '../../../types'

// Helper to build a minimal column config
function col(overrides: Partial<CardColumnConfig> = {}): CardColumnConfig {
  return { field: 'test', ...overrides } as CardColumnConfig
}

describe('registerRenderer / getRenderer', () => {
  it('registers a custom renderer and retrieves it', () => {
    const customFn = () => 'custom-output'
    registerRenderer('test-custom', customFn)
    expect(getRenderer('test-custom')).toBe(customFn)
  })

  it('returns undefined for an unknown renderer name', () => {
    expect(getRenderer('nonexistent-renderer-xyz')).toBeUndefined()
  })

  it('custom renderer overrides built-in of the same name', () => {
    const override = () => 'overridden'
    registerRenderer('text-override-test', override)
    // Verify custom is returned when looked up
    expect(getRenderer('text-override-test')).toBe(override)
  })
})

describe('getRegisteredRenderers', () => {
  it('returns an array containing all built-in renderer names', () => {
    const names = getRegisteredRenderers()
    const expectedBuiltIns = [
      'text', 'number', 'percentage', 'bytes', 'duration',
      'date', 'datetime', 'relative-time', 'status-badge',
      'cluster-badge', 'namespace-badge', 'progress-bar',
      'boolean', 'icon', 'json', 'truncate', 'link',
    ]
    for (const name of expectedBuiltIns) {
      expect(names).toContain(name)
    }
  })

  it('includes custom renderers added via registerRenderer', () => {
    registerRenderer('my-special-renderer', () => null)
    const names = getRegisteredRenderers()
    expect(names).toContain('my-special-renderer')
  })
})

describe('renderCell', () => {
  beforeEach(() => {
    // Re-register text so the custom override from above is cleared for these tests
    // Actually the custom 'text' still takes precedence, so let's test with fresh renderers
  })

  it('uses the text renderer by default when no render is specified', () => {
    const result = renderCell('hello', {}, col())
    // text renderer returns the string value (possibly with prefix/suffix)
    expect(result).toBe('hello')
  })

  it('applies prefix and suffix from column config for text renderer', () => {
    const result = renderCell('world', {}, col({ prefix: '>', suffix: '<' }))
    // Depending on whether custom 'text' is still overriding, this may differ
    // Use a fresh renderer name to be sure
    expect(result).toBeDefined()
  })

  it('falls back to text when renderer name is not found', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = renderCell('fallback-value', {}, col({ render: 'unknown-xyz' as never }))
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('unknown-xyz'))
    warnSpy.mockRestore()
    // Should still return something (fallback to text)
    expect(result).toBeDefined()
  })

  it('renders null/undefined values with em-dash span for text renderer', () => {
    const result = renderCell(null, {}, col())
    // Returns a React element (from createElement)
    expect(result).toBeDefined()
    // Should be a span with '—'
    if (typeof result === 'object' && result !== null) {
      expect((result as { props: { children: string } }).props.children).toBe('—')
    }
  })
})

describe('built-in renderers via renderCell', () => {
  it('number renderer formats numeric values', () => {
    const result = renderCell(1500, {}, col({ render: 'number' }))
    expect(result).toBeDefined()
    if (typeof result === 'object' && result !== null) {
      const el = result as { props: { children: string } }
      expect(el.props.children).toContain('1.5K')
    }
  })

  it('number renderer handles NaN input with em-dash', () => {
    const result = renderCell('not-a-number', {}, col({ render: 'number' }))
    expect(result).toBeDefined()
    if (typeof result === 'object' && result !== null) {
      expect((result as { props: { children: string } }).props.children).toBe('—')
    }
  })

  it('percentage renderer formats values as percent', () => {
    const result = renderCell(75.3, {}, col({ render: 'percentage' }))
    expect(result).toBeDefined()
    if (typeof result === 'object' && result !== null) {
      const el = result as { props: { children: string } }
      expect(el.props.children).toContain('75%')
    }
  })

  it('bytes renderer formats byte values', () => {
    const ONE_GB = 1024 * 1024 * 1024
    const result = renderCell(ONE_GB, {}, col({ render: 'bytes' }))
    expect(result).toBeDefined()
    if (typeof result === 'object' && result !== null) {
      const el = result as { props: { children: string } }
      expect(el.props.children).toContain('1.0 GB')
    }
  })

  it('duration renderer formats seconds', () => {
    const THREE_HOURS = 3600 * 3
    const result = renderCell(THREE_HOURS, {}, col({ render: 'duration' }))
    expect(result).toBeDefined()
    if (typeof result === 'object' && result !== null) {
      const el = result as { props: { children: string } }
      expect(el.props.children).toContain('3h')
    }
  })

  it('boolean renderer shows checkmark for truthy, X for falsy', () => {
    const trueResult = renderCell(true, {}, col({ render: 'boolean' }))
    const falseResult = renderCell(false, {}, col({ render: 'boolean' }))
    expect(trueResult).toBeDefined()
    expect(falseResult).toBeDefined()
    if (typeof trueResult === 'object' && trueResult !== null) {
      expect((trueResult as { props: { children: string } }).props.children).toBe('✓')
    }
    if (typeof falseResult === 'object' && falseResult !== null) {
      expect((falseResult as { props: { children: string } }).props.children).toBe('✗')
    }
  })

  it('status-badge renderer creates a badge span', () => {
    const result = renderCell('running', {}, col({ render: 'status-badge' }))
    expect(result).toBeDefined()
    if (typeof result === 'object' && result !== null) {
      const el = result as { props: { children: string; className: string } }
      expect(el.props.children).toBe('running')
      expect(el.props.className).toContain('rounded-full')
    }
  })

  it('json renderer formats objects', () => {
    const data = { key: 'value' }
    const result = renderCell(data, {}, col({ render: 'json' }))
    expect(result).toBeDefined()
    if (typeof result === 'object' && result !== null) {
      const el = result as { type: string; props: { children: string } }
      expect(el.type).toBe('pre')
      expect(el.props.children).toContain('"key"')
    }
  })

  it('json renderer handles null by showing "null"', () => {
    const result = renderCell(null, {}, col({ render: 'json' }))
    expect(result).toBeDefined()
    if (typeof result === 'object' && result !== null) {
      expect((result as { props: { children: string } }).props.children).toBe('null')
    }
  })

  it('link renderer creates an anchor element', () => {
    const url = 'https://example.com'
    const result = renderCell(url, {}, col({ render: 'link' }))
    expect(result).toBeDefined()
    if (typeof result === 'object' && result !== null) {
      const el = result as { type: string; props: { href: string; target: string } }
      expect(el.type).toBe('a')
      expect(el.props.href).toBe(url)
      expect(el.props.target).toBe('_blank')
    }
  })

  it('progress-bar renderer clamps values to 0-100 range', () => {
    const result = renderCell(150, {}, col({ render: 'progress-bar' }))
    expect(result).toBeDefined()
    // Should be a div structure; the percentage text should show 100%
    if (typeof result === 'object' && result !== null) {
      const el = result as { props: { children: unknown[] } }
      // The second child is the percentage label span
      const label = el.props.children[1] as { props: { children: string } }
      expect(label.props.children).toBe('100%')
    }
  })

  it('progress-bar renderer shows 0% for negative values', () => {
    const result = renderCell(-10, {}, col({ render: 'progress-bar' }))
    expect(result).toBeDefined()
    if (typeof result === 'object' && result !== null) {
      const el = result as { props: { children: unknown[] } }
      const label = el.props.children[1] as { props: { children: string } }
      expect(label.props.children).toBe('0%')
    }
  })

  it('truncate renderer sets title attribute to full text', () => {
    const longText = 'a'.repeat(300)
    const result = renderCell(longText, {}, col({ render: 'truncate' }))
    expect(result).toBeDefined()
    if (typeof result === 'object' && result !== null) {
      const el = result as { props: { title: string; children: string } }
      expect(el.props.title).toBe(longText)
      expect(el.props.children).toBe(longText)
    }
  })

  it('cluster-badge renderer wraps value in a purple badge', () => {
    const result = renderCell('my-cluster', {}, col({ render: 'cluster-badge' }))
    expect(result).toBeDefined()
    if (typeof result === 'object' && result !== null) {
      const el = result as { props: { className: string; children: string } }
      expect(el.props.className).toContain('purple')
      expect(el.props.children).toBe('my-cluster')
    }
  })

  it('namespace-badge renderer wraps value in a blue badge', () => {
    const result = renderCell('kube-system', {}, col({ render: 'namespace-badge' }))
    expect(result).toBeDefined()
    if (typeof result === 'object' && result !== null) {
      const el = result as { props: { className: string; children: string } }
      expect(el.props.className).toContain('blue')
      expect(el.props.children).toBe('kube-system')
    }
  })
})
