import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'security.allIssues': 'All Issues',
        'security.highLabel': 'High',
        'security.mediumLabel': 'Medium',
        'security.lowLabel': 'Low',
        'security.filterByType': 'Filter by type',
        'security.noIssuesFound': 'No issues found',
        'security.bestPractices': 'Following best practices',
        'security.privileged': 'Privileged',
        'security.root': 'Root',
        'security.hostNetwork': 'Host Network',
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

import { SecurityIssuesTab } from '../SecurityIssuesTab'
import type { SecurityIssue } from '../../../mocks/securityData'

const baseStats = {
  total: 5,
  high: 2,
  medium: 2,
  low: 1,
  typeCounts: { privileged: 2, root: 2, noSecurityContext: 1 },
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
    severity: 'medium',
    resource: 'metrics-collector',
    namespace: 'monitoring',
    cluster: 'ops',
    message: 'Container runs as root user',
  },
  {
    type: 'noSecurityContext',
    severity: 'low',
    resource: 'web-frontend',
    namespace: 'web',
    cluster: 'staging',
    message: 'No security context defined',
  },
]

describe('SecurityIssuesTab', () => {
  const defaultProps = {
    stats: baseStats,
    filteredIssues: mockIssues,
    severityFilter: 'all',
    setSeverityFilter: vi.fn(),
    selectedIssueType: null,
    setSelectedIssueType: vi.fn(),
  }

  it('renders severity stat cards', () => {
    render(<SecurityIssuesTab {...defaultProps} />)
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('renders all issues', () => {
    render(<SecurityIssuesTab {...defaultProps} />)
    expect(screen.getByText('vllm-engine')).toBeInTheDocument()
    expect(screen.getByText('metrics-collector')).toBeInTheDocument()
    expect(screen.getByText('web-frontend')).toBeInTheDocument()
  })

  it('calls setSeverityFilter when severity button clicked', () => {
    const setSeverityFilter = vi.fn()
    render(<SecurityIssuesTab {...defaultProps} setSeverityFilter={setSeverityFilter} />)
    fireEvent.click(screen.getByText('High'))
    expect(setSeverityFilter).toHaveBeenCalledWith('high')
  })

  it('calls setSelectedIssueType when type filter clicked', () => {
    const setSelectedIssueType = vi.fn()
    render(<SecurityIssuesTab {...defaultProps} setSelectedIssueType={setSelectedIssueType} />)
    const buttons = screen.getAllByRole('button')
    const privilegedBtn = buttons.find(b => b.textContent?.includes('Privileged'))
    if (privilegedBtn) fireEvent.click(privilegedBtn)
    expect(setSelectedIssueType).toHaveBeenCalled()
  })

  it('shows empty state when no issues match type filter', () => {
    render(
      <SecurityIssuesTab
        {...defaultProps}
        filteredIssues={mockIssues}
        selectedIssueType="hostNetwork"
      />
    )
    expect(screen.getByText('No issues found')).toBeInTheDocument()
  })

  it('renders cluster badges for each issue', () => {
    render(<SecurityIssuesTab {...defaultProps} />)
    const badges = screen.getAllByTestId('cluster-badge')
    expect(badges.length).toBe(3)
    expect(badges[0]).toHaveTextContent('prod-a')
  })

  it('displays namespace info for issues', () => {
    render(<SecurityIssuesTab {...defaultProps} />)
    expect(screen.getByText(/default/)).toBeInTheDocument()
    expect(screen.getByText(/monitoring/)).toBeInTheDocument()
  })
})
