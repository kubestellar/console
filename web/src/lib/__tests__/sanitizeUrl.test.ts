import { describe, it, expect } from 'vitest'
import { sanitizeUrl } from '../utils/sanitizeUrl'

const SAFE = 'about:blank'

describe('sanitizeUrl', () => {
  it('returns about:blank for null', () => {
    expect(sanitizeUrl(null)).toBe(SAFE)
  })

  it('returns about:blank for undefined', () => {
    expect(sanitizeUrl(undefined)).toBe(SAFE)
  })

  it('returns about:blank for empty string', () => {
    expect(sanitizeUrl('')).toBe(SAFE)
  })

  it('passes through https URLs', () => {
    const url = 'https://example.com/path?q=1'
    expect(sanitizeUrl(url)).toBe(url)
  })

  it('passes through http URLs', () => {
    const url = 'http://example.com'
    expect(sanitizeUrl(url)).toBe(url)
  })

  it('passes through mailto URLs', () => {
    expect(sanitizeUrl('mailto:user@example.com')).toBe('mailto:user@example.com')
  })

  it('passes through tel URLs', () => {
    expect(sanitizeUrl('tel:+15555551234')).toBe('tel:+15555551234')
  })

  it('passes through protocol-relative URLs', () => {
    expect(sanitizeUrl('//cdn.example.com/asset.js')).toBe('//cdn.example.com/asset.js')
  })

  it('passes through absolute paths', () => {
    expect(sanitizeUrl('/foo/bar')).toBe('/foo/bar')
  })

  it('passes through relative paths starting with dot', () => {
    expect(sanitizeUrl('./relative')).toBe('./relative')
  })

  it('passes through paths with no colon (no scheme)', () => {
    expect(sanitizeUrl('some/relative/path')).toBe('some/relative/path')
  })

  it('blocks javascript: scheme', () => {
    expect(sanitizeUrl('javascript:alert(1)')).toBe(SAFE)
  })

  it('blocks data: scheme', () => {
    expect(sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBe(SAFE)
  })

  it('blocks vbscript: scheme', () => {
    expect(sanitizeUrl('vbscript:msgbox(1)')).toBe(SAFE)
  })

  it('blocks javascript: with obfuscating tab', () => {
    expect(sanitizeUrl('java\tscript:alert(1)')).toBe(SAFE)
  })

  it('blocks javascript: with obfuscating newline', () => {
    expect(sanitizeUrl('java\nscript:alert(1)')).toBe(SAFE)
  })

  it('blocks ftp: scheme', () => {
    expect(sanitizeUrl('ftp://files.example.com')).toBe(SAFE)
  })

  it('returns about:blank for malformed URL with colon', () => {
    expect(sanitizeUrl('not::valid')).toBe(SAFE)
  })
})
