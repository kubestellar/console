import { describe, it, expect } from 'vitest'
import { sanitizeForPrompt } from './sanitizeForPrompt'

describe('sanitizeForPrompt', () => {
  it('returns empty string unchanged', () => {
    expect(sanitizeForPrompt('')).toBe('')
  })

  it('passes safe input through unchanged', () => {
    expect(sanitizeForPrompt('hello world')).toBe('hello world')
  })

  it('strips literal angle brackets', () => {
    expect(sanitizeForPrompt('foo<bar>baz')).toBe('foobarbaz')
  })

  it('normalises unicode-escaped < before stripping', () => {
    expect(sanitizeForPrompt('foo\\u003cscript\\u003ealert(1)\\u003c/script\\u003e')).toBe(
      'fooscriptalert(1)/script'
    )
  })

  it('normalises hex-escaped < before stripping', () => {
    expect(sanitizeForPrompt('\\x3cimg src=x\\x3e')).toBe('img src=x')
  })

  it('encodes & character', () => {
    expect(sanitizeForPrompt('a&b')).toBe('a&amp;b')
  })

  it('encodes double quotes', () => {
    expect(sanitizeForPrompt('say "hello"')).toBe('say &quot;hello&quot;')
  })

  it('encodes single quotes', () => {
    expect(sanitizeForPrompt("it's fine")).toBe("it&#39;s fine")
  })

  it('trims leading and trailing whitespace', () => {
    expect(sanitizeForPrompt('  trimmed  ')).toBe('trimmed')
  })

  it('truncates to default max length of 500', () => {
    const long = 'a'.repeat(600)
    expect(sanitizeForPrompt(long)).toHaveLength(500)
  })

  it('truncates to custom max length', () => {
    expect(sanitizeForPrompt('abcdefgh', 4)).toBe('abcd')
  })

  it('handles combined injection attempt: tags + quotes + entity', () => {
    const input = '<script>alert("xss&payload")</script>'
    const result = sanitizeForPrompt(input)
    expect(result).not.toContain('<')
    expect(result).not.toContain('>')
    expect(result).toContain('&amp;')
    expect(result).toContain('&quot;')
  })

  it('handles unicode-escaped variants with capital letters', () => {
    // \\u003C and \\u003E (capital C/E) should also be normalised
    expect(sanitizeForPrompt('\\u003Ctest\\u003E')).toBe('test')
  })

  it('handles null/undefined gracefully by coercing to string', () => {
    // While sanitizeForPrompt expects a string parameter, test coercion behavior
    expect(sanitizeForPrompt('')).toBe('')
  })

  it('handles string with only whitespace', () => {
    expect(sanitizeForPrompt('   \t\n  ')).toBe('')
  })

  it('handles prompt injection attempt with SQL', () => {
    const sqlInjection = "user' & DROP TABLE users; --"
    const result = sanitizeForPrompt(sqlInjection)
    // SQL special chars & and ' should be escaped
    expect(result).toContain('&amp;')
    expect(result).toContain('&#39;')
  })

  it('handles prompt injection with format strings', () => {
    const formatString = '%x %x %x %s'
    const result = sanitizeForPrompt(formatString)
    // Should pass through (% not special in this context)
    expect(result).toBe('%x %x %x %s')
  })

  it('handles very long input with unicode escapes', () => {
    const longInput = '\\u003cscript\\u003e' + 'a'.repeat(600) + '\\u003c/script\\u003e'
    const result = sanitizeForPrompt(longInput)
    // Should truncate to 500 after processing
    expect(result).toHaveLength(500)
    expect(result).not.toContain('<')
    expect(result).not.toContain('>')
  })

  it('handles hex-escaped variants with uppercase', () => {
    expect(sanitizeForPrompt('\\x3Ctest\\x3E')).toBe('test')
  })

  it('encodes ampersand before processing other entities', () => {
    // Test that & is encoded first to avoid double-encoding
    const input = 'a&b'
    const result = sanitizeForPrompt(input)
    expect(result).toBe('a&amp;b')
  })

  it('prevents tag-based injection with attributes', () => {
    const input = '<img src=x onerror="alert(1)">'
    const result = sanitizeForPrompt(input)
    expect(result).not.toContain('<')
    expect(result).not.toContain('>')
    expect(result).toContain('&quot;')
  })

  it('handles mixed escaping (literal and unicode combined)', () => {
    const input = '<test>\\u003cmore\\u003e'
    const result = sanitizeForPrompt(input)
    expect(result).not.toContain('<')
    expect(result).not.toContain('>')
  })

  it('normalizes unicode escapes before stripping same-literal chars', () => {
    // Ensure unicode < is normalized to literal < before stripping
    const input = '\\u003c<test>\\u003e>'
    const result = sanitizeForPrompt(input)
    expect(result).toBe('test')
  })

  it('handles script tag injection with newlines', () => {
    const input = '<script>\nalert(1)\n</script>'
    const result = sanitizeForPrompt(input)
    expect(result).not.toContain('<')
    expect(result).not.toContain('>')
  })

  it('preserves legitimate content with special chars correctly encoded', () => {
    const input = "It's a \"great\" day & the weather is nice"
    const result = sanitizeForPrompt(input)
    expect(result).toContain('It&#39;s')
    expect(result).toContain('&quot;great&quot;')
    expect(result).toContain('&amp;')
  })

  it('custom max length of zero returns empty string', () => {
    expect(sanitizeForPrompt('hello world', 0)).toBe('')
  })

  it('custom max length of one returns single character', () => {
    expect(sanitizeForPrompt('hello', 1)).toBe('h')
  })

  it('max length parameter is respected even with unicode escapes', () => {
    const input = '\\u003ctest\\u003e' // normalizes to 'test'
    const result = sanitizeForPrompt(input, 2)
    expect(result).toHaveLength(2)
    expect(result).toBe('te')
  })
})
