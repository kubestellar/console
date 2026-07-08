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
        isOpen={true}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        title="Confirm"
        description="Are you sure?"
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
        onSubmit={vi.fn()}
        missionTitle="Test Mission"
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
        onSave={vi.fn()}
        initialTitle=""
      />
    )
    expect(container).toBeTruthy()
  })
})

describe('ShareMissionDialog', () => {
  it('renders without errors', async () => {
    const { ShareMissionDialog } = await import('./ShareMissionDialog')
    const mockMission = {
      title: 'Test Mission',
      description: 'Test',
      type: 'custom' as const,
      steps: [],
      version: '1.0.0',
    }
    const { container } = render(
      <ShareMissionDialog
        isOpen={true}
        onClose={vi.fn()}
        mission={mockMission}
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
    const mockMission = {
      title: 'Test Mission',
      description: 'Test',
      type: 'custom' as const,
      steps: [],
      version: '1.0.0',
    }
    const { container } = render(
      <SubmitToKBDialog
        isOpen={true}
        onClose={vi.fn()}
        mission={mockMission}
      />
    )
    expect(container).toBeTruthy()
  })
})
