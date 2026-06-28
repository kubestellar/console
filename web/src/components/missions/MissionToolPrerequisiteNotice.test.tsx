import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MissionToolPrerequisiteNotice } from './MissionToolPrerequisiteNotice'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      const map: Record<string, string> = {
        'missionToolCheck.checking': 'Checking for required local tools…',
        'missionToolCheck.errorTitle': 'Unable to verify local tools',
        'missionToolCheck.errorDescription': 'The console could not verify required local tools right now.',
        'missionToolCheck.readyTitle': 'Local tools ready',
        'missionToolCheck.readyDescription': `Required local tools detected: ${opts?.tools || ''}.`,
        'missionToolCheck.blockedTitle': 'Install local tools before running',
        'missionToolCheck.blockedDescription': `This mission requires ${opts?.tools || ''} to be installed locally before it can run.`,
        'missionToolCheck.warningTitle': 'Local tools recommended',
        'missionToolCheck.warningDescription': `This AI-assisted flow can continue, but local execution steps may still require ${opts?.tools || ''}.`,
        'missionToolCheck.blockedHint': 'Run Mission is disabled until the required tools are installed.',
        'missionToolCheck.installTool': `Install ${opts?.tool || 'tool'}`,
      }
      return map[key] ?? key
    },
  }),
}))

describe('MissionToolPrerequisiteNotice', () => {
  it('renders nothing when showNotice is false', () => {
    const { container } = render(
      <MissionToolPrerequisiteNotice
        status="ready"
        missingTools={[]}
        requiredTools={[]}
        showNotice={false}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders checking state', () => {
    render(
      <MissionToolPrerequisiteNotice
        status="checking"
        missingTools={[]}
        requiredTools={[]}
        showNotice={true}
      />
    )
    expect(screen.getByText('Checking for required local tools…')).toBeInTheDocument()
  })

  it('renders error state', () => {
    render(
      <MissionToolPrerequisiteNotice
        status="error"
        missingTools={[]}
        requiredTools={[]}
        errorMessage="Network error"
        showNotice={true}
      />
    )
    expect(screen.getByText('Unable to verify local tools')).toBeInTheDocument()
    expect(screen.getByText('Network error')).toBeInTheDocument()
  })

  it('renders ready state with tools list', () => {
    render(
      <MissionToolPrerequisiteNotice
        status="ready"
        missingTools={[]}
        requiredTools={['kubectl', 'helm']}
        showNotice={true}
      />
    )
    expect(screen.getByText('Local tools ready')).toBeInTheDocument()
    expect(screen.getByText(/kubectl, helm/)).toBeInTheDocument()
  })

  it('renders blocked state with missing tools', () => {
    render(
      <MissionToolPrerequisiteNotice
        status="blocked"
        missingTools={['kubectl', 'helm']}
        requiredTools={['kubectl', 'helm']}
        showNotice={true}
      />
    )
    expect(screen.getByText('Install local tools before running')).toBeInTheDocument()
    expect(screen.getByText(/kubectl, helm/)).toBeInTheDocument()
  })

  it('renders install links for tools', () => {
    render(
      <MissionToolPrerequisiteNotice
        status="blocked"
        missingTools={['kubectl', 'helm']}
        requiredTools={['kubectl', 'helm']}
        showNotice={true}
      />
    )
    const kubectlLink = screen.getByText(/Install kubectl/).closest('a')
    const helmLink = screen.getByText(/Install helm/).closest('a')
    expect(kubectlLink).toHaveAttribute('href', 'https://kubernetes.io/docs/tasks/tools/')
    expect(helmLink).toHaveAttribute('href', 'https://helm.sh/docs/intro/install/')
  })

  it('renders warning state', () => {
    render(
      <MissionToolPrerequisiteNotice
        status="warning"
        missingTools={['kubectl']}
        requiredTools={['kubectl']}
        showNotice={true}
      />
    )
    expect(screen.getByText('Local tools recommended')).toBeInTheDocument()
  })
})
