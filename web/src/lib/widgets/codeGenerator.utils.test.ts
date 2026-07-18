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

  it('prevents command injection via backticks in URL', () => {
    // Backticks enable command substitution in shell: `command`
    // Single quotes prevent this, backticks inside single quotes are literal
    const urlWithBackticks = "http://example.com/api?q=`id`"
    const cmd = generateWidgetCommand('http://localhost:8080', urlWithBackticks)
    expect(cmd).toContain("'http://example.com/api?q=`id`'")
  })

  it('prevents command injection via $() substitution in URL', () => {
    // $(...) also enables command substitution
    const urlWithSubst = "http://example.com/api?q=$(whoami)"
    const cmd = generateWidgetCommand('http://localhost:8080', urlWithSubst)
    expect(cmd).toContain("'http://example.com/api?q=$(whoami)'")
  })

  it('handles multiple single quotes in URL', () => {
    const urlWithMultipleQuotes = "http://example.com/api?a='1'&b='2'"
    const cmd = generateWidgetCommand('http://localhost:8080', urlWithMultipleQuotes)
    // All quotes should be escaped
    expect(cmd).toContain("'\\''1'\\''")
    expect(cmd).toContain("'\\''2'\\''")
  })

  it('handles consecutive single quotes in URL', () => {
    const urlWithConsecutiveQuotes = "http://example.com/api?q=''"
    const cmd = generateWidgetCommand('http://localhost:8080', urlWithConsecutiveQuotes)
    expect(cmd).toContain("'\\'''\\''")
  })

  it('escapes single quotes in base URL for token endpoint', () => {
    const baseWithQuote = "http://example.com/path?key='value'"
    const cmd = generateWidgetCommand(baseWithQuote, 'http://example.com/api/data')
    // The token URL is constructed from baseWithQuote and contains escaped quotes
    expect(cmd).toContain("'\\''value'\\''")
  })

  it('handles both HTTP and HTTPS URLs safely', () => {
    const httpsUrl = "https://example.com:8443/api?token='secret'"
    const cmd = generateWidgetCommand('https://base.local', httpsUrl)
    expect(cmd).toContain("'\\''secret'\\''")
  })

  it('preserves shell metacharacters as literals when quoted', () => {
    // Special chars like &, |, ;, <, >, etc. are literal inside single quotes
    const urlWithMetachars = "http://example.com/api?q=test&other=val;rm -rf"
    const cmd = generateWidgetCommand('http://localhost:8080', urlWithMetachars)
    expect(cmd).toContain("'http://example.com/api?q=test&other=val;rm -rf'")
  })

  it('handles empty URL gracefully', () => {
    const cmd = generateWidgetCommand('http://localhost:8080', '')
    expect(typeof cmd).toBe('string')
    expect(cmd.length).toBeGreaterThan(0)
  })

  it('handles URL with special query parameters', () => {
    const urlWithSpecialParams = "http://example.com/api?filter={id:1}&sort=asc"
    const cmd = generateWidgetCommand('http://localhost:8080', urlWithSpecialParams)
    expect(cmd).toContain("'http://example.com/api?filter={id:1}&sort=asc'")
  })

  it('prevents newline injection in URL', () => {
    // Even though newlines break quoting, they should still be part of the string
    const urlWithNewline = "http://example.com/api?q=test\necho hacked"
    const cmd = generateWidgetCommand('http://localhost:8080', urlWithNewline)
    // The URL is still quoted, newlines won't execute commands
    expect(cmd).toContain("'http://example.com/api?q=test\necho hacked'")
  })
})
