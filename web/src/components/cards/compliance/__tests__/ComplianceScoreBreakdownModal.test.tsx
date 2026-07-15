import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ComplianceScoreBreakdownModal } from '../ComplianceScoreBreakdownModal'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../../../lib/modals/BaseModal', () => {
  const Header = ({ title, extra }: { title: string; extra?: ReactNode }) => (
    <div data-testid="modal-header">
      <span>{title}</span>
      {extra}
    </div>
  )
  const Tabs = ({
    tabs,
    activeTab,
    onTabChange,
  }: {
    tabs: Array<{ id: string; label: string; badge?: string }>
    activeTab: string
    onTabChange: (id: string) => void
  }) => (
    <div data-testid="modal-tabs">
      {tabs.map((tab) => (
        <button key={tab.id} onClick={() => onTabChange(tab.id)} data-active={activeTab === tab.id}>
          {tab.label}
          {tab.badge && <span data-testid={`badge-${tab.id}`}>{tab.badge}</span>}
        </button>
      ))}
    </div>
  )
  const Content = ({ children }: { children: ReactNode }) => (
    <div data-testid="modal-content">{children}</div>
  )
  const Footer = () => <div data-testid="modal-footer" />

  const BaseModal = ({ isOpen, children }: { isOpen: boolean; onClose: () => void; children: ReactNode }) =>
    isOpen ? <div data-testid="base-modal">{children}</div> : null

  BaseModal.Header = Header
  BaseModal.Tabs = Tabs
  BaseModal.Content = Content
  BaseModal.Footer = Footer

  return { BaseModal }
})

vi.mock('../../../ui/StatusBadge', () => ({
  StatusBadge: ({ children }: { children: ReactNode }) => (
    <span data-testid="status-badge">{children}</span>
  ),
}))

vi.mock('../../../../lib/constants/compliance', () => ({
  getScoreContext: vi.fn((score: number) => ({
    label: score >= 80 ? 'Good' : score >= 60 ? 'Fair' : 'Poor',
    color: score >= 80 ? 'text-green-400' : score >= 60 ? 'text-yellow-400' : 'text-red-400',
    description: score >= 80 ? 'Strong posture' : score >= 60 ? 'Moderate posture' : 'Weak posture',
  })),
}))

vi.mock('../../../../lib/analytics', () => ({
  emitModalOpened: vi.fn(),
  emitModalClosed: vi.fn(),
  emitModalTabViewed: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  score: 75,
  breakdown: [{ name: 'Kubescape', value: 75 }],
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ComplianceScoreBreakdownModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders nothing when isOpen is false', () => {
      render(<ComplianceScoreBreakdownModal {...defaultProps} isOpen={false} />)
      expect(screen.queryByTestId('base-modal')).not.toBeInTheDocument()
    })

    it('renders modal with title when open', () => {
      render(<ComplianceScoreBreakdownModal {...defaultProps} />)
      expect(screen.getByTestId('base-modal')).toBeInTheDocument()
      expect(screen.getByText('Compliance Score Breakdown')).toBeInTheDocument()
    })

    it('renders status badge with score and label', () => {
      render(<ComplianceScoreBreakdownModal {...defaultProps} score={75} />)
      const badge = screen.getByTestId('status-badge')
      expect(badge.textContent).toContain('75%')
      expect(badge.textContent).toContain('Fair')
    })
  })

  describe('tabs', () => {
    it('renders Overview tab by default', () => {
      render(<ComplianceScoreBreakdownModal {...defaultProps} />)
      expect(screen.getByText('Overview')).toBeInTheDocument()
    })

    it('renders per-tool tabs for each breakdown item', () => {
      const breakdown = [
        { name: 'Kubescape', value: 78 },
        { name: 'Kyverno', value: 72 },
      ]
      render(<ComplianceScoreBreakdownModal {...defaultProps} breakdown={breakdown} />)
      expect(screen.getByText('Kubescape')).toBeInTheDocument()
      expect(screen.getByText('Kyverno')).toBeInTheDocument()
    })

    it('switches to Kubescape tab when clicked', async () => {
      const breakdown = [{ name: 'Kubescape', value: 78 }]
      const kubescapeData = {
        totalControls: 55,
        passedControls: 45,
        failedControls: 10,
        frameworks: [{ name: 'NSA-CISA', score: 82 }],
      }
      render(<ComplianceScoreBreakdownModal {...defaultProps} breakdown={breakdown} kubescapeData={kubescapeData} />)
      await userEvent.click(screen.getByText('Kubescape'))
      expect(screen.getByText('Total Controls')).toBeInTheDocument()
      expect(screen.getByText('55')).toBeInTheDocument()
    })

    it('switches to Kyverno tab when clicked', async () => {
      const breakdown = [{ name: 'Kyverno', value: 72 }]
      const kyvernoData = {
        totalPolicies: 20,
        totalViolations: 5,
        enforcingCount: 8,
        auditCount: 12,
      }
      render(<ComplianceScoreBreakdownModal {...defaultProps} breakdown={breakdown} kyvernoData={kyvernoData} />)
      await userEvent.click(screen.getByText('Kyverno'))
      expect(screen.getByText('Total Policies')).toBeInTheDocument()
      expect(screen.getByText('20')).toBeInTheDocument()
    })

    it('shows unavailable message for tool tab with no data', async () => {
      const breakdown = [{ name: 'Kubescape', value: 78 }]
      render(<ComplianceScoreBreakdownModal {...defaultProps} breakdown={breakdown} kubescapeData={undefined} />)
      await userEvent.click(screen.getByText('Kubescape'))
      expect(screen.getByText('Kubescape data not available')).toBeInTheDocument()
    })

    it('shows tab badges with score percentage', () => {
      const breakdown = [{ name: 'Kubescape', value: 82 }]
      render(<ComplianceScoreBreakdownModal {...defaultProps} breakdown={breakdown} />)
      expect(screen.getByTestId('badge-Kubescape').textContent).toBe('82%')
    })
  })

  describe('overview tab content', () => {
    it('renders score percentage in gauge', () => {
      render(<ComplianceScoreBreakdownModal {...defaultProps} score={75} />)
      expect(screen.getByText('75%')).toBeInTheDocument()
    })

    it('renders score context label and description', () => {
      render(<ComplianceScoreBreakdownModal {...defaultProps} score={75} />)
      expect(screen.getByText('Fair')).toBeInTheDocument()
      expect(screen.getByText('Moderate posture')).toBeInTheDocument()
    })

    it('renders kubescape check stats when kubescapeData provided', () => {
      const kubescapeData = { totalControls: 100, passedControls: 80, failedControls: 20, frameworks: [] }
      render(<ComplianceScoreBreakdownModal {...defaultProps} kubescapeData={kubescapeData} />)
      expect(screen.getByText('Total Checks')).toBeInTheDocument()
      expect(screen.getByText('100')).toBeInTheDocument()
      expect(screen.getByText('Passing')).toBeInTheDocument()
      expect(screen.getByText('Failing')).toBeInTheDocument()
    })

    it('renders kyverno policy stats when kyvernoData provided', () => {
      const kyvernoData = { totalPolicies: 15, totalViolations: 3, enforcingCount: 5, auditCount: 10 }
      render(<ComplianceScoreBreakdownModal {...defaultProps} kyvernoData={kyvernoData} />)
      expect(screen.getByText('Policies')).toBeInTheDocument()
      expect(screen.getByText('Violations')).toBeInTheDocument()
      expect(screen.getByText('15')).toBeInTheDocument()
      expect(screen.getByText('3')).toBeInTheDocument()
    })

    it('renders empty state when no tool data and no breakdown', () => {
      render(
        <ComplianceScoreBreakdownModal
          {...defaultProps}
          breakdown={[]}
          kubescapeData={undefined}
          kyvernoData={undefined}
        />,
      )
      expect(screen.getByText('No compliance tools are reporting data.')).toBeInTheDocument()
    })

    it('renders per-tool breakdown bars', () => {
      const breakdown = [
        { name: 'Kubescape', value: 78 },
        { name: 'Kyverno', value: 65 },
      ]
      render(<ComplianceScoreBreakdownModal {...defaultProps} breakdown={breakdown} />)
      // Both tool names appear in the overview breakdown section
      const allKubescape = screen.getAllByText('Kubescape')
      const allKyverno = screen.getAllByText('Kyverno')
      expect(allKubescape.length).toBeGreaterThan(0)
      expect(allKyverno.length).toBeGreaterThan(0)
    })
  })

  describe('kubescape tab details', () => {
    it('renders framework scores in Kubescape tab', async () => {
      const breakdown = [{ name: 'Kubescape', value: 78 }]
      const kubescapeData = {
        totalControls: 55,
        passedControls: 45,
        failedControls: 10,
        frameworks: [
          { name: 'NSA-CISA', score: 82 },
          { name: 'MITRE', score: 65 },
        ],
      }
      render(<ComplianceScoreBreakdownModal {...defaultProps} breakdown={breakdown} kubescapeData={kubescapeData} />)
      await userEvent.click(screen.getByText('Kubescape'))
      expect(screen.getByText('NSA-CISA')).toBeInTheDocument()
      expect(screen.getByText('MITRE')).toBeInTheDocument()
      expect(screen.getByText('82%')).toBeInTheDocument()
    })
  })

  describe('kyverno tab details', () => {
    it('renders compliance rate in Kyverno tab', async () => {
      const breakdown = [{ name: 'Kyverno', value: 72 }]
      const kyvernoData = { totalPolicies: 10, totalViolations: 2, enforcingCount: 4, auditCount: 6 }
      render(<ComplianceScoreBreakdownModal {...defaultProps} breakdown={breakdown} kyvernoData={kyvernoData} />)
      await userEvent.click(screen.getByText('Kyverno'))
      expect(screen.getByText(/Compliance Rate/)).toBeInTheDocument()
    })

    it('shows no policies message when totalPolicies is 0', async () => {
      const breakdown = [{ name: 'Kyverno', value: 0 }]
      const kyvernoData = { totalPolicies: 0, totalViolations: 0, enforcingCount: 0, auditCount: 0 }
      render(<ComplianceScoreBreakdownModal {...defaultProps} breakdown={breakdown} kyvernoData={kyvernoData} />)
      await userEvent.click(screen.getByText('Kyverno'))
      expect(screen.getByText('No policies configured')).toBeInTheDocument()
    })
  })
})
