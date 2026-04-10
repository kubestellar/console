import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

vi.mock('../../../../lib/demoMode', () => ({
  isDemoMode: () => true, getDemoMode: () => true, isNetlifyDeployment: false,
  isDemoModeForced: false, canToggleDemoMode: () => true, setDemoMode: vi.fn(),
  toggleDemoMode: vi.fn(), subscribeDemoMode: () => () => {},
  isDemoToken: () => true, hasRealToken: () => false, setDemoToken: vi.fn(),
  isFeatureEnabled: () => true,
}))

vi.mock('../../../../hooks/useDemoMode', () => ({
  getDemoMode: () => true, default: () => true,
  useDemoMode: () => ({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }),
  hasRealToken: () => false, isDemoModeForced: false, isNetlifyDeployment: false,
  canToggleDemoMode: () => true, isDemoToken: () => true, setDemoToken: vi.fn(),
  setGlobalDemoMode: vi.fn(),
}))

vi.mock('../../../../lib/analytics', () => ({
  emitNavigate: vi.fn(), emitLogin: vi.fn(), emitEvent: vi.fn(), analyticsReady: Promise.resolve(),
  emitAddCardModalOpened: vi.fn(), emitCardExpanded: vi.fn(), emitCardRefreshed: vi.fn(),
}))

vi.mock('../../../../hooks/useTokenUsage', () => ({
  useTokenUsage: () => ({ usage: { total: 0, remaining: 0, used: 0 }, isLoading: false }),
  tokenUsageTracker: { getUsage: () => ({ total: 0, remaining: 0, used: 0 }), trackRequest: vi.fn(), getSettings: () => ({ enabled: false }) },
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }),
  Trans: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock('../../../../hooks/useLocalAgent', () => ({
  useLocalAgent: () => ({ isConnected: false }),
}))

vi.mock('../../../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => ({ drillToNamespace: vi.fn(), drillToCluster: vi.fn() }),
}))

vi.mock('../../../../lib/cn', () => ({
  cn: vi.fn(),
}))

vi.mock('../../../../lib/clipboard', () => ({
  copyToClipboard: vi.fn(),
}))

import { SecretDrillDown, maskSecretYaml } from '../SecretDrillDown'

describe('SecretDrillDown', () => {
  it('renders without crashing', () => {
    const { container } = render(<SecretDrillDown data={{ cluster: 'c1', namespace: 'ns1', secret: 'sec1' }} />)
    expect(container).toBeTruthy()
  })
})

// #6231: the regex-based maskSecretYaml that used to be pinned here was
// replaced by a shared js-yaml-based helper in lib/yamlMask. The full
// behavioral test suite (block scalars, multi-doc, parse-failure
// sentinel, etc.) lives at lib/__tests__/yamlMask.test.ts. The
// re-export from SecretDrillDown is kept for backward compat and is
// smoke-tested below to confirm the alias still resolves.
describe('maskSecretYaml backwards-compat re-export (#6231)', () => {
  it('aliases the shared maskKubernetesYamlData helper', () => {
    const input = [
      'apiVersion: v1',
      'kind: Secret',
      'data:',
      '  password: cGFzczEyMw==',
    ].join('\n')
    const masked = maskSecretYaml(input)
    expect(masked).not.toContain('cGFzczEyMw==')
    expect(masked).toContain('••••••••••••••••')
  })
})
