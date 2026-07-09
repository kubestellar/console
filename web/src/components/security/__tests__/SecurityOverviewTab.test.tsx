import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'security.totalIssues': 'Total Issues',
        'security.roleBindings': 'Role Bindings',
        'security.complianceScore': 'Compliance Score',
        'security.criticalIssues': 'Critical Issues',
        'security.issuesBySeverity': 'Issues by Severity',
        'security.issuesByCategory': 'Issues by Category',
        'security.complianceStatus': 'Compliance Status',
        'security.noComplianceData': 'No compliance data',
        'security.highRiskRBAC': 'High Risk RBAC',
        'security.noCriticalIssues': 'No critical issues',
        'security.noHighRiskBindings': 'No high risk bindings',
        'security.recommendations': 'Security Recommendations',
        'security.recUsePodSecurity': 'Use Pod Security Standards',
        'security.recAvoidPrivileged': 'Avoid privileged containers',
        'security.recRunNonRoot': 'Run containers as non-root',
        'security.recEnableNetPolicies': 'Enable Network Policies',
        'security.privilegedContainers': 'Privileged Containers',
        'security.runAsRoot': 'Run as Root',
        'common.viewAll': 'View All',
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

vi.mock('../../charts/PieChart', () => ({
  DonutChart: ({ data, showLegend }: { data: { name: string; value: number; color: string }[]; showLegend?: boolean }) => (
    <div data-testid="donut-chart" data-legend={showLegend}>
      {data.map((d, i) => (
        <span key={i} data-testid="chart-segment">{d.name}: {d.value}</span>
      ))}
    </div>
  ),
}))

vi.mock('../../charts/StatusIndicator', () => ({
  StatusIndicator: ({ status, size }: { status: string; size?: string }) => (
    <span data-testid="status-indicator" data-status={status} data-size={size}>●</span>
  ),
}))

import { SecurityOverviewTab } from '../SecurityOverviewTab'
import type { SecurityIssue, RBACBinding } from '../../../mocks/securityData'

const baseStats = {
  total: 10,
  high: 4,
  rbacTotal: 8,
  complianceScore: 82,
  severityChartData: [
    { name: 'High', value: 4, color: '#ef4444' },
    { name: 'Medium', value: 5, color: '#f59e0b' },
    { name: 'Low', value: 1, color: '#3b82f6' },
  ],
  typeChartData: [
    { name: 'Privileged', value: 3, color: '#ef4444' },
    { name: 'Root', value: 5, color: '#f59e0b' },
    { name: 'No Security Context', value: 2, color: '#3b82f6' },
  ],
  complianceChartData: [
    { name: 'Pass', value: 15, color: '#10b981' },
    { name: 'Warn', value: 2, color: '#f59e0b' },
    { name: 'Fail', value: 3, color: '#ef4444' },
  ],
}

const mockIssues: SecurityIssue[] = [
  {
    type: 'privileged',
    severity: 'high',
    resource: 'vllm-engine',
    namespace: 'default',
    cluster: 'prod-a',
    message: 'Container runs in privileged mode',
  },
  {
    type: 'root',
    severity: 'high',
    resource: 'api-server',
    namespace: 'default',
    cluster: 'prod-b',
    message: 'Container runs as root',
  },
  {
    type: 'noSecurityContext',
    severity: 'high',
    resource: 'web-frontend',
    namespace: 'web',
    cluster: 'staging',
    message: 'No security context',
  },
]

const mockRBAC: RBACBinding[] = [
  {
    name: 'cluster-admin-binding',
    kind: 'ClusterRole',
    riskLevel: 'high',
    namespace: '',
    cluster: 'prod-a',
    subjects: [{ kind: 'User', name: 'admin', namespace: '' }],
    permissions: ['*'],
  },
  {
    name: 'developer-binding',
    kind: 'Role',
    riskLevel: 'high',
    namespace: 'default',
    cluster: 'prod-b',
    subjects: [{ kind: 'ServiceAccount', name: 'dev-sa', namespace: 'default' }],
    permissions: ['get', 'list', 'watch', 'create', 'update', 'delete'],
  },
]

describe('SecurityOverviewTab', () => {
  const defaultProps = {
    stats: baseStats,
    globalFilteredIssues: mockIssues,
    filteredRBAC: mockRBAC,
    setActiveTab: vi.fn(),
    setSeverityFilter: vi.fn(),
  }

  it('renders quick stat cards with correct values', () => {
    render(<SecurityOverviewTab {...defaultProps} />)
    expect(screen.getByText('10')).toBeInTheDocument()
    expect(screen.getByText('8')).toBeInTheDocument()
    expect(screen.getByText('82%')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
  })

  it('renders chart titles', () => {
    render(<SecurityOverviewTab {...defaultProps} />)
    expect(screen.getByText('Issues by Severity')).toBeInTheDocument()
    expect(screen.getByText('Issues by Category')).toBeInTheDocument()
    expect(screen.getByText('Compliance Status')).toBeInTheDocument()
  })

  it('renders donut charts with data', () => {
    render(<SecurityOverviewTab {...defaultProps} />)
    const charts = screen.getAllByTestId('donut-chart')
    expect(charts.length).toBe(3)
    expect(screen.getByText('High: 4')).toBeInTheDocument()
    expect(screen.getByText('Privileged: 3')).toBeInTheDocument()
    expect(screen.getByText('Pass: 15')).toBeInTheDocument()
  })

  it('calls setActiveTab and setSeverityFilter when total issues card clicked', () => {
    const setActiveTab = vi.fn()
    const setSeverityFilter = vi.fn()
    render(<SecurityOverviewTab {...defaultProps} setActiveTab={setActiveTab} setSeverityFilter={setSeverityFilter} />)
    const buttons = screen.getAllByRole('button')
    const totalIssuesBtn = buttons.find(b => b.textContent?.includes('10'))
    if (totalIssuesBtn) fireEvent.click(totalIssuesBtn)
    expect(setActiveTab).toHaveBeenCalledWith('issues')
    expect(setSeverityFilter).toHaveBeenCalledWith('all')
  })

  it('calls setActiveTab when RBAC card clicked', () => {
    const setActiveTab = vi.fn()
    render(<SecurityOverviewTab {...defaultProps} setActiveTab={setActiveTab} />)
    const buttons = screen.getAllByRole('button')
    const rbacBtn = buttons.find(b => b.textContent?.includes('8'))
    if (rbacBtn) fireEvent.click(rbacBtn)
    expect(setActiveTab).toHaveBeenCalledWith('rbac')
  })

  it('calls setActiveTab when compliance card clicked', () => {
    const setActiveTab = vi.fn()
    render(<SecurityOverviewTab {...defaultProps} setActiveTab={setActiveTab} />)
    const buttons = screen.getAllByRole('button')
    const complianceBtn = buttons.find(b => b.textContent?.includes('82%'))
    if (complianceBtn) fireEvent.click(complianceBtn)
    expect(setActiveTab).toHaveBeenCalledWith('compliance')
  })

  it('calls setActiveTab and setSeverityFilter when critical issues card clicked', () => {
    const setActiveTab = vi.fn()
    const setSeverityFilter = vi.fn()
    render(<SecurityOverviewTab {...defaultProps} setActiveTab={setActiveTab} setSeverityFilter={setSeverityFilter} />)
    const buttons = screen.getAllByRole('button')
    const criticalBtn = buttons.find(b => b.textContent?.includes('4') && b.textContent?.includes('Critical'))
    if (criticalBtn) fireEvent.click(criticalBtn)
    expect(setActiveTab).toHaveBeenCalledWith('issues')
    expect(setSeverityFilter).toHaveBeenCalledWith('high')
  })

  it('renders critical issues list', () => {
    render(<SecurityOverviewTab {...defaultProps} />)
    expect(screen.getByText('vllm-engine')).toBeInTheDocument()
    expect(screen.getByText('api-server')).toBeInTheDocument()
    expect(screen.getByText('web-frontend')).toBeInTheDocument()
  })

  it('displays "View All" links for critical issues and RBAC', () => {
    render(<SecurityOverviewTab {...defaultProps} />)
    const viewAllLinks = screen.getAllByText('View All')
    expect(viewAllLinks.length).toBeGreaterThanOrEqual(2)
  })

  it('renders cluster badges for critical issues', () => {
    render(<SecurityOverviewTab {...defaultProps} />)
    const badges = screen.getAllByTestId('cluster-badge')
    expect(badges.length).toBeGreaterThan(0)
  })

  it('renders high risk RBAC bindings', () => {
    render(<SecurityOverviewTab {...defaultProps} />)
    expect(screen.getByText('cluster-admin-binding')).toBeInTheDocument()
    expect(screen.getByText('developer-binding')).toBeInTheDocument()
  })

  it('shows empty state when no critical issues', () => {
    render(<SecurityOverviewTab {...defaultProps} globalFilteredIssues={[]} />)
    expect(screen.getByText('No critical issues')).toBeInTheDocument()
  })

  it('shows empty state when no high risk RBAC bindings', () => {
    render(<SecurityOverviewTab {...defaultProps} filteredRBAC={[]} />)
    expect(screen.getByText('No high risk bindings')).toBeInTheDocument()
  })

  it('renders security recommendations section', () => {
    render(<SecurityOverviewTab {...defaultProps} />)
    expect(screen.getByText('Security Recommendations')).toBeInTheDocument()
    expect(screen.getByText('Use Pod Security Standards')).toBeInTheDocument()
    expect(screen.getByText('Avoid privileged containers')).toBeInTheDocument()
    expect(screen.getByText('Run containers as non-root')).toBeInTheDocument()
    expect(screen.getByText('Enable Network Policies')).toBeInTheDocument()
  })

  it('renders status indicators in recommendations', () => {
    render(<SecurityOverviewTab {...defaultProps} />)
    const indicators = screen.getAllByTestId('status-indicator')
    expect(indicators.length).toBe(4)
    indicators.forEach(indicator => {
      expect(indicator.getAttribute('data-status')).toBe('healthy')
      expect(indicator.getAttribute('data-size')).toBe('sm')
    })
  })

  it('shows empty state icon for severity chart when no data', () => {
    render(
      <SecurityOverviewTab
        {...defaultProps}
        stats={{ ...baseStats, severityChartData: [] }}
      />
    )
    expect(screen.getByText('Issues by Severity')).toBeInTheDocument()
  })

  it('shows empty state text for compliance chart when no data', () => {
    render(
      <SecurityOverviewTab
        {...defaultProps}
        stats={{ ...baseStats, complianceChartData: [] }}
      />
    )
    expect(screen.getByText('No compliance data')).toBeInTheDocument()
  })

  it('applies green color class for high compliance score', () => {
    const { container } = render(<SecurityOverviewTab {...defaultProps} />)
    const scoreCard = container.querySelector('[class*="bg-green"]')
    expect(scoreCard).toBeTruthy()
  })

  it('applies yellow color class for medium compliance score', () => {
    const { container } = render(
      <SecurityOverviewTab
        {...defaultProps}
        stats={{ ...baseStats, complianceScore: 65 }}
      />
    )
    const scoreCard = container.querySelector('[class*="bg-yellow"]')
    expect(scoreCard).toBeTruthy()
  })

  it('applies red color class for low compliance score', () => {
    const { container } = render(
      <SecurityOverviewTab
        {...defaultProps}
        stats={{ ...baseStats, complianceScore: 40 }}
      />
    )
    const scoreCard = container.querySelector('[class*="bg-red"]')
    expect(scoreCard).toBeTruthy()
  })

  it('calls setActiveTab and setSeverityFilter when "View All" clicked in critical issues', () => {
    const setActiveTab = vi.fn()
    const setSeverityFilter = vi.fn()
    render(<SecurityOverviewTab {...defaultProps} setActiveTab={setActiveTab} setSeverityFilter={setSeverityFilter} />)
    const viewAllButtons = screen.getAllByText('View All')
    fireEvent.click(viewAllButtons[0])
    expect(setActiveTab).toHaveBeenCalledWith('issues')
    expect(setSeverityFilter).toHaveBeenCalledWith('high')
  })

  it('calls setActiveTab when "View All" clicked in high risk RBAC', () => {
    const setActiveTab = vi.fn()
    render(<SecurityOverviewTab {...defaultProps} setActiveTab={setActiveTab} />)
    const viewAllButtons = screen.getAllByText('View All')
    if (viewAllButtons.length > 1) {
      fireEvent.click(viewAllButtons[1])
      expect(setActiveTab).toHaveBeenCalledWith('rbac')
    }
  })

  it('limits critical issues display to 3 items', () => {
    const manyIssues: SecurityIssue[] = Array.from({ length: 10 }, (_, i) => ({
      type: 'privileged',
      severity: 'high',
      resource: `issue-${i}`,
      namespace: 'default',
      cluster: 'prod',
      message: `Issue ${i}`,
    }))
    render(<SecurityOverviewTab {...defaultProps} globalFilteredIssues={manyIssues} />)
    expect(screen.getByText('issue-0')).toBeInTheDocument()
    expect(screen.getByText('issue-1')).toBeInTheDocument()
    expect(screen.getByText('issue-2')).toBeInTheDocument()
    expect(screen.queryByText('issue-3')).not.toBeInTheDocument()
  })

  it('limits high risk RBAC display to 3 items', () => {
    const manyBindings: RBACBinding[] = Array.from({ length: 10 }, (_, i) => ({
      name: `binding-${i}`,
      kind: 'ClusterRole',
      riskLevel: 'high',
      namespace: '',
      cluster: 'prod',
      subjects: [{ kind: 'User', name: `user-${i}`, namespace: '' }],
      permissions: ['*'],
    }))
    render(<SecurityOverviewTab {...defaultProps} filteredRBAC={manyBindings} />)
    expect(screen.getByText('binding-0')).toBeInTheDocument()
    expect(screen.getByText('binding-1')).toBeInTheDocument()
    expect(screen.getByText('binding-2')).toBeInTheDocument()
    expect(screen.queryByText('binding-3')).not.toBeInTheDocument()
  })
})
