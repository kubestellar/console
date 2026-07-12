import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MissionDetailView } from './MissionDetailView'
import type { MissionExport } from '../../lib/missions/types'

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

const mockMission: MissionExport = {
  title: 'Install Prometheus',
  description: 'Install Prometheus monitoring stack',
  type: 'install',
  category: 'Monitoring',
  tags: ['prometheus', 'monitoring'],
  steps: [
    { title: 'Add Helm repo', description: 'Add the Prometheus community Helm repository', command: 'helm repo add prometheus-community https://prometheus-community.github.io/helm-charts' },
    { title: 'Install Prometheus', description: 'Install Prometheus using Helm', command: 'helm install prometheus prometheus-community/prometheus' },
  ],
  version: '1.0.0',
}

describe('MissionDetailView', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })
  it('renders mission title', () => {
    render(
      <MissionDetailView
        mission={mockMission}
        rawContent={null}
        showRaw={false}
        onToggleRaw={vi.fn()}
        onImport={vi.fn()}
        onBack={vi.fn()}
      />
    )
    expect(screen.getByText('Install Prometheus')).toBeInTheDocument()
  })

  it('renders mission description', () => {
    render(
      <MissionDetailView
        mission={mockMission}
        rawContent={null}
        showRaw={false}
        onToggleRaw={vi.fn()}
        onImport={vi.fn()}
        onBack={vi.fn()}
      />
    )
    expect(screen.getByText('Install Prometheus monitoring stack')).toBeInTheDocument()
  })

  it('renders loading skeleton when loading prop is true', () => {
    const { container } = render(
      <MissionDetailView
        mission={mockMission}
        rawContent={null}
        showRaw={false}
        onToggleRaw={vi.fn()}
        onImport={vi.fn()}
        onBack={vi.fn()}
        loading={true}
      />
    )
    expect(container.querySelector('.animate-shimmer')).toBeInTheDocument()
  })

  it('renders error message when error prop is provided', () => {
    render(
      <MissionDetailView
        mission={mockMission}
        rawContent={null}
        showRaw={false}
        onToggleRaw={vi.fn()}
        onImport={vi.fn()}
        onBack={vi.fn()}
        error="Failed to load mission"
      />
    )
    expect(screen.getByText(/Failed to load mission/)).toBeInTheDocument()
  })

  it('hides back button when hideBackButton is true', () => {
    render(
      <MissionDetailView
        mission={mockMission}
        rawContent={null}
        showRaw={false}
        onToggleRaw={vi.fn()}
        onImport={vi.fn()}
        onBack={vi.fn()}
        hideBackButton={true}
      />
    )
    expect(screen.queryByRole('button', { name: /back/i })).not.toBeInTheDocument()
  })

  it('uses custom import label when provided', () => {
    render(
      <MissionDetailView
        mission={mockMission}
        rawContent={null}
        showRaw={false}
        onToggleRaw={vi.fn()}
        onImport={vi.fn()}
        onBack={vi.fn()}
        importLabel="Run Mission"
      />
    )
    expect(screen.getByText('Run Mission')).toBeInTheDocument()
  })

  it('displays match score when provided', () => {
    render(
      <MissionDetailView
        mission={mockMission}
        rawContent={null}
        showRaw={false}
        onToggleRaw={vi.fn()}
        onImport={vi.fn()}
        onBack={vi.fn()}
        matchScore={85}
      />
    )
    expect(screen.getByText(/85%/)).toBeInTheDocument()
  })
})
