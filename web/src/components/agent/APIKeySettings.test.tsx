import { describe, it, expect } from 'vitest'
import * as APIKeySettingsModule from './APIKeySettings'
import { buildBaseURLPayload } from './APIKeySettings'

describe('APIKeySettings Component', () => {
  it('exports APIKeySettings component', () => {
    expect(APIKeySettingsModule.APIKeySettings).toBeDefined()
    expect(typeof APIKeySettingsModule.APIKeySettings).toBe('function')
  })
})

describe('buildBaseURLPayload', () => {
  it('sends clearBaseURL:true and omits baseURL when draft is empty (#8277)', () => {
    const body = buildBaseURLPayload('ollama', '')
    expect(body).toEqual({ provider: 'ollama', clearBaseURL: true })
    expect('baseURL' in body).toBe(false)
  })

  it('sends baseURL and omits clearBaseURL when draft is non-empty', () => {
    const body = buildBaseURLPayload('ollama', 'http://localhost:11434')
    expect(body).toEqual({ provider: 'ollama', baseURL: 'http://localhost:11434' })
    expect('clearBaseURL' in body).toBe(false)
  })
})
