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

import { ConfigMapDrillDown } from '../ConfigMapDrillDown'
import { maskKubernetesYamlData } from '../../../../lib/yamlMask'

describe('ConfigMapDrillDown', () => {
  it('renders without crashing', () => {
    const { container } = render(<ConfigMapDrillDown data={{ cluster: 'c1', namespace: 'ns1', configmap: 'cm1' }} />)
    expect(container).toBeTruthy()
  })
})

// #6231: ConfigMapDrillDown shares maskKubernetesYamlData with
// SecretDrillDown for the YAML tab. The full helper test suite lives at
// lib/__tests__/yamlMask.test.ts; the smoke tests below pin the
// ConfigMap-specific behaviors that motivated #6211 + #6231.
describe('ConfigMap YAML masking integration (#6211, #6231)', () => {
  it('masks ConfigMap data values that may contain secrets-in-config', () => {
    // Real ConfigMaps routinely hold connection strings, passwords,
    // TLS certificates etc. The YAML tab must mask these by default.
    const input = [
      'apiVersion: v1',
      'kind: ConfigMap',
      'metadata:',
      '  name: app-config',
      '  namespace: production',
      'data:',
      '  database_url: postgresql://admin:hunter2@db.internal/prod',
      '  redis_url: redis://:supersecret@cache.internal:6379',
      '  log_level: info',
    ].join('\n')

    const masked = maskKubernetesYamlData(input)

    // Sensitive values are masked
    expect(masked).not.toContain('postgresql://admin:hunter2')
    expect(masked).not.toContain('hunter2')
    expect(masked).not.toContain('supersecret')
    // Non-sensitive value (log_level: info) is ALSO masked because we
    // can't distinguish sensitive from non-sensitive at this layer —
    // safer to mask everything in data: and let the user reveal.
    expect(masked).not.toContain('info\n')
    // But all KEY names are preserved so the user can still see what's there
    expect(masked).toContain('database_url')
    expect(masked).toContain('redis_url')
    expect(masked).toContain('log_level')
    // ConfigMap metadata is intact
    expect(masked).toContain('app-config')
    expect(masked).toContain('production')
    expect(masked).toContain('ConfigMap')
  })

  it('correctly masks a ConfigMap with a multi-line block-scalar value', () => {
    // This is the original #6231 bug — ConfigMaps commonly hold
    // multi-line config files (nginx.conf, fluentd.conf, certificates).
    // The previous regex helper would emit malformed YAML for these.
    const input = [
      'apiVersion: v1',
      'kind: ConfigMap',
      'metadata:',
      '  name: nginx-config',
      'data:',
      '  nginx.conf: |',
      '    server {',
      '      listen 80;',
      '      location / {',
      '        proxy_pass http://backend;',
      '      }',
      '    }',
      '  port: "80"',
    ].join('\n')

    const masked = maskKubernetesYamlData(input)

    // None of the nginx config body should leak in any form
    expect(masked).not.toContain('proxy_pass')
    expect(masked).not.toContain('http://backend')
    expect(masked).not.toContain('listen 80')
    // The output must be valid YAML — re-parse to prove no stray
    // continuation lines remained.
    const yamlLib = require('js-yaml')
    expect(() => yamlLib.load(masked)).not.toThrow()
    // Both keys still visible
    expect(masked).toContain('nginx.conf')
    expect(masked).toContain('port')
  })
})
