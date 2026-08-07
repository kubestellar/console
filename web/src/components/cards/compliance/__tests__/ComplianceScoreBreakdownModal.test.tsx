import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ComplianceScoreBreakdownModal } from '../ComplianceScoreBreakdownModal'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockEmitModalOpened = vi.fn()
const mockEmitModalTabViewed = vi.fn()
const mockEmitModalClosed = vi.fn()
vi.mock('../../../../lib/analytics', () => ({
  emitModalOpened: (...args: unknown[]) => mockEmitModalOpened(...args),
  emitModalTabViewed: (...args: unknown[]) => mockEmitModalTabViewed(...args),
  emitModalClosed: (...args: unknown[]) => mockEmitModalClosed(...args),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const breakdown = [
  { name: 'Kubescape', value: 82 },
  { name: 'Kyverno', value: 90 },
]

const kubescapeData = {
  totalControls: 10,
  passedControls: 8,
  failedControls: 2,
  frameworks: [{ name: 'CIS', score: 82, passCount: 8, failCount: 2 }],
}

const kyvernoData = {
  totalPolicies: 5,
  totalViolations: 3,
  enforcingCount: 4,
  auditCount: 1,
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ComplianceScoreBreakdownModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('open/close behavior', () => {
    it('renders nothing when isOpen is false', () => {
      const { container } = render(
        <ComplianceScoreBreakdownModal isOpen={false} onClose={() => {}} score={85} breakdown={breakdown} />,
      )
      expect(container).toBeEmptyDOMElement()
      expect(mockEmitModalOpened).not.toHaveBeenCalled()
    })

    it('emits modal opened analytics and shows the score when opened', () => {
      render(
        <ComplianceScoreBreakdownModal isOpen onClose={() => {}} score={85} breakdown={breakdown} />,
      )
      expect(screen.getByText('Compliance Score Breakdown')).toBeInTheDocument()
      expect(mockEmitModalOpened).toHaveBeenCalledWith('compliance_score', 'compliance_score')
    })

    it('emits modal closed analytics with elapsed time when the close button is clicked', async () => {
      const onClose = vi.fn()
      render(
        <ComplianceScoreBreakdownModal isOpen onClose={onClose} score={85} breakdown={breakdown} />,
      )
      await userEvent.click(screen.getByRole('button', { name: /close/i }))
      expect(onClose).toHaveBeenCalled()
      expect(mockEmitModalClosed).toHaveBeenCalledWith('compliance_score', expect.any(Number))
    })
  })

  describe('breakdown categories', () => {
    it('renders a tab per tool plus an Overview tab', () => {
      render(
        <ComplianceScoreBreakdownModal
          isOpen
          onClose={() => {}}
          score={85}
          breakdown={breakdown}
          kubescapeData={kubescapeData}
          kyvernoData={kyvernoData}
        />,
      )
      expect(screen.getByRole('tab', { name: /Overview/ })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /Kubescape/ })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /Kyverno/ })).toBeInTheDocument()
    })

    it('shows per-tool Kubescape/Kyverno stats on the Overview tab', () => {
      render(
        <ComplianceScoreBreakdownModal
          isOpen
          onClose={() => {}}
          score={85}
          breakdown={breakdown}
          kubescapeData={kubescapeData}
          kyvernoData={kyvernoData}
        />,
      )
      expect(screen.getByText('Kubescape checks')).toBeInTheDocument()
      expect(screen.getByText('Kyverno policies')).toBeInTheDocument()
    })

    it('switches to the Kubescape tab and shows framework scores', async () => {
      render(
        <ComplianceScoreBreakdownModal
          isOpen
          onClose={() => {}}
          score={85}
          breakdown={breakdown}
          kubescapeData={kubescapeData}
          kyvernoData={kyvernoData}
        />,
      )
      await userEvent.click(screen.getByRole('tab', { name: /Kubescape/ }))
      expect(screen.getByText('Framework Scores')).toBeInTheDocument()
      expect(screen.getByText('CIS')).toBeInTheDocument()
      expect(mockEmitModalTabViewed).toHaveBeenCalledWith('compliance_score', 'Kubescape')
    })

    it('switches to the Kyverno tab and shows compliance rate', async () => {
      render(
        <ComplianceScoreBreakdownModal
          isOpen
          onClose={() => {}}
          score={85}
          breakdown={breakdown}
          kubescapeData={kubescapeData}
          kyvernoData={kyvernoData}
        />,
      )
      await userEvent.click(screen.getByRole('tab', { name: /Kyverno/ }))
      expect(screen.getByText(/Compliance Rate/)).toBeInTheDocument()
      expect(mockEmitModalTabViewed).toHaveBeenCalledWith('compliance_score', 'Kyverno')
    })

    it('shows a data-unavailable message on the Kubescape tab when kubescapeData is missing', async () => {
      render(
        <ComplianceScoreBreakdownModal
          isOpen
          onClose={() => {}}
          score={85}
          breakdown={breakdown}
          kyvernoData={kyvernoData}
        />,
      )
      await userEvent.click(screen.getByRole('tab', { name: /Kubescape/ }))
      expect(screen.getByText('Kubescape data not available')).toBeInTheDocument()
    })

    it('shows the empty state when no breakdown or tool data is available', () => {
      render(
        <ComplianceScoreBreakdownModal isOpen onClose={() => {}} score={0} breakdown={[]} />,
      )
      expect(screen.getByText('No compliance tools are reporting data.')).toBeInTheDocument()
    })
  })

  describe('representative mock data', () => {
    it('shows the score badge with its context label', () => {
      render(
        <ComplianceScoreBreakdownModal isOpen onClose={() => {}} score={85} breakdown={breakdown} />,
      )
      expect(screen.getByText(/85% — Good/)).toBeInTheDocument()
    })
  })
})
