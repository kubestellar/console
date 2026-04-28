import { describe, it, expect } from 'vitest'
import { sanitizeUrl } from '../sanitizeUrl'

describe('sanitizeUrl', () => {
  it('returns about:blank for null', () => {
    expect(sanitizeUrl(null)).toBe('about:blank')
  })

  it('returns about:blank for undefined', () => {
    expect(sanitizeUrl(undefined)).toBe('about:blank')
  })

  it('returns about:blank for empty string', () => {
    expect(sanitizeUrl('')).toBe('about:blank')
  })

  it('allows https URLs', () => {
    expect(sanitizeUrl('https://example.com')).toBe('https://example.com/')
  })

  it('allows http URLs', () => {
    expect(sanitizeUrl('http://example.com')).toBe('http://example.com/')
  })

  it('allows mailto URLs', () => {
    const result = sanitizeUrl('mailto:user@example.com')
    expect(result).toBe('mailto:user@example.com')
  })

  it('allows tel URLs', () => {
    const result = sanitizeUrl('tel:+1234567890')
    expect(result).toBe('tel:+1234567890')
  })

  it('allows protocol-relative URLs', () => {
    expect(sanitizeUrl('//cdn.example.com/file.js')).toBe('//cdn.example.com/file.js')
  })

  it('allows relative paths starting with /', () => {
    expect(sanitizeUrl('/api/health')).toBe('/api/health')
  })

  it('allows relative paths starting with .', () => {
    expect(sanitizeUrl('./images/logo.png')).toBe('./images/logo.png')
  })

  it('allows paths without scheme', () => {
    expect(sanitizeUrl('images/logo.png')).toBe('images/logo.png')
  })

  it('blocks javascript: scheme', () => {
    expect(sanitizeUrl('javascript:alert(1)')).toBe('about:blank')
  })

  it('blocks data: scheme', () => {
    expect(sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBe('about:blank')
  })

  it('blocks vbscript: scheme', () => {
    expect(sanitizeUrl('vbscript:msgbox')).toBe('about:blank')
  })

  it('strips control characters from obfuscated URLs', () => {
    expect(sanitizeUrl('java\tscript:alert(1)')).toBe('about:blank')
  })

  it('strips null bytes from obfuscated URLs', () => {
    expect(sanitizeUrl('java\0script:alert(1)')).toBe('about:blank')
  })

  it('returns about:blank for whitespace-only strings', () => {
    expect(sanitizeUrl('   ')).toBe('about:blank')
  })
})
