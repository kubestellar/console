import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { SaveResolutionDialog } from './SaveResolutionDialog'
import type { Mission } from '../../hooks/useMissions'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/', search: '' }),
}))

vi.mock('../../lib/api', () => ({
  api: {
    post: vi.fn(),
  },
}))

vi.mock('../ui/Toast', () => ({
  useToast: () => ({
    showToast: vi.fn(),
  }),
}))

vi.mock('../../hooks/useResolutions', () => ({
  useResolutions: () => ({ saveResolution: vi.fn() }),
  detectIssueSignature: () => ({ type: 'Troubleshooting', resourceKind: 'Pod' }),
}))

vi.mock('../../lib/utils/wsAuth', () => ({
  getWsAuthParams: vi.fn().mockRejectedValue(new Error('AI unavailable')),
}))

const mockMission: Mission = {
  id: 'mission-1',
  title: 'Debug pod crash',
  description: 'kubectl delete pod my-pod',
  type: 'troubleshoot',
  status: 'completed',
  cluster: 'cluster-1',
  messages: [
    { id: 'm1', role: 'assistant', content: 'kubectl rollout restart deployment/my-app', timestamp: new Date('2026-01-01T00:00:00Z') },
  ],
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
}

describe('SaveResolutionDialog', () => {
  it('does not render when isOpen is false', () => {
    const { container } = render(
      <SaveResolutionDialog
        isOpen={false}
        onClose={vi.fn()}
        mission={mockMission}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders dialog when isOpen is true', () => {
    render(
      <SaveResolutionDialog
        isOpen={true}
        onClose={vi.fn()}
        mission={mockMission}
      />
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('displays mission-derived content in dialog', async () => {
    const resolution = 'kubectl delete pod my-pod'
    render(
      <SaveResolutionDialog
        isOpen={true}
        onClose={vi.fn()}
        mission={{ ...mockMission, title: resolution }}
      />
    )
    await waitFor(() => {
      expect(screen.getByDisplayValue(resolution)).toBeInTheDocument()
    })
  })

  it('calls onClose when close button is clicked', async () => {
    const onClose = vi.fn()
    render(
      <SaveResolutionDialog
        isOpen={true}
        onClose={onClose}
        mission={mockMission}
      />
    )
    const closeButton = await screen.findByRole('button', { name: /close modal/i })
    closeButton.click()
    expect(onClose).toHaveBeenCalled()
  })
})
