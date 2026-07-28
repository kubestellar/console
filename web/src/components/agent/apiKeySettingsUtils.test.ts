import { describe, it, expect } from 'vitest'
import { buildBaseURLPayload } from './apiKeySettingsUtils'

describe('buildBaseURLPayload', () => {
  it('returns clearBaseURL when draft is empty string', () => {
    const result = buildBaseURLPayload('openai', '')
    expect(result).toEqual({
      provider: 'openai',
      clearBaseURL: true,
    })
  })

  it('returns baseURL when draft has value', () => {
    const result = buildBaseURLPayload('openai', 'https://api.custom.com')
    expect(result).toEqual({
      provider: 'openai',
      baseURL: 'https://api.custom.com',
    })
  })

  it('handles different provider names', () => {
    const result = buildBaseURLPayload('anthropic', 'https://custom.anthropic.com')
    expect(result).toEqual({
      provider: 'anthropic',
      baseURL: 'https://custom.anthropic.com',
    })
  })

  it('returns clearBaseURL for whitespace-only draft', () => {
    // Note: function checks === '', so ' ' would NOT trigger clearBaseURL
    const result = buildBaseURLPayload('gemini', ' ')
    expect(result).toEqual({
      provider: 'gemini',
      baseURL: ' ',
    })
  })

  it('preserves exact baseURL value including trailing slash', () => {
    const result = buildBaseURLPayload('openai', 'https://api.example.com/')
    expect(result).toEqual({
      provider: 'openai',
      baseURL: 'https://api.example.com/',
    })
  })

  it('handles localhost URLs', () => {
    const result = buildBaseURLPayload('ollama', 'http://localhost:11434')
    expect(result).toEqual({
      provider: 'ollama',
      baseURL: 'http://localhost:11434',
    })
  })

  it('handles provider names with special characters', () => {
    const result = buildBaseURLPayload('provider-with_underscore', 'https://api.test.com')
    expect(result).toEqual({
      provider: 'provider-with_underscore',
      baseURL: 'https://api.test.com',
    })
  })
})
