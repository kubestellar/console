import { describe, it, expect } from 'vitest'
import * as APIKeySettingsModule from './APIKeySettings'

describe('APIKeySettings Component', () => {
  it('exports APIKeySettings component', () => {
    expect(APIKeySettingsModule.APIKeySettings).toBeDefined()
    expect(typeof APIKeySettingsModule.APIKeySettings).toBe('function')
  })
})
