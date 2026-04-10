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

// #6209: maskSecretYaml replaces values inside `data:` and `stringData:`
// blocks with a placeholder, while preserving keys, surrounding YAML
// structure, and any sibling top-level keys.
describe('maskSecretYaml (#6209)', () => {
  const PLACEHOLDER = '••••••••••••••••'

  it('masks values inside the data: block', () => {
    const yaml = [
      'apiVersion: v1',
      'kind: Secret',
      'metadata:',
      '  name: my-secret',
      'data:',
      '  password: cGFzczEyMw==',
      '  username: dXNlcg==',
      'type: Opaque',
    ].join('\n')
    const masked = maskSecretYaml(yaml)
    expect(masked).not.toContain('cGFzczEyMw==')
    expect(masked).not.toContain('dXNlcg==')
    expect(masked).toContain(`password: ${PLACEHOLDER}`)
    expect(masked).toContain(`username: ${PLACEHOLDER}`)
    // Surrounding YAML preserved
    expect(masked).toContain('apiVersion: v1')
    expect(masked).toContain('kind: Secret')
    expect(masked).toContain('  name: my-secret')
    expect(masked).toContain('type: Opaque')
  })

  it('masks values inside the stringData: block', () => {
    const yaml = [
      'apiVersion: v1',
      'kind: Secret',
      'stringData:',
      '  api-key: super-secret',
      'kind: Secret',
    ].join('\n')
    const masked = maskSecretYaml(yaml)
    expect(masked).not.toContain('super-secret')
    expect(masked).toContain(`api-key: ${PLACEHOLDER}`)
  })

  it('does not mask keys outside the data block', () => {
    const yaml = [
      'metadata:',
      '  name: my-secret',
      '  labels:',
      '    app: web',
      'data:',
      '  password: aGVsbG8=',
    ].join('\n')
    const masked = maskSecretYaml(yaml)
    // metadata.name and metadata.labels.app should be untouched
    expect(masked).toContain('name: my-secret')
    expect(masked).toContain('app: web')
    expect(masked).toContain(`password: ${PLACEHOLDER}`)
  })

  it('handles a secret with no data block (empty/well-formed pass-through)', () => {
    const yaml = [
      'apiVersion: v1',
      'kind: Secret',
      'metadata:',
      '  name: empty',
      'type: Opaque',
    ].join('\n')
    expect(maskSecretYaml(yaml)).toBe(yaml)
  })

  it('returns empty string unchanged', () => {
    expect(maskSecretYaml('')).toBe('')
  })

  it('exits the data block when a sibling top-level key appears', () => {
    const yaml = [
      'data:',
      '  password: secret1',
      '  username: secret2',
      'metadata:',
      '  name: should-not-mask',
      'type: Opaque',
    ].join('\n')
    const masked = maskSecretYaml(yaml)
    expect(masked).toContain(`password: ${PLACEHOLDER}`)
    expect(masked).toContain(`username: ${PLACEHOLDER}`)
    // metadata.name is OUTSIDE the data block — must remain visible
    expect(masked).toContain('name: should-not-mask')
  })
})
