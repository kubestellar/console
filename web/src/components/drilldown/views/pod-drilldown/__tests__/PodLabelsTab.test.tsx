import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

vi.mock('../../../../../lib/demoMode', () => ({
  isDemoMode: () => true, getDemoMode: () => true, isNetlifyDeployment: false,
  isDemoModeForced: false, canToggleDemoMode: () => true, setDemoMode: vi.fn(),
  toggleDemoMode: vi.fn(), subscribeDemoMode: () => () => {},
  isDemoToken: () => true, hasRealToken: () => false, setDemoToken: vi.fn(),
  isFeatureEnabled: () => true,
}))

vi.mock('../../../../../hooks/useDemoMode', () => ({
  getDemoMode: () => true, default: () => true,
  useDemoMode: () => ({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }),
  hasRealToken: () => false, isDemoModeForced: false, isNetlifyDeployment: false,
  canToggleDemoMode: () => true, isDemoToken: () => true, setDemoToken: vi.fn(),
  setGlobalDemoMode: vi.fn(),
}))

vi.mock('../../../../../lib/analytics', () => ({
  emitNavigate: vi.fn(), emitLogin: vi.fn(), emitEvent: vi.fn(), analyticsReady: Promise.resolve(),
  emitAddCardModalOpened: vi.fn(), emitCardExpanded: vi.fn(), emitCardRefreshed: vi.fn(),
}))

vi.mock('../../../../../hooks/useTokenUsage', () => ({
  useTokenUsage: () => ({ usage: { total: 0, remaining: 0, used: 0 }, isLoading: false }),
  tokenUsageTracker: { getUsage: () => ({ total: 0, remaining: 0, used: 0 }), trackRequest: vi.fn(), getSettings: () => ({ enabled: false }) },
}))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }),
  Trans: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock('../../../../../lib/cn', () => ({
  cn: vi.fn(),
}))

import { PodLabelsProvider } from '../PodLabelsContext'
import { PodLabelsTab } from '../PodLabelsTab'

describe('PodLabelsTab', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <PodLabelsProvider
        describeLoading={false}
        agentConnected={false}
        copiedField={null}
        showAllLabels={false}
        setShowAllLabels={vi.fn()}
        editingLabels={false}
        setEditingLabels={vi.fn()}
        pendingLabelChanges={{}}
        newLabelKey=""
        setNewLabelKey={vi.fn()}
        newLabelValue=""
        setNewLabelValue={vi.fn()}
        labelSaving={false}
        labelError={null}
        handleLabelChange={vi.fn()}
        handleLabelRemove={vi.fn()}
        undoLabelChange={vi.fn()}
        saveLabels={vi.fn()}
        cancelLabelEdit={vi.fn()}
        showAllAnnotations={false}
        setShowAllAnnotations={vi.fn()}
        editingAnnotations={false}
        setEditingAnnotations={vi.fn()}
        pendingAnnotationChanges={{}}
        newAnnotationKey=""
        setNewAnnotationKey={vi.fn()}
        newAnnotationValue=""
        setNewAnnotationValue={vi.fn()}
        annotationSaving={false}
        annotationError={null}
        handleAnnotationChange={vi.fn()}
        handleAnnotationRemove={vi.fn()}
        undoAnnotationChange={vi.fn()}
        saveAnnotations={vi.fn()}
        cancelAnnotationEdit={vi.fn()}
        handleCopy={vi.fn()}
      >
        <PodLabelsTab labels={null} annotations={null} />
      </PodLabelsProvider>
    )
    expect(container).toBeTruthy()
  })
})
