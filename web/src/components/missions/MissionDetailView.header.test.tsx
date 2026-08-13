import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MissionDetailHeader } from './MissionDetailView.header'
import type { MissionExport } from '../../lib/missions/types'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('../../lib/clipboard', () => ({
  copyToClipboard: vi.fn(),
}))

const mockMission: MissionExport = {
  title: 'Install Prometheus',
  description: 'Install Prometheus monitoring stack',
  type: 'install',
  category: 'Monitoring',
  tags: ['prometheus', 'monitoring'],
  steps: [
    { title: 'Add Helm repo', description: 'Add the Prometheus community Helm repository', command: 'helm repo add prometheus-community https://prometheus-community.github.io/helm-charts' },
  ],
  version: '1.0.0',
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('MissionDetailHeader', () => {
  it('renders the mission title and description', () => {
    render(
      <MissionDetailHeader
        mission={mockMission}
        showRaw={false}
        onToggleRaw={vi.fn()}
        onImport={vi.fn()}
        onBack={vi.fn()}
      />
    )

    expect(screen.getByText('Install Prometheus')).toBeInTheDocument()
    expect(screen.getByText('Install Prometheus monitoring stack')).toBeInTheDocument()
  })

  it('hides the back button when hideBackButton is true', () => {
    render(
      <MissionDetailHeader
        mission={mockMission}
        showRaw={false}
        onToggleRaw={vi.fn()}
        onImport={vi.fn()}
        onBack={vi.fn()}
        hideBackButton
      />
    )

    expect(screen.queryByText('missions.detail.links.backToListing')).not.toBeInTheDocument()
  })

  it('calls onBack when the back button is clicked', async () => {
    const onBack = vi.fn()
    const user = userEvent.setup()

    render(
      <MissionDetailHeader
        mission={mockMission}
        showRaw={false}
        onToggleRaw={vi.fn()}
        onImport={vi.fn()}
        onBack={onBack}
      />
    )

    await user.click(screen.getByText('missions.detail.links.backToListing'))
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('calls onToggleRaw when the raw/preview toggle is clicked', async () => {
    const onToggleRaw = vi.fn()
    const user = userEvent.setup()

    render(
      <MissionDetailHeader
        mission={mockMission}
        showRaw={false}
        onToggleRaw={onToggleRaw}
        onImport={vi.fn()}
        onBack={vi.fn()}
      />
    )

    await user.click(screen.getByText('missions.detail.actions.viewRaw'))
    expect(onToggleRaw).toHaveBeenCalledTimes(1)
  })

  it('calls onImport when the import button is clicked', async () => {
    const onImport = vi.fn()
    const user = userEvent.setup()

    render(
      <MissionDetailHeader
        mission={mockMission}
        showRaw={false}
        onToggleRaw={vi.fn()}
        onImport={onImport}
        onBack={vi.fn()}
        importLabel="Run"
      />
    )

    await user.click(screen.getByText('Run'))
    expect(onImport).toHaveBeenCalledTimes(1)
  })

  it('does not render the improve button when onImprove is not provided', () => {
    render(
      <MissionDetailHeader
        mission={mockMission}
        showRaw={false}
        onToggleRaw={vi.fn()}
        onImport={vi.fn()}
        onBack={vi.fn()}
      />
    )

    expect(screen.queryByText('missions.detail.actions.improve')).not.toBeInTheDocument()
  })

  it('renders the improve button and calls onImprove when clicked', async () => {
    const onImprove = vi.fn()
    const user = userEvent.setup()

    render(
      <MissionDetailHeader
        mission={mockMission}
        showRaw={false}
        onToggleRaw={vi.fn()}
        onImport={vi.fn()}
        onBack={vi.fn()}
        onImprove={onImprove}
      />
    )

    await user.click(screen.getByText('missions.detail.actions.improve'))
    expect(onImprove).toHaveBeenCalledTimes(1)
  })

  it('does not render the share button when shareUrl is not provided', () => {
    render(
      <MissionDetailHeader
        mission={mockMission}
        showRaw={false}
        onToggleRaw={vi.fn()}
        onImport={vi.fn()}
        onBack={vi.fn()}
      />
    )

    expect(screen.queryByText('missions.detail.actions.share')).not.toBeInTheDocument()
  })

  it('renders the match score badge when matchScore is provided', () => {
    render(
      <MissionDetailHeader
        mission={mockMission}
        showRaw={false}
        onToggleRaw={vi.fn()}
        onImport={vi.fn()}
        onBack={vi.fn()}
        matchScore={85}
      />
    )

    expect(screen.getByText('85% match')).toBeInTheDocument()
  })
})
