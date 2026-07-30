import { describe, expect, it } from 'vitest'
import { safeArtifactName, summarizeNetworkEntry } from '../collectEvidence'

describe('safeArtifactName', () => {
  it('lowercases and replaces non-alphanumeric chars with dashes', () => {
    expect(safeArtifactName('Visual Login Test')).toBe('visual-login-test')
  })

  it('removes leading and trailing dashes', () => {
    expect(safeArtifactName('--hello--')).toBe('hello')
  })

  it('collapses consecutive non-alphanumeric chars into a single dash', () => {
    expect(safeArtifactName('a!!!b___c')).toBe('a-b-c')
  })

  it('truncates to 120 chars', () => {
    const long = 'a'.repeat(200)
    expect(safeArtifactName(long).length).toBe(120)
  })

  it('returns fallback for empty string', () => {
    expect(safeArtifactName('')).toBe('visual-login-test')
  })

  it('returns fallback for all-special-char input', () => {
    expect(safeArtifactName('!@#$%^&*()')).toBe('visual-login-test')
  })

  it('handles numbers', () => {
    expect(safeArtifactName('Test 42 Route')).toBe('test-42-route')
  })

  it('handles path-like input', () => {
    expect(safeArtifactName('/clusters/detail/my-cluster')).toBe('clusters-detail-my-cluster')
  })

  it('handles unicode characters', () => {
    expect(safeArtifactName('café résumé')).toBe('caf-r-sum')
  })
})

describe('summarizeNetworkEntry', () => {
  it('formats entry with status', () => {
    const entry = { method: 'GET', status: 404, url: 'https://example.com/api/me' }
    expect(summarizeNetworkEntry(entry)).toBe('GET 404 https://example.com/api/me')
  })

  it('formats entry without status', () => {
    const entry = { method: 'POST', url: 'https://example.com/api/data' }
    expect(summarizeNetworkEntry(entry)).toBe('POST https://example.com/api/data')
  })

  it('formats entry with failureText', () => {
    const entry = { method: 'GET', url: 'https://example.com/api', failureText: 'net::ERR_FAILED' }
    expect(summarizeNetworkEntry(entry)).toBe('GET https://example.com/api net::ERR_FAILED')
  })

  it('formats entry with both status and failureText', () => {
    const entry = { method: 'GET', status: 500, url: 'https://example.com/api', failureText: 'timeout' }
    expect(summarizeNetworkEntry(entry)).toBe('GET 500 https://example.com/api timeout')
  })

  it('handles empty method gracefully', () => {
    const entry = { method: '', status: 200, url: 'https://example.com/' }
    expect(summarizeNetworkEntry(entry)).toBe(' 200 https://example.com/')
  })
})
