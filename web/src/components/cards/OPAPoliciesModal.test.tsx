import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { OPAPoliciesModal } from './OPAPoliciesModal'

vi.mock('react-i18next', () => ({ initReactI18next: { type: '3rdParty', init: () => {} }, useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }) }))
vi.mock('./opa', () => ({
  PolicyDetailModal: ({ isOpen }: { isOpen: boolean }) => isOpen ? <div data-testid="policy-detail-modal" /> : null,
  ClusterOPAModal: ({ isOpen }: { isOpen: boolean }) => isOpen ? <div data-testid="cluster-opa-modal" /> : null,
  CreatePolicyModal: ({ isOpen }: { isOpen: boolean }) => isOpen ? <div data-testid="create-policy-modal" /> : null,
}))

const baseProps = {
  showViolationsModal: false,
  closeViolationsModal: vi.fn(),
  selectedClusterForViolations: 'prod',
  statuses: { prod: { cluster: 'prod', installed: true, loading: false, policies: [], violations: [] } },
  onRefresh: vi.fn(),
  startMission: vi.fn(),
  showPolicyModal: false,
  closePolicyModal: vi.fn(),
  selectedPolicy: null,
  setSelectedPolicy: vi.fn(),
  onAddPolicy: vi.fn(),
  showCreatePolicyModal: false,
  closeCreatePolicyModal: vi.fn(),
}

describe('OPAPoliciesModal', () => {
  it('renders loading skeleton/loading state as closed content', () => {
    const { container } = render(<OPAPoliciesModal {...baseProps} />)
    expect(container).toBeEmptyDOMElement()
  })
  it('renders empty state when no modal is open', () => {
    render(<OPAPoliciesModal {...baseProps} />)
    expect(screen.queryByTestId('cluster-opa-modal')).not.toBeInTheDocument()
  })
  it('renders error state by not opening policy detail without selected policy', () => {
    render(<OPAPoliciesModal {...baseProps} showPolicyModal />)
    expect(screen.queryByTestId('policy-detail-modal')).not.toBeInTheDocument()
  })
  it('renders happy-path modal data', () => {
    render(<OPAPoliciesModal {...baseProps} showViolationsModal showCreatePolicyModal selectedPolicy={{ name: 'require-labels', kind: 'K8sRequiredLabels', violations: 0 }} showPolicyModal />)
    expect(screen.getByTestId('cluster-opa-modal')).toBeInTheDocument()
    expect(screen.getByTestId('create-policy-modal')).toBeInTheDocument()
    expect(screen.getByTestId('policy-detail-modal')).toBeInTheDocument()
  })
  it('matches snapshot', () => {
    const { container } = render(<OPAPoliciesModal {...baseProps} showViolationsModal />)
    expect(container).toMatchSnapshot()
  })
})
