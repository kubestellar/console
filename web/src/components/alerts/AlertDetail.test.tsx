import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('../../lib/demoMode', () => ({
  isDemoMode: () => true, getDemoMode: () => true, isNetlifyDeployment: false,
  isDemoModeForced: false, canToggleDemoMode: () => true, setDemoMode: vi.fn(),
  toggleDemoMode: vi.fn(), subscribeDemoMode: () => () => { },
  isDemoToken: () => true, hasRealToken: () => false, setDemoToken: vi.fn(),
}))
vi.mock('../../hooks/useDemoMode', () => ({
  getDemoMode: () => true, default: () => true, useDemoMode: () => true, isDemoModeForced: false,
}))
vi.mock('../../lib/analytics', () => ({
  emitNavigate: vi.fn(), emitLogin: vi.fn(), emitEvent: vi.fn(), analyticsReady: Promise.resolve(),
}))
vi.mock('../../hooks/useTokenUsage', () => ({
  useTokenUsage: () => ({ usage: { total: 0, remaining: 0, used: 0 }, isLoading: false }),
  tokenUsageTracker: { getUsage: () => ({ total: 0, remaining: 0, used: 0 }), trackRequest: vi.fn(), getSettings: () => ({ enabled: false }) },
}))

vi.mock('../../hooks/useAlerts', () => ({
  useAlerts: () => ({
    acknowledgeAlert: vi.fn(),
    resolveAlert: vi.fn(),
  }),
  useSlackWebhooks: () => ({ webhooks: [] }),
  useSlackNotification: () => ({ sendNotification: vi.fn() }),
}))

vi.mock('../../hooks/useMissions', () => ({
  useMissions: () => ({ missions: [], setActiveMission: vi.fn(), openSidebar: vi.fn() }),
}))

vi.mock('../ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}))

import { AlertDetail } from './AlertDetail'

const mockAlert = {
  id: 'test-alert-1',
  name: 'High CPU Usage',
  severity: 'critical' as const,
  status: 'firing' as const,
  message: 'CPU usage exceeds 90%',
  cluster: 'prod-cluster',
  namespace: 'default',
  resource: 'pod/web-server',
  firstSeen: new Date().toISOString(),
  lastSeen: new Date().toISOString(),
  count: 3,
  ruleId: 'rule-1',
  ruleName: 'cpu-rule',
  labels: {},
  details: { cpu: 'threshold exceeded' },
  firedAt: new Date().toISOString(),
}

describe('AlertDetail Component', () => {
  it('renders without crashing', () => {
    expect(() =>
      render(<AlertDetail alert={mockAlert} />)
    ).not.toThrow()
  })

  it('renders the alert rule name', () => {
    render(<AlertDetail alert={mockAlert} />)
    expect(screen.getByText('cpu-rule')).toBeTruthy()
  })

  it('renders the alert message', () => {
    render(<AlertDetail alert={mockAlert} />)
    expect(screen.getByText('CPU usage exceeds 90%')).toBeTruthy()
  })
})
