import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FixerCard } from './FixerCard'
import type { MissionExport } from '../../lib/missions/types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      const map: Record<string, string> = {
        'actions.import': 'Import',
        'missions.browser.stepsCount': `${opts?.count || 0} steps`,
        'feedback.share': 'Share',
        'missions.browser.copyShareableLink': 'Copy shareable link',
        'missions.browser.linkCopied': 'Link copied',
        'missions.browser.copyLinkFailed': 'Failed to copy',
        'missions.browser.copyFailed': 'Failed',
        'missions.browser.copied': 'Copied',
      }
      return map[key] ?? key
    },
  }),
}))

const mockMission: MissionExport = {
  title: 'Fix Kubernetes Pod Restart Loop',
  description: 'Troubleshoot and fix pod restart loops in Kubernetes',
  type: 'troubleshoot',
  category: 'Kubernetes',
  tags: ['kubernetes', 'pods', 'debugging'],
  steps: [{ type: 'command', command: 'kubectl get pods' }],
  version: '1.0.0',
}

describe('FixerCard', () => {
  it('renders the mission title', () => {
    render(
      <FixerCard
        mission={mockMission}
        onImport={vi.fn()}
        onSelect={vi.fn()}
      />
    )
    expect(screen.getByText('Fix Kubernetes Pod Restart Loop')).toBeInTheDocument()
  })

  it('renders the mission description', () => {
    render(
      <FixerCard
        mission={mockMission}
        onImport={vi.fn()}
        onSelect={vi.fn()}
      />
    )
    expect(screen.getByText(/Troubleshoot and fix pod restart loops/)).toBeInTheDocument()
  })

  it('renders the mission type badge', () => {
    render(
      <FixerCard
        mission={mockMission}
        onImport={vi.fn()}
        onSelect={vi.fn()}
      />
    )
    expect(screen.getByText('troubleshoot')).toBeInTheDocument()
  })

  it('renders the import button', () => {
    render(
      <FixerCard
        mission={mockMission}
        onImport={vi.fn()}
        onSelect={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: /Import/i })).toBeInTheDocument()
  })

  it('renders in compact mode', () => {
    render(
      <FixerCard
        mission={mockMission}
        onImport={vi.fn()}
        onSelect={vi.fn()}
        compact
      />
    )
    expect(screen.getByText('Fix Kubernetes Pod Restart Loop')).toBeInTheDocument()
    expect(screen.getByText('troubleshoot')).toBeInTheDocument()
  })

  it('calls onSelect when card is clicked', () => {
    const onSelect = vi.fn()
    render(
      <FixerCard
        mission={mockMission}
        onImport={vi.fn()}
        onSelect={onSelect}
      />
    )
    const card = screen.getByText('Fix Kubernetes Pod Restart Loop').closest('div')
    card?.click()
    expect(onSelect).toHaveBeenCalledOnce()
  })

  it('calls onImport when import button is clicked', () => {
    const onImport = vi.fn()
    render(
      <FixerCard
        mission={mockMission}
        onImport={onImport}
        onSelect={vi.fn()}
      />
    )
    screen.getByRole('button', { name: /Import/i }).click()
    expect(onImport).toHaveBeenCalledOnce()
  })

  it('renders tags', () => {
    render(
      <FixerCard
        mission={mockMission}
        onImport={vi.fn()}
        onSelect={vi.fn()}
      />
    )
    expect(screen.getByText('kubernetes')).toBeInTheDocument()
    expect(screen.getByText('pods')).toBeInTheDocument()
    expect(screen.getByText('debugging')).toBeInTheDocument()
  })
})
