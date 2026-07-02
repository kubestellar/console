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

describe('ClusterSelectionDialog', () => {
  it('renders without errors', async () => {
    const { ClusterSelectionDialog } = await import('./ClusterSelectionDialog')
    const { container } = render(
      <ClusterSelectionDialog
        isOpen={true}
        onClose={vi.fn()}
        onSelect={vi.fn()}
        availableClusters={[]}
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
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        missionTitle="Confirm"
        missionDescription="Are you sure?"
        initialPrompt="Test prompt"
      />
    )
    expect(container).toBeTruthy()
  })
})

describe('ImproveMissionDialog', () => {
  it('renders without errors', async () => {
    const { ImproveMissionDialog } = await import('./ImproveMissionDialog')
    const mockMission = {
      version: '1.0',
      title: 'Test Mission',
      description: 'Test description',
      type: 'troubleshoot' as const,
      tags: [],
      steps: [],
    }
    const { container } = render(
      <ImproveMissionDialog
        isOpen={true}
        onClose={vi.fn()}
        mission={mockMission}
      />
    )
    expect(container).toBeTruthy()
  })
})

describe('SaveResolutionDialog', () => {
  it('renders without errors', async () => {
    const { SaveResolutionDialog } = await import('./SaveResolutionDialog')
    const mockMission = {
      id: 'test-mission-123',
      title: 'Test Mission',
      description: 'Test description',
      type: 'troubleshoot' as const,
      status: 'complete' as const,
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    const { container } = render(
      <SaveResolutionDialog
        isOpen={true}
        onClose={vi.fn()}
        onSaved={vi.fn()}
        mission={mockMission}
      />
    )
    expect(container).toBeTruthy()
  })
})

describe('ShareMissionDialog', () => {
  it('renders without errors', async () => {
    const { ShareMissionDialog } = await import('./ShareMissionDialog')
    const mockResolution = {
      id: 'test-res-123',
      missionId: 'test-mission-123',
      userId: 'test-user',
      title: 'Test Resolution',
      visibility: 'private' as const,
      issueSignature: {
        name: 'test-issue',
        namespace: 'default',
        kind: 'Pod',
        cluster: 'test-cluster',
        type: 'CrashLoopBackOff',
        keywords: [],
      },
      resolution: {
        title: 'Resolution',
        summary: 'Test summary',
        steps: [],
      },
      context: {
        kubeContext: 'test',
        namespace: 'default',
      },
      effectiveness: {
        verified: false,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
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
    const mockResolution = {
      id: 'test-res-123',
      missionId: 'test-mission-123',
      userId: 'test-user',
      title: 'Test Resolution',
      visibility: 'private' as const,
      issueSignature: {
        name: 'test-issue',
        namespace: 'default',
        kind: 'Pod',
        cluster: 'test-cluster',
        type: 'CrashLoopBackOff',
        keywords: [],
      },
      resolution: {
        title: 'Resolution',
        summary: 'Test summary',
        steps: [],
      },
      context: {
        kubeContext: 'test',
        namespace: 'default',
      },
      effectiveness: {
        verified: false,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
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
