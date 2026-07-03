import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { sanitizeText, sanitizeJson, safeJsonStringify } from '../sanitizeEvidence'

describe('sanitizeText', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('returns empty string for null/undefined input', () => {
    expect(sanitizeText(null)).toBe('')
    expect(sanitizeText(undefined)).toBe('')
  })

  it('passes through clean text unchanged', () => {
    expect(sanitizeText('hello world')).toBe('hello world')
  })

  it('redacts PEM private keys', () => {
    const pem = '-----BEGIN RSA PRIVATE KEY-----\nMIIEow...base64data...\n-----END RSA PRIVATE KEY-----'
    expect(sanitizeText(pem)).toBe('[REDACTED_PRIVATE_KEY]')
  })

  it('redacts EC private keys', () => {
    const pem = '-----BEGIN EC PRIVATE KEY-----\nMHQCAQ...data...\n-----END EC PRIVATE KEY-----'
    expect(sanitizeText(pem)).toBe('[REDACTED_PRIVATE_KEY]')
  })

  it('redacts Bearer tokens', () => {
    const text = 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig'
    const result = sanitizeText(text)
    expect(result).toContain('Bearer [REDACTED]')
    expect(result).not.toContain('eyJhbGciOiJIUzI1NiJ9')
  })

  it('redacts token URL parameters', () => {
    const url = 'https://example.com/callback?access_token=secret123&state=ok'
    const result = sanitizeText(url)
    expect(result).toContain('access_token=[REDACTED]')
    expect(result).not.toContain('secret123')
    expect(result).toContain('state=ok')
  })

  it('redacts refresh_token URL parameters', () => {
    const url = 'https://example.com/api?refresh_token=my-refresh-tok&next=home'
    const result = sanitizeText(url)
    expect(result).toContain('refresh_token=[REDACTED]')
    expect(result).not.toContain('my-refresh-tok')
  })

  it('redacts client_secret URL parameters', () => {
    const url = 'https://example.com/oauth?client_secret=supersecret&client_id=public'
    const result = sanitizeText(url)
    expect(result).toContain('client_secret=[REDACTED]')
    expect(result).not.toContain('supersecret')
  })

  it('redacts authorization headers', () => {
    const text = 'authorization: Basic dXNlcjpwYXNz'
    const result = sanitizeText(text)
    expect(result).toContain('authorization: [REDACTED]')
    expect(result).not.toContain('dXNlcjpwYXNz')
  })

  it('redacts cookie headers', () => {
    const text = 'cookie: session=abc123; token=xyz'
    const result = sanitizeText(text)
    expect(result).toContain('cookie: [REDACTED]')
    expect(result).not.toContain('abc123')
  })

  it('redacts x-api-key headers', () => {
    const text = 'x-api-key: my-secret-api-key-value'
    const result = sanitizeText(text)
    expect(result).toContain('x-api-key: [REDACTED]')
    expect(result).not.toContain('my-secret-api-key-value')
  })

  it('redacts kc-agent-token headers', () => {
    const text = 'kc-agent-token: agent-secret-12345'
    const result = sanitizeText(text)
    expect(result).toContain('kc-agent-token: [REDACTED]')
    expect(result).not.toContain('agent-secret-12345')
  })

  it('redacts kubeconfig content', () => {
    const kubeconfig = 'apiVersion: v1\nclusters:\n- cluster:\n    server: https://10.0.0.1\n  name: kind'
    const result = sanitizeText(kubeconfig)
    expect(result).toBe('[REDACTED_KUBECONFIG]')
  })

  it('redacts JWTs', () => {
    const jwt = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature_data_here'
    const result = sanitizeText(`token: ${jwt}`)
    expect(result).toContain('[REDACTED_JWT]')
    expect(result).not.toContain('eyJhbGciOiJSUzI1NiJ9')
  })

  it('redacts sensitive environment variable values', () => {
    process.env.MY_SECRET_TOKEN = 'super-secret-value-12345'
    const text = 'The value is super-secret-value-12345 here'
    const result = sanitizeText(text)
    expect(result).toContain('[REDACTED_ENV_VALUE]')
    expect(result).not.toContain('super-secret-value-12345')
  })

  it('ignores short env values (< 6 chars)', () => {
    process.env.MY_SECRET_KEY = 'short'
    const text = 'The value is short here'
    const result = sanitizeText(text)
    expect(result).toBe('The value is short here')
  })

  it('handles multiple sensitive patterns in one string', () => {
    const text = 'Bearer abc123def456 and cookie: session=xyz'
    const result = sanitizeText(text)
    expect(result).toContain('Bearer [REDACTED]')
    expect(result).toContain('cookie: [REDACTED]')
  })
})

describe('sanitizeJson', () => {
  it('redacts values for sensitive keys', () => {
    const result = sanitizeJson({ PASSWORD: 'secret', name: 'test' })
    expect(result).toEqual({ PASSWORD: '[REDACTED]', name: 'test' })
  })

  it('redacts nested sensitive keys', () => {
    const result = sanitizeJson({ config: { CLIENT_SECRET: 'abc' } })
    expect(result).toEqual({ config: { CLIENT_SECRET: '[REDACTED]' } })
  })

  it('sanitizes string values containing secrets', () => {
    const result = sanitizeJson({ log: 'Bearer my-token-here' })
    expect(result.log).toContain('Bearer [REDACTED]')
  })

  it('sanitizes arrays recursively', () => {
    const result = sanitizeJson(['Bearer secret-tok', 'normal'])
    expect(result[0]).toContain('Bearer [REDACTED]')
    expect(result[1]).toBe('normal')
  })

  it('passes through primitives', () => {
    expect(sanitizeJson(42)).toBe(42)
    expect(sanitizeJson(true)).toBe(true)
    expect(sanitizeJson(null)).toBe(null)
  })

  it('handles nested objects deeply', () => {
    const input = { a: { b: { TOKEN: 'secret', c: 'safe' } } }
    const result = sanitizeJson(input)
    expect(result).toEqual({ a: { b: { TOKEN: '[REDACTED]', c: 'safe' } } })
  })
})

describe('safeJsonStringify', () => {
  it('produces sanitized JSON output', () => {
    const result = safeJsonStringify({ SECRET: 'hidden', name: 'test' })
    const parsed = JSON.parse(result)
    expect(parsed.SECRET).toBe('[REDACTED]')
    expect(parsed.name).toBe('test')
  })

  it('formats with 2-space indentation', () => {
    const result = safeJsonStringify({ a: 1 })
    expect(result).toBe('{\n  "a": 1\n}')
  })
})
