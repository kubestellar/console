import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MissionTypeExplainer } from './MissionTypeExplainer'
import { isDemoMode } from '../../lib/demoMode'

vi.mock('../../lib/demoMode', () => ({
  isDemoMode: vi.fn(() => true),
}))

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
  api: { post: vi.fn(), get: vi.fn() },
}))

vi.mock('../ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

describe('MissionTypeExplainer', () => {
  it('renders the title', () => {
    render(<MissionTypeExplainer />)
    expect(screen.getByText('How AI Missions work')).toBeInTheDocument()
  })

  it('renders all mission types', () => {
    render(<MissionTypeExplainer />)
    expect(screen.getByText('Install')).toBeInTheDocument()
    expect(screen.getByText('Fix')).toBeInTheDocument()
    expect(screen.getByText('Mission Control')).toBeInTheDocument()
    expect(screen.getByText('Orbit')).toBeInTheDocument()
  })

  it('renders mission type descriptions', () => {
    render(<MissionTypeExplainer />)
    expect(screen.getByText(/Deploy CNCF projects/)).toBeInTheDocument()
    expect(screen.getByText(/AI diagnoses issues/)).toBeInTheDocument()
    expect(screen.getByText(/Orchestrate multi-project/)).toBeInTheDocument()
    expect(screen.getByText(/Recurring maintenance/)).toBeInTheDocument()
  })

  it('renders summary text', () => {
    render(<MissionTypeExplainer />)
    expect(screen.getByText(/Mission Control combines all types/)).toBeInTheDocument()
  })

  it('does not render in non-demo mode', () => {
    vi.mocked(isDemoMode).mockReturnValue(false)
    const { container } = render(<MissionTypeExplainer />)
    expect(container.firstChild).toBeNull()
  })
})
