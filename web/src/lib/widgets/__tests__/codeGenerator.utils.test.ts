import { describe, it, expect } from 'vitest'
import { resolveWidgetEndpoint, generateWidgetCommand } from '../codeGenerator.utils'

describe('codeGenerator.utils', () => {
  describe('resolveWidgetEndpoint', () => {
    it('uses apiEndpoint when provided', () => {
      const result = resolveWidgetEndpoint('https://my.api', '/api/alerts')
      expect(result).toBe('https://my.api/api/alerts')
    })

    it('falls back to UBERSICHT_FALLBACK_URL when apiEndpoint is empty', () => {
      const result = resolveWidgetEndpoint('', '/api/alerts')
      expect(result).toBe('http://localhost:8081/api/alerts')
    })

    it('uses public endpoint for nightly-e2e path', () => {
      const result = resolveWidgetEndpoint('https://my.api', '/api/nightly-e2e/runs')
      expect(result).toBe('https://my.api/api/public/nightly-e2e/runs')
    })

    it('uses normal path for other API routes', () => {
      const result = resolveWidgetEndpoint('https://my.api', '/api/metrics')
      expect(result).toBe('https://my.api/api/metrics')
    })
  })

  describe('generateWidgetCommand — shell escape safety (CWE-78)', () => {
    it('returns a non-empty shell command', () => {
      const cmd = generateWidgetCommand('http://localhost:8081', 'http://localhost:8081/api/test')
      expect(cmd.length).toBeGreaterThan(0)
    })

    it('includes the curl URL in the output', () => {
      const cmd = generateWidgetCommand('http://host', 'http://host/api/data')
      expect(cmd).toContain('http://host/api/data')
    })

    it('escapes single quotes in the curl URL to prevent shell injection', () => {
      const malicious = "http://host/api/data?x=';rm -rf /;'"
      const cmd = generateWidgetCommand('http://host', malicious)
      // Should not contain unescaped single quotes inside the curl URL
      // The escaped pattern is: close quote, backslash-quote, reopen quote
      expect(cmd).toContain("'\\''")
      expect(cmd).not.toContain("';rm -rf /;'")
    })

    it('escapes single quotes in the base URL for token fetch', () => {
      const malicious = "http://host'inject"
      const cmd = generateWidgetCommand(malicious, 'http://host/api/data')
      expect(cmd).toContain("'\\''")
    })

    it('contains Authorization header usage', () => {
      const cmd = generateWidgetCommand('http://host', 'http://host/api/x')
      expect(cmd).toContain('Authorization: Bearer')
    })

    it('includes token cache fallback logic', () => {
      const cmd = generateWidgetCommand('http://host', 'http://host/api/x')
      expect(cmd).toContain('/tmp/.kc-widget-token')
    })

    it('includes retry on auth failure', () => {
      const cmd = generateWidgetCommand('http://host', 'http://host/api/x')
      expect(cmd).toContain('Missing authorization')
    })
  })
})
