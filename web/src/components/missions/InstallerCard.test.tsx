import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { InstallerCard } from './InstallerCard'
import type { MissionExport } from '../../lib/missions/types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      const map: Record<string, string> = {
        'actions.import': 'Import',
        'missions.browser.stepsCount': `${opts?.count || 0} steps`,
        'missions.browser.copyShareableLink': 'Copy shareable link',
      }
      return map[key] ?? key
    },
  }),
}))

const mockInstaller: MissionExport = {
  title: 'Install Prometheus',
  description: 'Deploy Prometheus to your cluster',
  type: 'install',
  cncfProject: 'prometheus',
  cncfMaturity: 'graduated',
  difficulty: 'beginner',
  installMethods: ['helm', 'kubectl'],
  steps: [{ type: 'command', command: 'helm install prometheus' }],
  version: '1.0.0',
}

describe('InstallerCard', () => {
  it('renders the mission title', () => {
    render(
      <InstallerCard
        mission={mockInstaller}
        onImport={vi.fn()}
        onSelect={vi.fn()}
      />
    )
    expect(screen.getByText('Install Prometheus')).toBeInTheDocument()
  })

  it('renders the mission description', () => {
    render(
      <InstallerCard
        mission={mockInstaller}
        onImport={vi.fn()}
        onSelect={vi.fn()}
      />
    )
    expect(screen.getByText(/Deploy Prometheus/)).toBeInTheDocument()
  })

  it('renders the import button', () => {
    render(
      <InstallerCard
        mission={mockInstaller}
        onImport={vi.fn()}
        onSelect={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: /Import/i })).toBeInTheDocument()
  })

  it('calls onSelect when card is clicked', () => {
    const onSelect = vi.fn()
    render(
      <InstallerCard
        mission={mockInstaller}
        onImport={vi.fn()}
        onSelect={onSelect}
      />
    )
    const card = screen.getByText('Install Prometheus').closest('div')
    card?.click()
    expect(onSelect).toHaveBeenCalledOnce()
  })

  it('calls onImport when import button is clicked', () => {
    const onImport = vi.fn()
    render(
      <InstallerCard
        mission={mockInstaller}
        onImport={onImport}
        onSelect={vi.fn()}
      />
    )
    screen.getByRole('button', { name: /Import/i }).click()
    expect(onImport).toHaveBeenCalledOnce()
  })
})
