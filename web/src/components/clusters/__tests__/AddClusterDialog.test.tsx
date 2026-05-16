import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'

vi.mock('../../../lib/demoMode', () => ({
  isDemoMode: () => true, getDemoMode: () => true, isNetlifyDeployment: false,
  isDemoModeForced: false, canToggleDemoMode: () => true, setDemoMode: vi.fn(),
  toggleDemoMode: vi.fn(), subscribeDemoMode: () => () => {},
  isDemoToken: () => true, hasRealToken: () => false, setDemoToken: vi.fn(),
  isFeatureEnabled: () => true,
}))

vi.mock('../../../hooks/useDemoMode', () => ({
  getDemoMode: () => true, default: () => true,
  useDemoMode: () => ({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }),
  hasRealToken: () => false, isDemoModeForced: false, isNetlifyDeployment: false,
  canToggleDemoMode: () => true, isDemoToken: () => true, setDemoToken: vi.fn(),
  setGlobalDemoMode: vi.fn(),
}))

vi.mock('../../../lib/analytics', () => ({
  emitNavigate: vi.fn(), emitLogin: vi.fn(), emitEvent: vi.fn(), analyticsReady: Promise.resolve(),
  emitAddCardModalOpened: vi.fn(), emitCardExpanded: vi.fn(), emitCardRefreshed: vi.fn(),
}))

vi.mock('../../../hooks/useTokenUsage', () => ({
  useTokenUsage: () => ({ usage: { total: 0, remaining: 0, used: 0 }, isLoading: false }),
  tokenUsageTracker: { getUsage: () => ({ total: 0, remaining: 0, used: 0 }), trackRequest: vi.fn(), getSettings: () => ({ enabled: false }) },
}))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }),
  Trans: ({ children }: { children: React.ReactNode }) => children,
}))

import { AddClusterDialog } from '../AddClusterDialog'

describe('AddClusterDialog', () => {
  it('renders without crashing', () => {
    const { container } = render(<AddClusterDialog open={false} onClose={() => {}} />)
    expect(container).toBeTruthy()
  })

  // Regression test for #8913 — switching tabs must not wipe the form data
  // entered in another tab. Previously, the tab onClick called resetConnectState()
  // / resetImportState() which cleared user input on every tab switch.
  it('preserves import-tab kubeconfig textarea across tab switches (#8913)', () => {
    const { getByPlaceholderText, getByText } = render(
      <AddClusterDialog open={true} onClose={() => {}} />
    )

    // Start on the default tab, switch to Import, type something, then switch
    // to Connect and back to Import — the text must still be there.
    const importTab = getByText('cluster.addClusterImport')
    fireEvent.click(importTab)

    const textarea = getByPlaceholderText(/apiVersion/i) as HTMLTextAreaElement
    const SAMPLE_KUBECONFIG = 'apiVersion: v1\nkind: Config'
    fireEvent.change(textarea, { target: { value: SAMPLE_KUBECONFIG } })
    expect(textarea.value).toBe(SAMPLE_KUBECONFIG)

    // Switch to Connect tab
    fireEvent.click(getByText('cluster.addClusterConnect'))
    // Switch back to Import tab
    fireEvent.click(getByText('cluster.addClusterImport'))

    const textareaAfter = getByPlaceholderText(/apiVersion/i) as HTMLTextAreaElement
    expect(textareaAfter.value).toBe(SAMPLE_KUBECONFIG)
  })
})
