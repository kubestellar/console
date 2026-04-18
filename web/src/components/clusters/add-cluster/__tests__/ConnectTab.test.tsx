import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('../../../../lib/demoMode', () => ({
  isDemoMode: () => true, getDemoMode: () => true, isNetlifyDeployment: false,
  isDemoModeForced: false, canToggleDemoMode: () => true, setDemoMode: vi.fn(),
  toggleDemoMode: vi.fn(), subscribeDemoMode: () => () => {},
  isDemoToken: () => true, hasRealToken: () => false, setDemoToken: vi.fn(),
  isFeatureEnabled: () => true,
}))

vi.mock('../../../../hooks/useDemoMode', () => ({
  getDemoMode: () => true, default: () => true,
  useDemoMode: () => ({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }),
  hasRealToken: () => false, isDemoModeForced: false, isNetlifyDeployment: false,
  canToggleDemoMode: () => true, isDemoToken: () => true, setDemoToken: vi.fn(),
  setGlobalDemoMode: vi.fn(),
}))

vi.mock('../../../../lib/analytics', () => ({
  emitNavigate: vi.fn(), emitLogin: vi.fn(), emitEvent: vi.fn(), analyticsReady: Promise.resolve(),
  emitAddCardModalOpened: vi.fn(), emitCardExpanded: vi.fn(), emitCardRefreshed: vi.fn(),
}))

vi.mock('../../../../hooks/useTokenUsage', () => ({
  useTokenUsage: () => ({ usage: { total: 0, remaining: 0, used: 0 }, isLoading: false }),
  tokenUsageTracker: { getUsage: () => ({ total: 0, remaining: 0, used: 0 }), trackRequest: vi.fn(), getSettings: () => ({ enabled: false }) },
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }),
  Trans: ({ children }: { children: React.ReactNode }) => children,
}))

import { ConnectTab } from '../ConnectTab'

describe('ConnectTab', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <ConnectTab
        connectStep={1}
        setConnectStep={vi.fn()}
        connectState="idle"
        serverUrl=""
        setServerUrl={vi.fn()}
        authType="token"
        setAuthType={vi.fn()}
        token=""
        setToken={vi.fn()}
        certData=""
        setCertData={vi.fn()}
        keyData=""
        setKeyData={vi.fn()}
        caData=""
        setCaData={vi.fn()}
        skipTls={false}
        setSkipTls={vi.fn()}
        contextName=""
        setContextName={vi.fn()}
        clusterName=""
        setClusterName={vi.fn()}
        namespace=""
        setNamespace={vi.fn()}
        testResult={null}
        resetTestResult={vi.fn()}
        connectError=""
        showAdvanced={false}
        setShowAdvanced={vi.fn()}
        selectedCloudProvider="eks"
        setSelectedCloudProvider={vi.fn()}
        goToConnectStep={vi.fn()}
        handleTestConnection={vi.fn()}
        handleAddCluster={vi.fn()}
      />
    )
    expect(container).toBeTruthy()
  })

  // Regression: #8914 — when Cloud IAM auth is selected, the Next button must
  // still be rendered and enabled so the user can advance to step 3.
  it('renders an enabled Next button on step 2 when authType is cloud-iam', () => {
    render(
      <ConnectTab
        connectStep={2}
        setConnectStep={vi.fn()}
        connectState="idle"
        serverUrl="https://example.com"
        setServerUrl={vi.fn()}
        authType="cloud-iam"
        setAuthType={vi.fn()}
        token=""
        setToken={vi.fn()}
        certData=""
        setCertData={vi.fn()}
        keyData=""
        setKeyData={vi.fn()}
        caData=""
        setCaData={vi.fn()}
        skipTls={false}
        setSkipTls={vi.fn()}
        contextName=""
        setContextName={vi.fn()}
        clusterName=""
        setClusterName={vi.fn()}
        namespace=""
        setNamespace={vi.fn()}
        testResult={null}
        connectError=""
        showAdvanced={false}
        setShowAdvanced={vi.fn()}
        selectedCloudProvider="eks"
        setSelectedCloudProvider={vi.fn()}
        goToConnectStep={vi.fn()}
        handleTestConnection={vi.fn()}
        handleAddCluster={vi.fn()}
      />
    )
    const nextBtn = screen.getByRole('button', { name: 'cluster.connectNext' })
    expect(nextBtn).toBeTruthy()
    expect((nextBtn as HTMLButtonElement).disabled).toBe(false)
  })
})
