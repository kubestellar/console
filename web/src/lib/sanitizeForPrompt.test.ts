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
})
