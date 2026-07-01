import { describe, it, expect } from 'vitest'
import { resolveWidgetEndpoint, generateWidgetCommand } from '../codeGenerator.utils'
import { UBERSICHT_FALLBACK_URL, WIDGET_TOKEN_CACHE } from '../codeGenerator.constants'

describe('resolveWidgetEndpoint', () => {
  it('uses fallback URL when apiEndpoint is empty', () => {
    const result = resolveWidgetEndpoint('', '/api/clusters')
    expect(result).toBe(`${UBERSICHT_FALLBACK_URL}/api/clusters`)
  })

  it('uses provided apiEndpoint when given', () => {
    const result = resolveWidgetEndpoint('https://console.example.com', '/api/clusters')
    expect(result).toBe('https://console.example.com/api/clusters')
  })

  it('rewrites nightly E2E path to public endpoint', () => {
    const result = resolveWidgetEndpoint('https://example.com', '/api/nightly-e2e/runs')
    expect(result).toBe('https://example.com/api/public/nightly-e2e/runs')
  })

  it('does not rewrite non-nightly paths', () => {
    const result = resolveWidgetEndpoint('https://example.com', '/api/gpu/nodes')
    expect(result).toBe('https://example.com/api/gpu/nodes')
  })

  it('uses fallback for nightly E2E when apiEndpoint is empty', () => {
    const result = resolveWidgetEndpoint('', '/api/nightly-e2e/runs')
    expect(result).toBe(`${UBERSICHT_FALLBACK_URL}/api/public/nightly-e2e/runs`)
  })
})

describe('generateWidgetCommand', () => {
  const baseUrl = 'http://localhost:8081'
  const curlUrl = 'http://localhost:8081/api/clusters'

  it('includes curl URL in output', () => {
    const cmd = generateWidgetCommand(baseUrl, curlUrl)
    expect(cmd).toContain(curlUrl)
  })

  it('includes token cache path', () => {
    const cmd = generateWidgetCommand(baseUrl, curlUrl)
    expect(cmd).toContain(WIDGET_TOKEN_CACHE)
  })

  it('includes token endpoint with source parameter', () => {
    const cmd = generateWidgetCommand(baseUrl, curlUrl)
    expect(cmd).toContain('/api/agent/token?source=ubersicht-widget')
  })

  it('includes Authorization header', () => {
    const cmd = generateWidgetCommand(baseUrl, curlUrl)
    expect(cmd).toContain('Authorization: Bearer')
  })

  it('includes retry logic for expired auth', () => {
    const cmd = generateWidgetCommand(baseUrl, curlUrl)
    expect(cmd).toContain('Missing authorization')
  })

  it('includes connect-timeout for reliability', () => {
    const cmd = generateWidgetCommand(baseUrl, curlUrl)
    expect(cmd).toContain('--connect-timeout')
  })

  it('escapes single quotes in curlUrl to prevent shell injection (CWE-78)', () => {
    const maliciousUrl = "http://localhost/api'; rm -rf /; echo '"
    const cmd = generateWidgetCommand(baseUrl, maliciousUrl)
    // The single quote in the URL should be escaped as '\'' (close quote, escaped quote, reopen)
    expect(cmd).not.toContain("'; rm -rf /;")
    expect(cmd).toContain("'\\''")
  })

  it('escapes single quotes in baseUrl for token endpoint', () => {
    const maliciousBase = "http://evil.com'; cat /etc/passwd; echo '"
    const cmd = generateWidgetCommand(maliciousBase, curlUrl)
    expect(cmd).not.toContain("'; cat /etc/passwd;")
  })

  it('produces valid shell syntax with normal URLs', () => {
    const cmd = generateWidgetCommand(baseUrl, curlUrl)
    // Should contain balanced quotes and basic shell structure
    expect(cmd).toContain('TOKEN=')
    expect(cmd).toContain('OUT=')
    expect(cmd).toContain('echo "$OUT"')
  })
})
