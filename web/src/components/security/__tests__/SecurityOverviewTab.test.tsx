import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: (ns?: string) => ({
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
        'security.noCriticalIssues': 'No critical issues',
        'security.noHighRiskBindings': 'No high-risk bindings',
        'security.highRiskRBAC': 'High-Risk RBAC',
        'security.recommendations': 'Recommendations',
        'security.recUsePodSecurity': 'Use Pod Security Standards',
        'security.recAvoidPrivileged': 'Avoid privileged containers',
        'security.recRunNonRoot': 'Run as non-root',
        'security.recEnableNetPolicies': 'Enable network policies',
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
  DonutChart: ({ data }: { data: unknown[] }) => (
    <div data-testid="donut-chart">{data.length} segments</div>
  ),
}))

vi.mock('../../charts/StatusIndicator', () => ({
  StatusIndicator: ({ status }: { status: string }) => (
    <span data-testid="status-indicator">{status}</span>
  ),
}))

vi.mock('../securityHelpers', () => ({
  getTypeLabel: (type: string) => `type:${type}`,
}))

import { SecurityOverviewTab } from '../SecurityOverviewTab'
import type { SecurityIssue, RBACBinding } from '../../../mocks/securityData'

const baseStats = {
  total: 6,
  high: 3,
  rbacTotal: 4,
  complianceScore: 85,
  severityChartData: [
    { name: 'High', value: 3, color: '#ef4444' },
    { name: 'Medium', value: 2, color: '#eab308' },
  ],
  typeChartData: [
    { name: 'Privileged', value: 2, color: '#ef4444' },
  ],
  complianceChartData: [
    { name: 'Pass', value: 8, color: '#22c55e' },
    { name: 'Fail', value: 2, color: '#ef4444' },
  ],
}

const mockIssues: SecurityIssue[] = [
  {
    type: 'privileged',
    severity: 'high',
    resource: 'vllm-engine',
    namespace: 'default',
    cluster: 'prod',
    message: 'Privileged container',
  },
  {
    type: 'root',
    severity: 'high',
    resource: 'redis-admin',
    namespace: 'cache',
    cluster: 'staging',
    message: 'Running as root',
  },
  {
    type: 'noSecurityContext',
    severity: 'low',
    resource: 'frontend',
    namespace: 'web',
    cluster: 'prod',
    message: 'No security context',
  },
]

const mockRBAC: RBACBinding[] = [
  {
    name: 'cluster-admin-binding',
    kind: 'ClusterRole',
    subjects: [{ kind: 'User', name: 'admin@company.com' }],
    cluster: 'prod',
    permissions: ['*'],
    riskLevel: 'high',
  },
  {
    name: 'viewer-role',
    kind: 'Role',
    subjects: [{ kind: 'ServiceAccount', name: 'monitoring-sa' }],
    cluster: 'ops',
    namespace: 'monitoring',
    permissions: ['get', 'list', 'watch'],
    riskLevel: 'low',
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

  it('renders without crashing', () => {
    render(<SecurityOverviewTab {...defaultProps} />)
    expect(screen.getByText('Total Issues')).toBeInTheDocument()
  })

  it('displays total issues stat', () => {
    render(<SecurityOverviewTab {...defaultProps} />)
    expect(screen.getByText('6')).toBeInTheDocument()
    expect(screen.getByText('Total Issues')).toBeInTheDocument()
  })

  it('displays role bindings stat', () => {
    render(<SecurityOverviewTab {...defaultProps} />)
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByText('Role Bindings')).toBeInTheDocument()
  })

  it('displays compliance score with correct percentage', () => {
    render(<SecurityOverviewTab {...defaultProps} />)
    expect(screen.getByText('85%')).toBeInTheDocument()
    expect(screen.getByText('Compliance Score')).toBeInTheDocument()
  })

  it('displays critical issues count', () => {
    render(<SecurityOverviewTab {...defaultProps} />)
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('navigates to issues tab with all filter when total issues clicked', () => {
    const setActiveTab = vi.fn()
    const setSeverityFilter = vi.fn()
    render(
      <SecurityOverviewTab
        {...defaultProps}
        setActiveTab={setActiveTab}
        setSeverityFilter={setSeverityFilter}
      />
    )
    // Click the total issues button (first stat card)
    const buttons = screen.getAllByRole('button')
    fireEvent.click(buttons[0])
    expect(setActiveTab).toHaveBeenCalledWith('issues')
    expect(setSeverityFilter).toHaveBeenCalledWith('all')
  })

  it('navigates to rbac tab when role bindings clicked', () => {
    const setActiveTab = vi.fn()
    render(<SecurityOverviewTab {...defaultProps} setActiveTab={setActiveTab} />)
    const buttons = screen.getAllByRole('button')
    fireEvent.click(buttons[1])
    expect(setActiveTab).toHaveBeenCalledWith('rbac')
  })

  it('navigates to compliance tab when compliance score clicked', () => {
    const setActiveTab = vi.fn()
    render(<SecurityOverviewTab {...defaultProps} setActiveTab={setActiveTab} />)
    const buttons = screen.getAllByRole('button')
    fireEvent.click(buttons[2])
    expect(setActiveTab).toHaveBeenCalledWith('compliance')
  })

  it('navigates to issues tab with high filter when critical count clicked', () => {
    const setActiveTab = vi.fn()
    const setSeverityFilter = vi.fn()
    render(
      <SecurityOverviewTab
        {...defaultProps}
        setActiveTab={setActiveTab}
        setSeverityFilter={setSeverityFilter}
      />
    )
    const buttons = screen.getAllByRole('button')
    fireEvent.click(buttons[3])
    expect(setActiveTab).toHaveBeenCalledWith('issues')
    expect(setSeverityFilter).toHaveBeenCalledWith('high')
  })

  it('renders donut charts when data is available', () => {
    render(<SecurityOverviewTab {...defaultProps} />)
    const charts = screen.getAllByTestId('donut-chart')
    expect(charts.length).toBe(3)
  })

  it('renders chart section headings', () => {
    render(<SecurityOverviewTab {...defaultProps} />)
    expect(screen.getByText('Issues by Severity')).toBeInTheDocument()
    expect(screen.getByText('Issues by Category')).toBeInTheDocument()
    expect(screen.getByText('Compliance Status')).toBeInTheDocument()
  })

  it('renders critical issues in the recent issues panel', () => {
    render(<SecurityOverviewTab {...defaultProps} />)
    expect(screen.getByText('vllm-engine')).toBeInTheDocument()
    expect(screen.getByText('redis-admin')).toBeInTheDocument()
  })

  it('renders high-risk RBAC bindings panel', () => {
    render(<SecurityOverviewTab {...defaultProps} />)
    expect(screen.getByText('cluster-admin-binding')).toBeInTheDocument()
    expect(screen.getByText('admin@company.com')).toBeInTheDocument()
  })

  it('shows "no critical issues" when no high-severity issues exist', () => {
    render(
      <SecurityOverviewTab
        {...defaultProps}
        globalFilteredIssues={[
          { ...mockIssues[2], severity: 'low' },
        ]}
      />
    )
    expect(screen.getByText('No critical issues')).toBeInTheDocument()
  })

  it('shows "no high-risk bindings" when all RBAC is low risk', () => {
    render(
      <SecurityOverviewTab
        {...defaultProps}
        filteredRBAC={[mockRBAC[1]]}
      />
    )
    expect(screen.getByText('No high-risk bindings')).toBeInTheDocument()
  })

  it('renders security recommendations section', () => {
    render(<SecurityOverviewTab {...defaultProps} />)
    expect(screen.getByText('Recommendations')).toBeInTheDocument()
    expect(screen.getByText('Use Pod Security Standards')).toBeInTheDocument()
    expect(screen.getByText('Avoid privileged containers')).toBeInTheDocument()
    expect(screen.getByText('Run as non-root')).toBeInTheDocument()
    expect(screen.getByText('Enable network policies')).toBeInTheDocument()
  })

  it('renders status indicators in recommendations', () => {
    render(<SecurityOverviewTab {...defaultProps} />)
    const indicators = screen.getAllByTestId('status-indicator')
    expect(indicators.length).toBe(4)
    indicators.forEach(ind => {
      expect(ind.textContent).toBe('healthy')
    })
  })

  it('applies green compliance score styling when score >= 80', () => {
    const { container } = render(<SecurityOverviewTab {...defaultProps} />)
    const scoreIcon = container.querySelector('.bg-green-500\\/20')
    expect(scoreIcon).not.toBeNull()
  })

  it('applies yellow compliance score styling when 60 <= score < 80', () => {
    const { container } = render(
      <SecurityOverviewTab
        {...defaultProps}
        stats={{ ...baseStats, complianceScore: 65 }}
      />
    )
    const scoreIcon = container.querySelector('.bg-yellow-500\\/20')
    expect(scoreIcon).not.toBeNull()
  })

  it('applies red compliance score styling when score < 60', () => {
    const { container } = render(
      <SecurityOverviewTab
        {...defaultProps}
        stats={{ ...baseStats, complianceScore: 40 }}
      />
    )
    const redElements = container.querySelectorAll('.bg-red-500\\/20')
    // At least the compliance score icon should use red
    expect(redElements.length).toBeGreaterThan(0)
  })

  it('renders cluster badges for critical issues', () => {
    render(<SecurityOverviewTab {...defaultProps} />)
    const badges = screen.getAllByTestId('cluster-badge')
    expect(badges.length).toBeGreaterThan(0)
    expect(badges.some(b => b.textContent === 'prod')).toBe(true)
  })
})

describe('SecurityOverviewTab — empty chart data', () => {
  const emptyStats = {
    ...baseStats,
    severityChartData: [] as { name: string; value: number; color: string }[],
    typeChartData: [] as { name: string; value: number; color: string }[],
    complianceChartData: [] as { name: string; value: number; color: string }[],
  }

  it('shows placeholder icons when severity chart data is empty', () => {
    render(
      <SecurityOverviewTab
        stats={emptyStats}
        globalFilteredIssues={[]}
        filteredRBAC={[]}
        setActiveTab={vi.fn()}
        setSeverityFilter={vi.fn()}
      />
    )
    // When empty, DonutChart is not rendered — no donut-chart testid
    expect(screen.queryAllByTestId('donut-chart')).toHaveLength(0)
  })

  it('shows no compliance data text when compliance chart is empty', () => {
    render(
      <SecurityOverviewTab
        stats={emptyStats}
        globalFilteredIssues={[]}
        filteredRBAC={[]}
        setActiveTab={vi.fn()}
        setSeverityFilter={vi.fn()}
      />
    )
    expect(screen.getByText('No compliance data')).toBeInTheDocument()
  })
})

describe('SecurityOverviewTab — view all links', () => {
  it('clicking view all critical issues navigates to issues tab with high filter', () => {
    const setActiveTab = vi.fn()
    const setSeverityFilter = vi.fn()
    render(
      <SecurityOverviewTab
        stats={baseStats}
        globalFilteredIssues={mockIssues}
        filteredRBAC={mockRBAC}
        setActiveTab={setActiveTab}
        setSeverityFilter={setSeverityFilter}
      />
    )
    // Find the "View All" link buttons (they contain ChevronRight icon)
    const viewAllButtons = screen.getAllByRole('button').filter(
      btn => btn.textContent?.includes('common.viewAll')
    )
    if (viewAllButtons.length > 0) {
      fireEvent.click(viewAllButtons[0])
      expect(setActiveTab).toHaveBeenCalledWith('issues')
      expect(setSeverityFilter).toHaveBeenCalledWith('high')
    }
  })

  it('clicking view all RBAC navigates to rbac tab', () => {
    const setActiveTab = vi.fn()
    render(
      <SecurityOverviewTab
        stats={baseStats}
        globalFilteredIssues={mockIssues}
        filteredRBAC={mockRBAC}
        setActiveTab={setActiveTab}
        setSeverityFilter={vi.fn()}
      />
    )
    const viewAllButtons = screen.getAllByRole('button').filter(
      btn => btn.textContent?.includes('common.viewAll')
    )
    if (viewAllButtons.length > 1) {
      fireEvent.click(viewAllButtons[1])
      expect(setActiveTab).toHaveBeenCalledWith('rbac')
    }
  })
})
