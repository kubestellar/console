/// <reference types='@testing-library/jest-dom/vitest' />
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

import '../../test/utils/setupMocks'

// Issue 9256 — spy on acknowledgeAlert so we can assert what user string
// actually gets recorded.
const acknowledgeAlertSpy = vi.fn()

vi.mock('../../hooks/useAlerts', () => ({
  useAlerts: () => ({
    acknowledgeAlert: acknowledgeAlertSpy,
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

vi.mock('../../lib/auth', () => ({
  useAuth: () => ({ user: { id: 'u1', github_id: 'gh1', github_login: 'test-user', onboarded: true } }),
}))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
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

  // Issue 9256 — acknowledgement must record the authenticated user's
  // github_login, not the placeholder "Current User" the prior code used.
  it('acknowledges with the authenticated user\'s github_login', () => {
    acknowledgeAlertSpy.mockClear()
    render(<AlertDetail alert={mockAlert} />)
    const ackButton = screen.getByText('alerts.acknowledge')
    fireEvent.click(ackButton)
    expect(acknowledgeAlertSpy).toHaveBeenCalledWith('test-alert-1', 'test-user')
  })

  // Issue 9256 — previously the acknowledgement row showed only a relative
  // timestamp. It must now also include who acknowledged the alert so teams
  // can audit responders.
  it('displays acknowledgedBy alongside the acknowledgement timestamp', () => {
    const ackedAlert = {
      ...mockAlert,
      acknowledgedAt: new Date().toISOString(),
      acknowledgedBy: 'alice',
    }
    render(<AlertDetail alert={ackedAlert} />)
    // The i18n mock returns the key itself so the output contains the key plus
    // the interpolated user string.
    expect(screen.getByText(/alerts\.acknowledgedBy/)).toBeInTheDocument()
  })
})
