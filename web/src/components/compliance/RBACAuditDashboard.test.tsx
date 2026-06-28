import React from 'react'
import type { ReactNode, SelectHTMLAttributes } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authFetch } from '../../lib/api'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (_key: string, fallback?: string) => fallback ?? 'Retry' }),
}))
vi.mock('../../lib/api', () => ({ authFetch: vi.fn() }))
vi.mock('../../lib/unified/dashboard/UnifiedDashboard', () => ({
  UnifiedDashboard: () => <div data-testid="unified-dashboard" />,
}))
vi.mock('../shared/TechnicalAcronym', () => ({
  TechnicalAcronym: ({ term, children }: { term: string; children?: ReactNode }) => <span>{children || term}</span>,
}))
vi.mock('../ui/Select', () => ({
  Select: ({ value, onChange, children }: SelectHTMLAttributes<HTMLSelectElement>) => (
    <select value={value} onChange={onChange}>{children}</select>
  ),
}))
vi.mock('../shared/DashboardHeader', () => ({
  DashboardHeader: ({ title, subtitle, afterTitle, rightExtra }: { title: ReactNode; subtitle?: string; afterTitle?: ReactNode; rightExtra?: ReactNode }) => (
    <div>
      <h1>{title}</h1>
      {subtitle ? <p>{subtitle}</p> : null}
      {afterTitle}
      {rightExtra}
    </div>
  ),
}))
vi.mock('../ui/RotatingTip', () => ({ RotatingTip: () => <div data-testid="rotating-tip" /> }))
vi.mock('../dashboard/DashboardHealthIndicator', () => ({
  DashboardHealthIndicator: () => <div data-testid="dashboard-health-indicator" />,
}))

import RBACAuditDashboard from './RBACAuditDashboard'

describe('RBACAuditDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const mockedAuthFetch = vi.mocked(authFetch)
    mockedAuthFetch.mockImplementation((url: string) => {
      if (url.includes('/summary')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            total_bindings: 24,
            cluster_role_bindings: 10,
            role_bindings: 14,
            over_privileged: 2,
            unused_bindings: 3,
            compliance_score: 78,
            evaluated_at: '2026-01-01T00:00:00Z',
          }),
        })
      }

      if (url.includes('/bindings')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            {
              id: 'binding-1',
              name: 'cluster-admin-binding',
              kind: 'ClusterRoleBinding',
              subject_kind: 'User',
              subject_name: 'alice',
              role_name: 'cluster-admin',
              namespace: '',
              cluster: 'prod-east',
              risk_level: 'critical',
              last_used: '2026-01-01T00:00:00Z',
            },
          ]),
        })
      }

      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([
          {
            id: 'finding-1',
            finding_type: 'excessive_permissions',
            severity: 'critical',
            subject: 'alice',
            description: 'User has wildcard access.',
            cluster: 'prod-east',
            namespace: 'kube-system',
            recommendation: 'Scope the role to least privilege.',
          },
        ]),
      })
    })
  })

  it('renders findings, bindings, and unified dashboard with health indicators', async () => {
    const user = userEvent.setup()

    render(<RBACAuditDashboard />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /RBAC.*Audit.*Least-Privilege/ })).toBeInTheDocument()
      expect(screen.getByText('User has wildcard access.')).toBeInTheDocument()
      expect(screen.getByTestId('dashboard-health-indicator')).toBeInTheDocument()
      expect(screen.getByTestId('unified-dashboard')).toBeInTheDocument()
      
      // Verify health status indicator is present (text split across TechnicalAcronym span)
      expect(screen.getByText((_content, element) => {
        return element?.tagName === 'DIV' && element?.textContent === 'RBAC System Status'
      })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Bindings' }))
    expect(screen.getByText('cluster-admin-binding')).toBeInTheDocument()
    expect(screen.getByText('cluster-admin')).toBeInTheDocument()
  })
})
