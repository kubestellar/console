import { describe, it, expect } from 'vitest'
import {
  parsedHostname,
  hostnameEndsWith,
  hostnameContainsLabel,
  parsedProtocol,
  isHttpUrl,
} from '../urlHostname'

describe('parsedHostname', () => {
  it('extracts hostname from a full HTTPS URL', () => {
    expect(parsedHostname('https://api.cluster.eks.amazonaws.com:6443')).toBe(
      'api.cluster.eks.amazonaws.com'
    )
  })

  it('lowercases the hostname', () => {
    expect(parsedHostname('https://API.Example.COM/path')).toBe('api.example.com')
  })

  it('returns empty string for malformed URLs', () => {
    expect(parsedHostname('not-a-url')).toBe('')
  })

  it('returns empty string for empty string', () => {
    expect(parsedHostname('')).toBe('')
  })

  it('strips port from hostname', () => {
    expect(parsedHostname('http://localhost:8080')).toBe('localhost')
  })

  it('handles URLs with paths and query strings', () => {
    expect(parsedHostname('https://example.com/path?q=foo')).toBe('example.com')
  })
})

describe('hostnameEndsWith', () => {
  it('returns true when hostname ends with suffix', () => {
    expect(
      hostnameEndsWith('https://api.cluster.eks.amazonaws.com:6443', 'eks.amazonaws.com')
    ).toBe(true)
  })

  it('returns true when hostname exactly equals suffix', () => {
    expect(hostnameEndsWith('https://example.com', 'example.com')).toBe(true)
  })

  it('returns false when suffix appears in path, not hostname', () => {
    expect(
      hostnameEndsWith('https://evil.com/path?q=eks.amazonaws.com', 'eks.amazonaws.com')
    ).toBe(false)
  })

  it('returns false for malformed URL', () => {
    expect(hostnameEndsWith('not-a-url', 'example.com')).toBe(false)
  })

  it('is case-insensitive', () => {
    expect(hostnameEndsWith('https://API.EXAMPLE.COM', 'example.com')).toBe(true)
  })
})

describe('hostnameContainsLabel', () => {
  it('returns true when segment is a label in hostname', () => {
    expect(hostnameContainsLabel('https://api.fmaas.res.ibm.com:6443', 'fmaas')).toBe(true)
  })

  it('returns false when segment only appears in path', () => {
    expect(hostnameContainsLabel('https://evil.com/fmaas', 'fmaas')).toBe(false)
  })

  it('returns false for partial label match', () => {
    expect(hostnameContainsLabel('https://xfmaasy.com', 'fmaas')).toBe(false)
  })

  it('returns false for malformed URL', () => {
    expect(hostnameContainsLabel('not-a-url', 'fmaas')).toBe(false)
  })

  it('is case-insensitive', () => {
    expect(hostnameContainsLabel('https://api.FMAAS.com', 'fmaas')).toBe(true)
  })
})

describe('parsedProtocol', () => {
  it('returns protocol for HTTPS URL', () => {
    expect(parsedProtocol('https://example.com')).toBe('https:')
  })

  it('returns protocol for HTTP URL', () => {
    expect(parsedProtocol('http://example.com')).toBe('http:')
  })

  it('returns empty string for malformed URL', () => {
    expect(parsedProtocol('not-a-url')).toBe('')
  })

  it('lowercases the protocol', () => {
    expect(parsedProtocol('HTTPS://example.com')).toBe('https:')
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
    expect(isHttpUrl('ftp://example.com')).toBe(false)
  })

  it('returns false for malformed URL', () => {
    expect(isHttpUrl('not-a-url')).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isHttpUrl('')).toBe(false)
  })
})
