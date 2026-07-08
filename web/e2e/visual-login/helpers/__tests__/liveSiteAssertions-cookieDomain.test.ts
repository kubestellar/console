import { describe, it, expect } from 'vitest'

/**
 * Cookie domain extraction logic (from liveSiteAssertions.ts lines 254-256):
 * ```
 * const cookieDomain = url.hostname === '127.0.0.1' || url.hostname === 'localhost' 
 *   ? undefined 
 *   : url.hostname
 * ```
 */
function getCookieDomain(baseUrl: string): string | undefined {
  const url = new URL(baseUrl)
  return url.hostname === '127.0.0.1' || url.hostname === 'localhost' 
    ? undefined 
    : url.hostname
}

describe('cookie domain extraction logic', () => {
  describe('localhost and loopback addresses', () => {
    it('returns undefined for localhost', () => {
      expect(getCookieDomain('http://localhost:3000')).toBe(undefined)
    })

    it('returns undefined for 127.0.0.1', () => {
      expect(getCookieDomain('http://127.0.0.1:3000')).toBe(undefined)
    })

    it('returns undefined for localhost with https', () => {
      expect(getCookieDomain('https://localhost:8443')).toBe(undefined)
    })

    it('returns undefined for 127.0.0.1 with https', () => {
      expect(getCookieDomain('https://127.0.0.1:8443')).toBe(undefined)
    })

    it('returns undefined for localhost without port', () => {
      expect(getCookieDomain('http://localhost')).toBe(undefined)
    })

    it('returns undefined for 127.0.0.1 without port', () => {
      expect(getCookieDomain('http://127.0.0.1')).toBe(undefined)
    })
  })

  describe('regular domain names', () => {
    it('extracts domain from simple domain', () => {
      expect(getCookieDomain('https://console.example.com')).toBe('console.example.com')
    })

    it('extracts domain from domain with port', () => {
      expect(getCookieDomain('https://console.example.com:8443')).toBe('console.example.com')
    })

    it('extracts domain from http URL', () => {
      expect(getCookieDomain('http://console.example.com:8080')).toBe('console.example.com')
    })

    it('extracts domain with path and query', () => {
      expect(getCookieDomain('https://console.example.com/dashboard?tab=overview')).toBe('console.example.com')
    })
  })

  describe('subdomain handling', () => {
    it('extracts full subdomain', () => {
      expect(getCookieDomain('https://app.console.example.com')).toBe('app.console.example.com')
    })

    it('extracts multi-level subdomain', () => {
      expect(getCookieDomain('https://dev.us-east-1.console.example.com')).toBe('dev.us-east-1.console.example.com')
    })

    it('extracts single-level domain', () => {
      expect(getCookieDomain('https://example.com')).toBe('example.com')
    })
  })

  describe('IP addresses (non-loopback)', () => {
    it('extracts IPv4 address', () => {
      expect(getCookieDomain('http://192.168.1.100:3000')).toBe('192.168.1.100')
    })

    it('extracts public IPv4 address', () => {
      expect(getCookieDomain('https://10.0.0.50:8443')).toBe('10.0.0.50')
    })

    it('extracts IPv4 without port', () => {
      expect(getCookieDomain('http://172.16.0.1')).toBe('172.16.0.1')
    })

    it('handles IPv6 localhost as string', () => {
      // URL constructor normalizes [::1] to ::1
      expect(getCookieDomain('http://[::1]:3000')).toBe('::1')
    })

    it('extracts IPv6 address', () => {
      expect(getCookieDomain('http://[2001:db8::1]:8080')).toBe('2001:db8::1')
    })
  })

  describe('edge cases', () => {
    it('handles URL with hash fragment', () => {
      expect(getCookieDomain('https://console.example.com/dashboard#section')).toBe('console.example.com')
    })

    it('handles URL with credentials (username:password)', () => {
      expect(getCookieDomain('https://user:pass@console.example.com')).toBe('console.example.com')
    })

    it('handles URL with encoded characters in path', () => {
      expect(getCookieDomain('https://console.example.com/path%20with%20spaces')).toBe('console.example.com')
    })

    it('handles production-like URLs', () => {
      expect(getCookieDomain('https://console.kubestellar.io')).toBe('console.kubestellar.io')
    })

    it('handles staging URLs', () => {
      expect(getCookieDomain('https://staging.console.kubestellar.io')).toBe('staging.console.kubestellar.io')
    })
  })

  describe('invalid inputs', () => {
    it('throws for invalid URL', () => {
      expect(() => getCookieDomain('not-a-url')).toThrow()
    })

    it('throws for malformed URL', () => {
      expect(() => getCookieDomain('http://')).toThrow()
    })

    it('throws for empty string', () => {
      expect(() => getCookieDomain('')).toThrow()
    })
  })
})
