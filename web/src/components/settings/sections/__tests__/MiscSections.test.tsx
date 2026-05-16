/**
 * Miscellaneous Settings Section Export Tests
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (k: string) => k }),
}))

/** Timeout for importing modules with deep dependency trees */
const IMPORT_TIMEOUT_MS = 30000

describe('AgentBackendSettings', () => {
  it('exports AgentBackendSettings', async () => {
    const mod = await import('../AgentBackendSettings')
    expect(mod.AgentBackendSettings).toBeDefined()
  }, IMPORT_TIMEOUT_MS)
})

describe('AgentSection', () => {
  it('exports AgentSection', async () => {
    const mod = await import('../AgentSection')
    expect(mod.AgentSection).toBeDefined()
  }, IMPORT_TIMEOUT_MS)
})

describe('AISettingsSection', () => {
  it('exports AISettingsSection', async () => {
    const mod = await import('../AISettingsSection')
    expect(mod.AISettingsSection).toBeDefined()
  }, IMPORT_TIMEOUT_MS)
})

describe('APIKeysSection', () => {
  it('exports APIKeysSection', async () => {
    const mod = await import('../APIKeysSection')
    expect(mod.APIKeysSection).toBeDefined()
  }, IMPORT_TIMEOUT_MS)
})

describe('GitHubTokenSection', () => {
  it('exports GitHubTokenSection', async () => {
    const mod = await import('../GitHubTokenSection')
    expect(mod.GitHubTokenSection).toBeDefined()
  }, IMPORT_TIMEOUT_MS)
})

describe('LocalClustersSection', () => {
  it('exports LocalClustersSection', async () => {
    const mod = await import('../LocalClustersSection')
    expect(mod.LocalClustersSection).toBeDefined()
  }, IMPORT_TIMEOUT_MS)
})

describe('PermissionsSection', () => {
  it('exports PermissionsSection', async () => {
    const mod = await import('../PermissionsSection')
    expect(mod.PermissionsSection).toBeDefined()
  }, IMPORT_TIMEOUT_MS)
})

describe('PersistenceSection', () => {
  it('exports PersistenceSection', async () => {
    const mod = await import('../PersistenceSection')
    expect(mod.PersistenceSection).toBeDefined()
  }, IMPORT_TIMEOUT_MS)
})

describe('PredictionSettingsSection', () => {
  it('exports PredictionSettingsSection', async () => {
    const mod = await import('../PredictionSettingsSection')
    expect(mod.PredictionSettingsSection).toBeDefined()
  }, IMPORT_TIMEOUT_MS)
})

describe('SettingsBackupSection', () => {
  it('exports SettingsBackupSection', async () => {
    const mod = await import('../SettingsBackupSection')
    expect(mod.SettingsBackupSection).toBeDefined()
  }, IMPORT_TIMEOUT_MS)
})

describe('TokenUsageSection', () => {
  it('exports TokenUsageSection', async () => {
    const mod = await import('../TokenUsageSection')
    expect(mod.TokenUsageSection).toBeDefined()
  }, IMPORT_TIMEOUT_MS)
})

describe('WidgetSettingsSection', () => {
  it('exports WidgetSettingsSection', async () => {
    const mod = await import('../WidgetSettingsSection')
    expect(mod.WidgetSettingsSection).toBeDefined()
  }, IMPORT_TIMEOUT_MS)
})
