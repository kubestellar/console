import { describe, it, expect } from 'vitest'
import { CARD_INSTALL_MAP } from '../cardInstallMap'

describe('CARD_INSTALL_MAP', () => {
  it('is a non-empty record', () => {
    const keys = Object.keys(CARD_INSTALL_MAP)
    expect(keys.length).toBeGreaterThan(0)
  })

  it('each entry has project, missionKey, and kbPaths', () => {
    for (const [, info] of Object.entries(CARD_INSTALL_MAP)) {
      expect(info.project).toBeTruthy()
      expect(info.missionKey).toBeTruthy()
      expect(Array.isArray(info.kbPaths)).toBe(true)
      expect(info.kbPaths.length).toBeGreaterThan(0)
    }
  })

  it('contains OPA cards', () => {
    expect(CARD_INSTALL_MAP.opa_policies).toBeDefined()
    expect(CARD_INSTALL_MAP.opa_policies.project).toContain('OPA')
  })

  it('contains Kyverno cards', () => {
    expect(CARD_INSTALL_MAP.kyverno_policies).toBeDefined()
    expect(CARD_INSTALL_MAP.kyverno_policies.project).toContain('Kyverno')
  })

  it('kbPaths are valid paths', () => {
    for (const [, info] of Object.entries(CARD_INSTALL_MAP)) {
      for (const path of info.kbPaths) {
        expect(path).toMatch(/\.json$/)
      }
    }
  })
})
