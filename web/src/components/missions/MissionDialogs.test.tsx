import React from 'react'
/**
 * Render tests for Mission detail and dialog components
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

vi.mock('../../hooks/mcp/clusters', () => ({
  useClusters: () => ({ deduplicatedClusters: [], isLoading: false, error: null, refetch: vi.fn() }),
}))

vi.mock('../../hooks/useResolutions', () => ({
  useResolutions: () => ({ saveResolution: vi.fn() }),
  detectIssueSignature: () => ({ type: 'Troubleshooting', resourceKind: 'Pod' }),
}))

vi.mock('../../lib/utils/wsAuth', () => ({
  getWsAuthParams: vi.fn().mockRejectedValue(new Error('AI unavailable')),
}))

vi.mock('../../lib/missions/scanner/index', () => ({
  fullScan: vi.fn(() => ({ findings: [], filesScanned: 1, errors: [] })),
}))

const mockMission = {
  id: 'mission-1',
  title: 'Test Mission',
  description: 'Test',
  type: 'troubleshoot' as const,
  status: 'completed' as const,
  cluster: 'cluster-1',
  messages: [],
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
}

const mockResolution = {
  id: 'resolution-1',
  missionId: 'mission-1',
  userId: 'user-1',
  title: 'Test Mission',
  issueSignature: { type: 'Troubleshooting', resourceKind: 'Pod' },
  resolution: { summary: 'Test', steps: ['Do the thing'] },
  context: { cluster: 'cluster-1', operators: [] },
  effectiveness: { timesUsed: 0, timesSuccessful: 0 },
  visibility: 'private' as const,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

describe('ClusterSelectionDialog', () => {
  it('renders without errors', async () => {
    const { ClusterSelectionDialog } = await import('./ClusterSelectionDialog')
    const { container } = render(
      <ClusterSelectionDialog
        open={true}
        missionTitle="Test Mission"
        onSelect={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    expect(container).toBeTruthy()
  })
})

describe('ConfirmMissionPromptDialog', () => {
  it('renders without errors', async () => {
    const { ConfirmMissionPromptDialog } = await import('./ConfirmMissionPromptDialog')
    const { container } = render(
      <ConfirmMissionPromptDialog
        open={true}
        missionTitle="Confirm"
        missionDescription="Are you sure?"
        initialPrompt=""
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />
    )
    expect(container).toBeTruthy()
  })
})

describe('ImproveMissionDialog', () => {
  it('renders without errors', async () => {
    const { ImproveMissionDialog } = await import('./ImproveMissionDialog')
    const { container } = render(
      <ImproveMissionDialog
        isOpen={true}
        onClose={vi.fn()}
        mission={{
          title: 'Test Mission',
          version: '1.0.0',
          type: 'install',
          steps: [],
        } as import('../../lib/missions/types').MissionExport}
      />
    )
    expect(container).toBeTruthy()
  })
})

describe('SaveResolutionDialog', () => {
  it('renders without errors', async () => {
    const { SaveResolutionDialog } = await import('./SaveResolutionDialog')
    const { container } = render(
      <SaveResolutionDialog
        isOpen={true}
        onClose={vi.fn()}
        mission={mockMission}
      />
    )
    expect(container).toBeTruthy()
  })
})

describe('ShareMissionDialog', () => {
  it('renders without errors', async () => {
    const { ShareMissionDialog } = await import('./ShareMissionDialog')
    const { container } = render(
      <ShareMissionDialog
        isOpen={true}
        onClose={vi.fn()}
        resolution={mockResolution}
      />
    )
    expect(container).toBeTruthy()
  })
})

describe('StandaloneOrbitDialog', () => {
  it('renders without errors', async () => {
    const { StandaloneOrbitDialog } = await import('./StandaloneOrbitDialog')
    const { container } = render(
      <StandaloneOrbitDialog
        isOpen={true}
        onClose={vi.fn()}
        missionId="test-123"
      />
    )
    expect(container).toBeTruthy()
  })
})

describe('SubmitToKBDialog', () => {
  it('renders without errors', async () => {
    const { SubmitToKBDialog } = await import('./SubmitToKBDialog')
    const { container } = render(
      <SubmitToKBDialog
        isOpen={true}
        onClose={vi.fn()}
        resolution={mockResolution}
      />
    )
    expect(container).toBeTruthy()
  })
})
