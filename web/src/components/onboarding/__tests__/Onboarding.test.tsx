/**
 * Onboarding component smoke tests
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }),
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}))

vi.mock('../../../lib/api', () => ({
  api: { post: vi.fn() },
}))

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({ user: { github_login: 'test' }, isAuthenticated: true }),
}))

/** Timeout for importing heavy modules */
const IMPORT_TIMEOUT_MS = 30000

describe('Onboarding', () => {
  it('exports Onboarding component', async () => {
    const mod = await import('../Onboarding')
    expect(mod.Onboarding).toBeDefined()
  }, IMPORT_TIMEOUT_MS)
})
