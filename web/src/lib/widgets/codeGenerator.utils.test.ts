import { describe, it, expect } from 'vitest'
import { generateWidgetCommand, resolveWidgetEndpoint } from './codeGenerator.utils'

describe('resolveWidgetEndpoint', () => {
  it('returns base + cardApiPath for standard paths', () => {
    expect(resolveWidgetEndpoint('http://localhost:8080', '/api/cards/foo')).toBe(
      'http://localhost:8080/api/cards/foo'
    )
  })

  it('rewrites nightly-e2e path to public endpoint', () => {
    expect(resolveWidgetEndpoint('http://localhost:8080', '/api/nightly-e2e/runs')).toBe(
      'http://localhost:8080/api/public/nightly-e2e/runs'
    )
  })

  it('falls back to UBERSICHT_FALLBACK_URL when apiEndpoint is empty', () => {
    const result = resolveWidgetEndpoint('', '/api/cards/bar')
    expect(result).toContain('/api/cards/bar')
    expect(result).not.toMatch(/^\/api/)
  })
})

describe('generateWidgetCommand — shell escaping (CWE-78)', () => {
  it('produces a non-empty shell command string', () => {
    const cmd = generateWidgetCommand('http://localhost:8080', 'http://localhost:8080/api/cards/foo')
    expect(typeof cmd).toBe('string')
    expect(cmd.length).toBeGreaterThan(0)
  })

  it('single-quotes the curl URL to prevent word splitting', () => {
    const cmd = generateWidgetCommand('http://localhost:8080', 'http://localhost:8080/api/foo')
    // The URL must appear wrapped in single quotes inside the command
    expect(cmd).toContain("'http://localhost:8080/api/foo'")
  })

  it('escapes single quotes in the URL using the close-quote trick', () => {
    // A URL containing a single quote must not break the shell quoting context.
    // shellEscapeSingleQuote replaces ' with '\'' so the quote is safely embedded.
    const maliciousUrl = "http://example.com/api/foo?q=it's"
    const cmd = generateWidgetCommand('http://localhost:8080', maliciousUrl)
    // Should contain the escaped form, not a raw unbalanced quote
    expect(cmd).toContain("it'\\''s")
  })

  it('escapes single quotes in the token URL', () => {
    const maliciousBase = "http://example.com/it's"
    const cmd = generateWidgetCommand(maliciousBase, 'http://example.com/api/data')
    expect(cmd).toContain("it'\\''s")
  })
})
