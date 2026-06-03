import { describe, expect, it } from 'vitest'
import {
  buildDynamicCardApiRequest,
  DYNAMIC_CARD_EMBEDDED_CREDENTIALS_ERROR,
  DYNAMIC_CARD_INVALID_ENDPOINT_ERROR,
  DYNAMIC_CARD_PRIVATE_IP_ERROR,
  DYNAMIC_CARD_UNSAFE_ENDPOINT_ERROR,
} from '../apiEndpointSecurity'

describe('buildDynamicCardApiRequest', () => {
  it('allows relative console api endpoints and forwards the session token only there', () => {
    expect(buildDynamicCardApiRequest('/api/things?scope=all', 'token-123')).toEqual({
      requestUrl: '/api/things?scope=all',
      headers: { Authorization: 'Bearer token-123' },
      credentials: 'omit',
    })
  })

  it('normalizes same-origin absolute console api endpoints to a relative request', () => {
    expect(buildDynamicCardApiRequest('https://console.example.com/api/things?scope=all', 'token-123', 'https://console.example.com')).toEqual({
      requestUrl: '/api/things?scope=all',
      headers: { Authorization: 'Bearer token-123' },
      credentials: 'omit',
    })
  })

  it('rejects external origins', () => {
    expect(() => buildDynamicCardApiRequest('https://attacker.example/api/steal', 'token-123', 'https://console.example.com')).toThrow(DYNAMIC_CARD_UNSAFE_ENDPOINT_ERROR)
  })

  it('rejects non-api same-origin paths', () => {
    expect(() => buildDynamicCardApiRequest('https://console.example.com/oauth/callback', 'token-123', 'https://console.example.com')).toThrow(DYNAMIC_CARD_UNSAFE_ENDPOINT_ERROR)
  })

  it('rejects embedded credentials', () => {
    expect(() => buildDynamicCardApiRequest('https://user:secret@console.example.com/api/things', 'token-123', 'https://console.example.com')).toThrow(DYNAMIC_CARD_EMBEDDED_CREDENTIALS_ERROR)
  })

  it('rejects private IPv4 targets', () => {
    expect(() => buildDynamicCardApiRequest('http://10.0.0.15/api/things', 'token-123', 'https://console.example.com')).toThrow(DYNAMIC_CARD_PRIVATE_IP_ERROR)
  })

  it('rejects loopback IPv6 targets', () => {
    expect(() => buildDynamicCardApiRequest('http://[::1]/api/things', 'token-123', 'https://console.example.com')).toThrow(DYNAMIC_CARD_PRIVATE_IP_ERROR)
  })

  it('rejects invalid urls', () => {
    expect(() => buildDynamicCardApiRequest('not a valid url', 'token-123', 'https://console.example.com')).toThrow(DYNAMIC_CARD_INVALID_ENDPOINT_ERROR)
  })
})
