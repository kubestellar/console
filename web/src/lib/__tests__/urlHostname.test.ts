import { describe, it, expect } from 'vitest'
import { parsedHostname, hostnameEndsWith, hostnameContainsLabel, parsedProtocol, isHttpUrl } from '../utils/urlHostname'

describe('parsedHostname', () => {
  it('extracts hostname from https URL', () => {
    expect(parsedHostname('https://api.cluster.eks.amazonaws.com:6443')).toBe('api.cluster.eks.amazonaws.com')
  })

  it('extracts hostname from http URL', () => {
    expect(parsedHostname('http://localhost:8080')).toBe('localhost')
  })

  it('returns empty string for relative URL', () => {
    expect(parsedHostname('/relative/path')).toBe('')
  })

  it('returns empty string for malformed URL', () => {
    expect(parsedHostname('not-a-url')).toBe('')
  })

  it('returns empty string for empty string', () => {
    expect(parsedHostname('')).toBe('')
  })

  it('lowercases hostname', () => {
    expect(parsedHostname('https://API.EXAMPLE.COM')).toBe('api.example.com')
  })
})

describe('hostnameEndsWith', () => {
  it('returns true when hostname ends with suffix', () => {
    expect(hostnameEndsWith('https://api.cluster.eks.amazonaws.com:6443', 'eks.amazonaws.com')).toBe(true)
  })

  it('returns true when hostname equals suffix exactly', () => {
    expect(hostnameEndsWith('https://eks.amazonaws.com', 'eks.amazonaws.com')).toBe(true)
  })

  it('returns false for path-based substring bypass', () => {
    expect(hostnameEndsWith('https://evil.com/path?q=eks.amazonaws.com', 'eks.amazonaws.com')).toBe(false)
  })

  it('returns false for prefix match (not suffix)', () => {
    expect(hostnameEndsWith('https://eks.amazonaws.com.evil.com', 'eks.amazonaws.com')).toBe(false)
  })

  it('returns false for malformed URL', () => {
    expect(hostnameEndsWith('not-a-url', 'amazonaws.com')).toBe(false)
  })

  it('is case-insensitive', () => {
    expect(hostnameEndsWith('https://API.EKS.AMAZONAWS.COM', 'eks.amazonaws.com')).toBe(true)
  })
})

describe('hostnameContainsLabel', () => {
  it('returns true when segment appears as a label', () => {
    expect(hostnameContainsLabel('https://api.fmaas.res.ibm.com:6443', 'fmaas')).toBe(true)
  })

  it('returns false when segment appears only in path', () => {
    expect(hostnameContainsLabel('https://evil.com/fmaas', 'fmaas')).toBe(false)
  })

  it('returns false when segment is partial label match', () => {
    expect(hostnameContainsLabel('https://myfmaas.example.com', 'fmaas')).toBe(false)
  })

  it('returns false for malformed URL', () => {
    expect(hostnameContainsLabel('not-a-url', 'fmaas')).toBe(false)
  })

  it('is case-insensitive', () => {
    expect(hostnameContainsLabel('https://api.FMAAS.ibm.com', 'fmaas')).toBe(true)
  })
})

describe('parsedProtocol', () => {
  it('returns https: for https URL', () => {
    expect(parsedProtocol('https://example.com')).toBe('https:')
  })

  it('returns http: for http URL', () => {
    expect(parsedProtocol('http://example.com')).toBe('http:')
  })

  it('returns empty string for malformed URL', () => {
    expect(parsedProtocol('not-a-url')).toBe('')
  })

  it('returns empty string for empty string', () => {
    expect(parsedProtocol('')).toBe('')
  })
})

describe('isHttpUrl', () => {
  it('returns true for https URL', () => {
    expect(isHttpUrl('https://example.com')).toBe(true)
  })

  it('returns true for http URL', () => {
    expect(isHttpUrl('http://example.com')).toBe(true)
  })

  it('returns false for ftp URL', () => {
    expect(isHttpUrl('ftp://files.example.com')).toBe(false)
  })

  it('returns false for javascript: URL', () => {
    expect(isHttpUrl('javascript:alert(1)')).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isHttpUrl('')).toBe(false)
  })

  it('returns false for relative path', () => {
    expect(isHttpUrl('/relative')).toBe(false)
  })
})
