import { describe, it, expect } from 'vitest'
import { validateExternalUrl } from '../validateExternalUrl'

describe('validateExternalUrl', () => {
  it('returns null for null input', () => {
    expect(validateExternalUrl(null)).toBeNull()
  })

  it('returns null for undefined input', () => {
    expect(validateExternalUrl(undefined)).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(validateExternalUrl('')).toBeNull()
  })

  it('accepts https URLs', () => {
    const url = 'https://example.com/path?q=1'
    expect(validateExternalUrl(url)).toBe(url)
  })

  it('accepts http URLs', () => {
    const url = 'http://example.com/path'
    expect(validateExternalUrl(url)).toBe(url)
  })

  it('rejects javascript: protocol', () => {
    expect(validateExternalUrl('javascript:alert(1)')).toBeNull()
  })

  it('rejects data: protocol', () => {
    expect(validateExternalUrl('data:text/html,<h1>xss</h1>')).toBeNull()
  })

  it('rejects ftp: protocol', () => {
    expect(validateExternalUrl('ftp://evil.com/file')).toBeNull()
  })

  it('rejects file: protocol', () => {
    expect(validateExternalUrl('file:///etc/passwd')).toBeNull()
  })

  it('rejects vbscript: protocol', () => {
    expect(validateExternalUrl('vbscript:msgbox(1)')).toBeNull()
  })

  it('returns null for plain path (not a valid URL)', () => {
    expect(validateExternalUrl('/relative/path')).toBeNull()
  })

  it('returns null for invalid URL string', () => {
    expect(validateExternalUrl('not a url at all!!')).toBeNull()
  })

  it('accepts https URL with port', () => {
    const url = 'https://localhost:8080/api'
    expect(validateExternalUrl(url)).toBe(url)
  })

  it('accepts http URL with credentials (valid URL structure)', () => {
    const url = 'http://user:pass@host.com/'
    expect(validateExternalUrl(url)).toBe(url)
  })

  it('preserves original URL string unchanged on success', () => {
    const url = 'https://example.com/path?a=1&b=2#hash'
    expect(validateExternalUrl(url)).toBe(url)
  })
})
