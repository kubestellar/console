import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

const mockIsDemoMode = vi.fn(() => false)
vi.mock('../../../hooks/useDemoMode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../hooks/useDemoMode')>()),
  useDemoMode: () => ({ isDemoMode: mockIsDemoMode(), toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }),
}))

const mockUseCardLoadingState = vi.fn()
vi.mock('../CardDataContext', () => ({
  useCardLoadingState: (opts: unknown) => mockUseCardLoadingState(opts),
}))

vi.mock('../../../hooks/useMissions', () => ({
  useMissions: () => ({ startMission: vi.fn() }),
}))

vi.mock('../console-missions/shared', () => ({
  useApiKeyCheck: () => ({ showKeyPrompt: false, checkKeyAndRun: vi.fn(), goToSettings: vi.fn(), dismissPrompt: vi.fn() }),
  ApiKeyPromptModal: () => null,
}))

vi.mock('../../missions/ConfirmMissionPromptDialog', () => ({
  ConfirmMissionPromptDialog: () => null,
}))

vi.mock('../multi-tenancy/missionLoader', () => ({
  loadMissionPrompt: vi.fn().mockResolvedValue('mock prompt'),
}))

vi.mock('../../../lib/cards/cardInstallMap', () => ({
  CARD_INSTALL_MAP: { falco_alerts: { missionKey: 'install-falco', kbPaths: [] } },
}))

vi.mock('../../../hooks/useTrivy', () => ({
  useTrivy: () => ({
    statuses: {}, aggregated: { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 },
    isLoading: false, isRefreshing: false, installed: false, hasErrors: false,
    isDemoData: false, clustersChecked: 0, totalClusters: 0, unavailableReason: null, refetch: vi.fn(),
  }),
}))

vi.mock('../../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => ({ selectedClusters: [] }),
}))

vi.mock('../trivy/TrivyDetailModal', () => ({
  TrivyDetailModal: () => null,
}))

vi.mock('../../../lib/constants/compliance', () => ({
  TRIVY_SEVERITY: {
    critical: { description: 'Immediate fix required', action: 'Fix now' },
    high: { description: 'Fix soon', action: 'Fix soon' },
    medium: { description: 'Fix when possible', action: 'Schedule fix' },
    low: { description: 'Low risk', action: 'Track' },
  },
}))

vi.mock('../strings', () => ({
  CARD_UI_STRINGS: {
    compliance: {
      trivyUnavailable: 'Trivy unavailable',
      requiresLocalAgent: 'Requires local agent',
      kubescapeUnavailable: 'Kubescape unavailable',
      complianceScoreUnavailable: 'Compliance score unavailable',
      policyViolationsUnavailable: 'Policy violations unavailable',
    },
  },
}))

vi.mock('../../../hooks/useKubescape', () => ({
  useKubescape: () => ({
    statuses: {}, aggregated: { totalControls: 0, passedControls: 0, failedControls: 0, frameworks: [] },
    controls: [], isLoading: false, isRefreshing: false, installed: false,
    hasErrors: false, isDemoData: false, clustersChecked: 0, totalClusters: 0,
    lastRefresh: null, unavailableReason: null, refetch: vi.fn(),
  }),
}))

vi.mock('../../../hooks/useKyverno', () => ({
  useKyverno: () => ({
    statuses: {}, isLoading: false, isRefreshing: false, installed: false,
    hasErrors: false, isDemoData: false, clustersChecked: 0, totalClusters: 0,
    lastRefresh: null, unavailableReason: null,
  }),
}))

vi.mock('../../../hooks/usePolicyViolations', () => ({
  usePolicyViolations: () => ({
    violations: [], isLoading: false, isRefreshing: false, hasData: false,
    hasErrors: false, isDemoData: false, unavailableReason: null, refetch: vi.fn(),
  }),
}))

vi.mock('../../../lib/complianceScore', () => ({
  buildComplianceScoreSummary: () => ({ score: 0, breakdown: [], usingFallback: true }),
}))

vi.mock('../../../lib/constants/compliance', () => ({
  TRIVY_SEVERITY: {
    critical: { description: 'Immediate fix required', action: 'Fix now' },
    high: { description: 'Fix soon', action: 'Fix soon' },
    medium: { description: 'Fix when possible', action: 'Schedule fix' },
    low: { description: 'Low risk', action: 'Track' },
  },
  CARD_DESCRIPTIONS: {
    compliance_score: { description: 'Compliance score across clusters' },
    policy_violations: { description: 'Policy violations across clusters' },
  },
  getScoreContext: () => ({ label: 'Poor', description: 'Needs work', color: 'text-red-400' }),
}))

vi.mock('./compliance/ComplianceScoreBreakdownModal', () => ({
  ComplianceScoreBreakdownModal: () => null,
}))

vi.mock('../compliance/ComplianceScoreBreakdownModal', () => ({
  ComplianceScoreBreakdownModal: () => null,
}))

vi.mock('../kyverno/KyvernoDetailModal', () => ({
  KyvernoDetailModal: () => null,
}))

vi.mock('./compliance/PolicyViolationDetailModal', () => ({
  PolicyViolationDetailModal: () => null,
}))

vi.mock('../compliance/PolicyViolationDetailModal', () => ({
  PolicyViolationDetailModal: () => null,
}))

vi.mock('../../ui/StatusBadge', () => ({
  StatusBadge: ({ children }: { children: React.ReactNode }) =>
    <span data-testid="status-badge">{children}</span>,
}))

import {
  FalcoAlerts,
  TrivyScan,
  KubescapeScan,
  PolicyViolations,
  ComplianceScore,
} from '../ComplianceCards'

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ComplianceCards', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsDemoMode.mockReturnValue(false)
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: false })
  })

  describe('FalcoAlerts', () => {
    it('renders without crashing', () => {
      const { container } = render(<FalcoAlerts />)
      expect(container).toBeTruthy()
    })

    it('shows integration notice in non-demo mode', () => {
      render(<FalcoAlerts />)
      expect(screen.getByText('cards:falcoAlerts.integration')).toBeTruthy()
    })

    it('renders demo alerts in demo mode', () => {
      mockIsDemoMode.mockReturnValue(true)
      render(<FalcoAlerts />)
      expect(screen.getByText('Container escape attempt detected')).toBeTruthy()
    })

    it('renders all three severity demo alerts', () => {
      mockIsDemoMode.mockReturnValue(true)
      render(<FalcoAlerts />)
      const alerts = document.querySelectorAll('[data-severity]')
      expect(alerts.length).toBe(3)
    })

    it('calls useCardLoadingState', () => {
      render(<FalcoAlerts />)
      expect(mockUseCardLoadingState).toHaveBeenCalled()
    })
  })

  describe('TrivyScan', () => {
    it('renders without crashing', () => {
      const { container } = render(<TrivyScan />)
      expect(container).toBeTruthy()
    })

    it('calls useCardLoadingState', () => {
      render(<TrivyScan />)
      expect(mockUseCardLoadingState).toHaveBeenCalled()
    })
  })

  describe('KubescapeScan', () => {
    it('renders without crashing', () => {
      const { container } = render(<KubescapeScan />)
      expect(container).toBeTruthy()
    })

    it('calls useCardLoadingState', () => {
      render(<KubescapeScan />)
      expect(mockUseCardLoadingState).toHaveBeenCalled()
    })
  })

  describe('PolicyViolations', () => {
    it('renders without crashing', () => {
      const { container } = render(<PolicyViolations />)
      expect(container).toBeTruthy()
    })

    it('calls useCardLoadingState', () => {
      render(<PolicyViolations />)
      expect(mockUseCardLoadingState).toHaveBeenCalled()
    })
  })

  describe('ComplianceScore', () => {
    it('renders without crashing', () => {
      const { container } = render(<ComplianceScore />)
      expect(container).toBeTruthy()
    })

    it('calls useCardLoadingState', () => {
      render(<ComplianceScore />)
      expect(mockUseCardLoadingState).toHaveBeenCalled()
    })
  })
})
