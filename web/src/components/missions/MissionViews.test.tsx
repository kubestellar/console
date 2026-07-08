import React from 'react'
/**
 * Render tests for Orbit and Mission view components
 */
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/' }),
}))

vi.mock('../../lib/api', () => ({
  api: { post: vi.fn(), get: vi.fn() },
}))

vi.mock('../ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

describe('OrbitMonitorOffer', () => {
  it('renders without errors', async () => {
    const { OrbitMonitorOffer } = await import('./OrbitMonitorOffer')
    const { container } = render(
      <OrbitMonitorOffer
        missionId="test-123"
        onSetup={vi.fn()}
      />
    )
    expect(container).toBeTruthy()
  })
})

describe('OrbitReminderBanner', () => {
  it('renders without errors', async () => {
    const { OrbitReminderBanner } = await import('./OrbitReminderBanner')
    const { container } = render(
      <OrbitReminderBanner
        onDismiss={vi.fn()}
        onSetup={vi.fn()}
      />
    )
    expect(container).toBeTruthy()
  })
})

describe('OrbitSetupOffer', () => {
  it('renders without errors', async () => {
    const { OrbitSetupOffer } = await import('./OrbitSetupOffer')
    const { container } = render(
      <OrbitSetupOffer
        missionId="test-123"
        onSetup={vi.fn()}
      />
    )
    expect(container).toBeTruthy()
  })
})

describe('OrbitStatusTracker', () => {
  it('renders without errors', async () => {
    const { OrbitStatusTracker } = await import('./OrbitStatusTracker')
    const { container } = render(
      <OrbitStatusTracker
        orbitId="orbit-123"
        status="active"
      />
    )
    expect(container).toBeTruthy()
  })
})

describe('ResolutionErrorBoundary', () => {
  it('exports component', async () => {
    const module = await import('./ResolutionErrorBoundary')
    expect(module.ResolutionErrorBoundary).toBeDefined()
  })
})

describe('ResolutionHistoryPanel', () => {
  it('renders without errors', async () => {
    const { ResolutionHistoryPanel } = await import('./ResolutionHistoryPanel')
    const { container } = render(
      <ResolutionHistoryPanel
        resolutions={[]}
        onSelect={vi.fn()}
      />
    )
    expect(container).toBeTruthy()
  })
})

describe('ResolutionKnowledgePanel', () => {
  it('renders without errors', async () => {
    const { ResolutionKnowledgePanel } = await import('./ResolutionKnowledgePanel')
    const { container } = render(
      <ResolutionKnowledgePanel
        relatedResolutions={[]}
        onApplyResolution={vi.fn()}
        onSaveNewResolution={vi.fn()}
      />
    )
    expect(container).toBeTruthy()
  })
})

describe('ScanProgressOverlay', () => {
  it('renders without errors', async () => {
    const { ScanProgressOverlay } = await import('./ScanProgressOverlay')
    const { container } = render(
      <ScanProgressOverlay
        isScanning={true}
        progress={50}
        status="Scanning clusters..."
      />
    )
    expect(container).toBeTruthy()
  })
})

describe('KagentAgentPicker', () => {
  it('renders without errors', async () => {
    const { KagentAgentPicker } = await import('./KagentAgentPicker')
    const { container } = render(
      <KagentAgentPicker
        selectedAgent={null}
        onSelect={vi.fn()}
      />
    )
    expect(container).toBeTruthy()
  })
})

describe('MissionContentViewer', () => {
  it('renders without errors', async () => {
    const { MissionContentViewer } = await import('./MissionContentViewer')
    const mockProps = {
      searchPanel: {
        searchQuery: '',
        setSearchQuery: vi.fn(),
        isOpen: false,
        setIsOpen: vi.fn(),
      },
      filePanel: {
        selectedPath: null,
        setSelectedPath: vi.fn(),
        isOpen: false,
        setIsOpen: vi.fn(),
      },
      content: {
        directoryEntries: [],
        isScanning: false,
        scanResult: null,
        handleScanComplete: vi.fn(),
        handleScanDismiss: vi.fn(),
      },
    }
    const { container } = render(
      <MissionContentViewer
        {...mockProps}
      />
    )
    expect(container).toBeTruthy()
  })
})

describe('MissionDetailView', () => {
  it('renders without errors', async () => {
    const { MissionDetailView } = await import('./MissionDetailView')
    const mockMission = {
      title: 'Test Mission',
      description: 'Test',
      type: 'custom' as const,
      steps: [],
      version: '1.0.0',
    }
    const { container } = render(
      <MissionDetailView
        mission={mockMission}
        onClose={vi.fn()}
        onImport={vi.fn()}
      />
    )
    expect(container).toBeTruthy()
  })
})

describe('MissionLandingPage', () => {
  it('renders without errors', async () => {
    const { MissionLandingPage } = await import('./MissionLandingPage')
    const { container } = render(<MissionLandingPage />)
    expect(container).toBeTruthy()
  })
})
