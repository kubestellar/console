import { describe, expect, it } from 'vitest'

import { validateExternalUrl } from './validateExternalUrl'

describe('validateExternalUrl', () => {
  describe('nullish and empty input', () => {
    it('returns null for null', () => {
      expect(validateExternalUrl(null)).toBeNull()
    })

    it('returns null for undefined', () => {
      expect(validateExternalUrl(undefined)).toBeNull()
    })

    it('returns null for empty string', () => {
      expect(validateExternalUrl('')).toBeNull()
    })
  })

  describe('allowed protocols', () => {
    it('accepts a plain https URL', () => {
      expect(validateExternalUrl('https://example.com')).toBe('https://example.com')
    })

    it('accepts a plain http URL', () => {
      expect(validateExternalUrl('http://example.com')).toBe('http://example.com')
    })

    it('preserves path, query, and fragment on https URLs', () => {
      const url = 'https://example.com/path/to/page?query=1&x=y#section'
      expect(validateExternalUrl(url)).toBe(url)
    })

    it('accepts https URLs with port and userinfo', () => {
      const url = 'https://user:pass@example.com:8443/resource'
      expect(validateExternalUrl(url)).toBe(url)
    })

    it('accepts localhost with http', () => {
      expect(validateExternalUrl('http://localhost:3000')).toBe('http://localhost:3000')
    })

    it('returns the original string exactly (does not re-serialize)', () => {
      // Note the trailing dot in the host — URL() would normalize it away in href,
      // but the function returns the original input, not the parsed form.
      const url = 'https://example.com./weird?a=%20b'
      expect(validateExternalUrl(url)).toBe(url)
    })
  })

  describe('XSS / injection protocols are rejected', () => {
    it.each([
      'javascript:alert(1)',
      'JAVASCRIPT:alert(1)',
      'Java\u0000script:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
      'about:blank',
      'chrome://settings',
      'blob:https://example.com/uuid',
      'mailto:someone@example.com',
      'tel:+15551234567',
      'ftp://example.com/pub',
      'ws://example.com/socket',
      'wss://example.com/socket',
      'gopher://example.com',
    ])('rejects %s', (url) => {
      expect(validateExternalUrl(url)).toBeNull()
    })
  })

  describe('malformed URLs', () => {
    it.each([
      'not a url',
      'example.com', // no scheme
      '//example.com', // protocol-relative
      '/relative/path',
      'relative/path',
      '  ',
      'http://', // missing host
    ])('rejects malformed URL: %s', (url) => {
      expect(validateExternalUrl(url)).toBeNull()
    })
  })

  describe('protocol matching is exact', () => {
    it('rejects https-lookalike schemes', () => {
      // The check compares protocol strings exactly ('http:' / 'https:'), so
      // schemes that merely start with "http" must not be treated as safe.
      expect(validateExternalUrl('httpsx://example.com')).toBeNull()
      expect(validateExternalUrl('httpx://example.com')).toBeNull()
    })

    it('normalizes protocol case via URL parser (HTTPS is accepted)', () => {
      // URL() normalizes the scheme to lowercase before we compare,
      // so uppercase schemes on otherwise-valid URLs are still safe.
      expect(validateExternalUrl('HTTPS://example.com')).toBe('HTTPS://example.com')
      expect(validateExternalUrl('HtTp://example.com')).toBe('HtTp://example.com')
    })
  })
})
