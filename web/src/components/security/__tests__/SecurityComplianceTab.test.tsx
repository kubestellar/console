import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'security.overallCompliance': 'Overall Compliance',
        'security.passed': 'passed',
        'security.failing': 'failing',
        'security.warnings': 'warnings',
        'security.passing': 'passing',
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

import { SecurityComplianceTab } from '../SecurityComplianceTab'
import type { ComplianceCheck } from '../../../mocks/securityData'

const baseStats = {
  complianceScore: 85,
  compliancePassed: 12,
  complianceFailed: 2,
  complianceWarnings: 1,
}

const mockComplianceByCategory: Record<string, ComplianceCheck[]> = {
  'Network Security': [
    {
      id: 'ns-1',
      name: 'Network policies enforced',
      category: 'Network Security',
      status: 'pass',
      description: 'All namespaces have network policies',
      cluster: 'prod',
    },
    {
      id: 'ns-2',
      name: 'Egress rules configured',
      category: 'Network Security',
      status: 'fail',
      description: 'Missing egress rules in staging namespace',
      cluster: 'staging',
    },
  ],
  'Pod Security': [
    {
      id: 'ps-1',
      name: 'Pod security standards',
      category: 'Pod Security',
      status: 'warn',
      description: 'Some pods run without restricted PSS',
      cluster: 'prod',
    },
  ],
}

describe('SecurityComplianceTab', () => {
  const defaultProps = {
    stats: baseStats,
    complianceByCategory: mockComplianceByCategory,
    handleRefresh: vi.fn(),
  }

  it('renders compliance score', () => {
    render(<SecurityComplianceTab {...defaultProps} />)
    expect(screen.getByText('85%')).toBeInTheDocument()
  })

  it('renders passed/failed/warnings counts', () => {
    render(<SecurityComplianceTab {...defaultProps} />)
    expect(screen.getByText(/12 passed/)).toBeInTheDocument()
    expect(screen.getByText(/2 failing/)).toBeInTheDocument()
    expect(screen.getByText(/1 warnings/)).toBeInTheDocument()
  })

  it('renders compliance categories', () => {
    render(<SecurityComplianceTab {...defaultProps} />)
    expect(screen.getByText('Network Security')).toBeInTheDocument()
    expect(screen.getByText('Pod Security')).toBeInTheDocument()
  })

  it('renders check names and descriptions', () => {
    render(<SecurityComplianceTab {...defaultProps} />)
    expect(screen.getByText('Network policies enforced')).toBeInTheDocument()
    expect(screen.getByText('Missing egress rules in staging namespace')).toBeInTheDocument()
  })

  it('shows passing ratio per category', () => {
    render(<SecurityComplianceTab {...defaultProps} />)
    expect(screen.getByText('(1/2 passing)')).toBeInTheDocument()
    expect(screen.getByText('(0/1 passing)')).toBeInTheDocument()
  })

  it('calls handleRefresh when refresh button clicked', () => {
    const handleRefresh = vi.fn()
    render(<SecurityComplianceTab {...defaultProps} handleRefresh={handleRefresh} />)
    fireEvent.click(screen.getByRole('button', { name: /refresh/i }))
    expect(handleRefresh).toHaveBeenCalledOnce()
  })

  it('renders cluster badges in checks', () => {
    render(<SecurityComplianceTab {...defaultProps} />)
    const badges = screen.getAllByTestId('cluster-badge')
    expect(badges.length).toBe(3)
  })

  it('applies green color class for high compliance score', () => {
    render(<SecurityComplianceTab {...defaultProps} />)
    const scoreEl = screen.getByText('85%')
    expect(scoreEl.className).toContain('text-green')
  })

  it('applies yellow color class for medium compliance score', () => {
    render(
      <SecurityComplianceTab
        {...defaultProps}
        stats={{ ...baseStats, complianceScore: 65 }}
      />
    )
    expect(screen.getByText('65%').className).toContain('text-yellow')
  })

  it('applies red color class for low compliance score', () => {
    render(
      <SecurityComplianceTab
        {...defaultProps}
        stats={{ ...baseStats, complianceScore: 40 }}
      />
    )
    expect(screen.getByText('40%').className).toContain('text-red')
  })
})
