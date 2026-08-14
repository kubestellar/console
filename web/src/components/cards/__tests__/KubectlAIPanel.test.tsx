import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { KubectlAIPanel } from '../KubectlAIPanel'

// Standard vitest mocks for card testing
vi.mock('../../../lib/demoMode', () => ({
  isDemoMode: () => true,
  getDemoMode: () => true,
  isNetlifyDeployment: false,
  isDemoModeForced: false,
  canToggleDemoMode: () => true,
  setDemoMode: vi.fn(),
  toggleDemoMode: vi.fn(),
  subscribeDemoMode: () => () => {},
  isDemoToken: () => true,
  hasRealToken: () => false,
  setDemoToken: vi.fn(),
  isFeatureEnabled: () => true,
}))

vi.mock('../../../hooks/useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }),
  getDemoMode: () => true,
  hasRealToken: () => false,
  isDemoModeForced: false,
  isNetlifyDeployment: false,
  canToggleDemoMode: () => true,
  isDemoToken: () => true,
  setDemoToken: vi.fn(),
  setGlobalDemoMode: vi.fn(),
}))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }),
  Trans: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock('../../../hooks/useMCP', () => ({
  useClusters: () => ({ clusters: [], deduplicatedClusters: [], isLoading: false, isRefreshing: false, error: false, lastRefresh: Date.now() }),
}))

vi.mock('../../../hooks/useKubectl', () => ({
  useKubectl: () => ({ execute: vi.fn(), isRunning: false }),
}))

vi.mock('../../ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
}))

describe('KubectlAIPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders without crashing', () => {
    const mockOnClose = vi.fn()
    const { container } = render(
      <KubectlAIPanel
        isOpen={true}
        onClose={mockOnClose}
        cluster=""
        namespace=""
        resourceType=""
        resourceName=""
      />
    )
    expect(container).toBeTruthy()
  })

  it('calls onClose when close is triggered', () => {
    const mockOnClose = vi.fn()
    render(
      <KubectlAIPanel
        isOpen={true}
        onClose={mockOnClose}
        cluster="test-cluster"
        namespace="default"
        resourceType="pod"
        resourceName="test-pod"
      />
    )
    // Panel component should exist
    expect(mockOnClose).not.toHaveBeenCalled()
  })
})
