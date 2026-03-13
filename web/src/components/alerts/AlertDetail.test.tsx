/// <reference types='@testing-library/jest-dom/vitest' />
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

import '../../test/utils/setupMocks'

vi.mock('../../hooks/useAlerts', () => ({
  useAlerts: () => ({
    acknowledgeAlert: vi.fn(),
    resolveAlert: vi.fn(),
    runAIDiagnosis: vi.fn(),
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

vi.mock('../../lib/ai/runAIDiagnosis', () => ({
  runAIDiagnosis: vi.fn()
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
    expect(screen.getByText('cpu-rule')).toBeInTheDocument()
  })

  it('renders the alert message', () => {
    render(<AlertDetail alert={mockAlert} />)
    expect(screen.getByText('CPU usage exceeds 90%')).toBeInTheDocument()
  })
})
