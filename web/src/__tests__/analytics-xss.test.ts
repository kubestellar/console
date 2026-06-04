/**
 * CWE-79 regression test: Verify that web/public/analytics.js
 * escapes all user-controllable strings before innerHTML interpolation.
 *
 * The esc() function must be applied to every external data field
 * that is interpolated into HTML templates rendered via innerHTML.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const analyticsSource = readFileSync(
  resolve(__dirname, '../../public/analytics.js'),
  'utf-8'
)

describe('analytics.js XSS prevention (CWE-79)', () => {
  it('defines the esc() HTML-escape utility', () => {
    expect(analyticsSource).toContain('function esc(str)')
    // Must escape all 5 dangerous chars
    expect(analyticsSource).toContain("replace(/&/g, '&amp;')")
    expect(analyticsSource).toContain("replace(/</g, '&lt;')")
    expect(analyticsSource).toContain("replace(/>/g, '&gt;')")
    expect(analyticsSource).toContain("replace(/\"/g, '&quot;')")
    expect(analyticsSource).toContain("replace(/'/g, '&#39;')")
  })

  it('escapes page paths in Top Pages table', () => {
    expect(analyticsSource).toContain('${esc(p.page)}')
  })

  it('escapes event names in Events table', () => {
    expect(analyticsSource).toContain('${esc(e.event)}')
  })

  it('escapes CNCF project names', () => {
    expect(analyticsSource).toContain('${esc(p.project)}')
  })

  it('escapes traffic source and medium strings', () => {
    expect(analyticsSource).toContain('${esc(s.source)}')
    expect(analyticsSource).toContain('${esc(s.medium)}')
  })

  it('escapes NPS feedback text (highest-risk vector)', () => {
    expect(analyticsSource).toContain('${esc(r.feedback)')
  })

  it('escapes NPS category', () => {
    expect(analyticsSource).toContain('${esc(r.category)}')
  })

  it('escapes card names in Card Interactions table', () => {
    expect(analyticsSource).toContain('${esc(c.card)}')
  })

  it('escapes feature names in Feature Usage table', () => {
    expect(analyticsSource).toContain('${esc(f.feature)}')
  })

  it('escapes error message in error display', () => {
    expect(analyticsSource).toContain('${esc(err.message)}')
  })

  it('escapes error detail field', () => {
    expect(analyticsSource).toContain('esc(e.detail)')
  })

  it('escapes stickiest page in insights', () => {
    expect(analyticsSource).toContain('${esc(stickiest.page)}')
  })

  it('does not use raw user data in innerHTML without esc()', () => {
    // Find all innerHTML assignments and template literals that render data
    // Ensure no raw field access patterns appear without esc() wrapping
    // These patterns were the original XSS vectors
    const dangerousPatterns = [
      /\$\{p\.page\}/,        // unescaped page path
      /\$\{e\.event\}/,       // unescaped event name (not inside esc())
      /\$\{s\.source\}/,      // unescaped traffic source
      /\$\{s\.medium\}/,      // unescaped traffic medium
      /\$\{r\.feedback[^)]/,  // unescaped NPS feedback (not followed by closing paren of esc)
      /\$\{c\.card\}/,        // unescaped card name
      /\$\{f\.feature\}/,     // unescaped feature name
      /\$\{p\.project\}/,     // unescaped CNCF project
      /\$\{err\.message\}/,   // unescaped error message
    ]

    for (const pattern of dangerousPatterns) {
      expect(analyticsSource).not.toMatch(pattern)
    }
  })
})
