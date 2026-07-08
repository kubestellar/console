import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'security.totalBindings': 'Total Bindings',
        'security.highRisk': 'High Risk',
        'security.mediumRisk': 'Medium Risk',
        'security.lowRisk': 'Low Risk',
        'security.risk': 'risk',
        'security.subjects': 'Subjects',
      }
      return map[key] ?? key
    },
  }),
}))

vi.mock('../../ui/ClusterBadge', () => ({
  ClusterBadge: ({ cluster }: { cluster: string }) => (
    <span data-testid="cluster-badge">{cluster}</span>
  ),
}))

import { SecurityRBACTab } from '../SecurityRBACTab'
import type { RBACBinding } from '../../../mocks/securityData'

const baseStats = {
  rbacTotal: 10,
  rbacHighRisk: 3,
  rbacMedRisk: 5,
  rbacLowRisk: 2,
}

const mockBindings: RBACBinding[] = [
  {
    name: 'cluster-admin-binding',
    kind: 'ClusterRole',
    subjects: [{ kind: 'User', name: 'admin-user' }],
    cluster: 'prod',
    permissions: ['*'],
    riskLevel: 'high',
  },
  {
    name: 'readonly-role',
    kind: 'Role',
    subjects: [{ kind: 'ServiceAccount', name: 'monitor-sa' }],
    cluster: 'staging',
    namespace: 'monitoring',
    permissions: ['get', 'list', 'watch'],
    riskLevel: 'low',
  },
  {
    name: 'deploy-role',
    kind: 'ClusterRole',
    subjects: [
      { kind: 'Group', name: 'developers' },
      { kind: 'User', name: 'deployer' },
    ],
    cluster: 'prod',
    permissions: ['get', 'list', 'create', 'update', 'delete', 'patch'],
    riskLevel: 'medium',
  },
]

describe('SecurityRBACTab', () => {
  it('renders RBAC stat cards', () => {
    render(<SecurityRBACTab stats={baseStats} filteredRBAC={mockBindings} />)
    expect(screen.getByText('10')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('renders binding names', () => {
    render(<SecurityRBACTab stats={baseStats} filteredRBAC={mockBindings} />)
    expect(screen.getByText('cluster-admin-binding')).toBeInTheDocument()
    expect(screen.getByText('readonly-role')).toBeInTheDocument()
    expect(screen.getByText('deploy-role')).toBeInTheDocument()
  })

  it('renders subject names', () => {
    render(<SecurityRBACTab stats={baseStats} filteredRBAC={mockBindings} />)
    expect(screen.getByText('admin-user')).toBeInTheDocument()
    expect(screen.getByText('monitor-sa')).toBeInTheDocument()
    expect(screen.getByText('developers')).toBeInTheDocument()
  })

  it('renders cluster badges', () => {
    render(<SecurityRBACTab stats={baseStats} filteredRBAC={mockBindings} />)
    const badges = screen.getAllByTestId('cluster-badge')
    expect(badges.length).toBe(3)
  })

  it('displays namespace when present', () => {
    render(<SecurityRBACTab stats={baseStats} filteredRBAC={mockBindings} />)
    expect(screen.getByText(/monitoring/)).toBeInTheDocument()
  })

  it('truncates permissions beyond 5 and shows +N more', () => {
    render(<SecurityRBACTab stats={baseStats} filteredRBAC={mockBindings} />)
    expect(screen.getByText(/\+1/)).toBeInTheDocument()
  })

  it('shows risk level badges', () => {
    render(<SecurityRBACTab stats={baseStats} filteredRBAC={mockBindings} />)
    expect(screen.getByText(/high risk/)).toBeInTheDocument()
    expect(screen.getByText(/low risk/)).toBeInTheDocument()
    expect(screen.getByText(/medium risk/)).toBeInTheDocument()
  })

  it('renders kind badges for bindings', () => {
    render(<SecurityRBACTab stats={baseStats} filteredRBAC={mockBindings} />)
    expect(screen.getAllByText('ClusterRole').length).toBe(2)
    expect(screen.getByText('Role')).toBeInTheDocument()
  })
})
