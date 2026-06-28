import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MissionToolPrerequisiteNotice } from '../MissionToolPrerequisiteNotice'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, string>) => {
      if (opts?.defaultValue) {
        let result = opts.defaultValue
        // Simple template replacement for {{tools}} and {{tool}}
        if (opts.tools) result = result.replace('{{tools}}', opts.tools)
        if (opts.tool) result = result.replace('{{tool}}', opts.tool)
        return result
      }
      return key
    },
  }),
}))

describe('MissionToolPrerequisiteNotice', () => {
  it('renders nothing when showNotice is false', () => {
    const { container } = render(
      <MissionToolPrerequisiteNotice
        status="ready"
        missingTools={[]}
        requiredTools={['kubectl']}
        showNotice={false}
      />
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders checking state with spinner message', () => {
    render(
      <MissionToolPrerequisiteNotice
        status="checking"
        missingTools={[]}
        requiredTools={['kubectl']}
        showNotice={true}
      />
    )
    expect(screen.getByText('Checking for required local tools…')).toBeTruthy()
  })

  it('renders error state with error message', () => {
    render(
      <MissionToolPrerequisiteNotice
        status="error"
        missingTools={[]}
        requiredTools={['kubectl']}
        errorMessage="Network timeout"
        showNotice={true}
      />
    )
    expect(screen.getByText('Unable to verify local tools')).toBeTruthy()
    expect(screen.getByText('Network timeout')).toBeTruthy()
  })

  it('renders error state with default message when no errorMessage', () => {
    render(
      <MissionToolPrerequisiteNotice
        status="error"
        missingTools={[]}
        requiredTools={['kubectl']}
        showNotice={true}
      />
    )
    expect(screen.getByText('Unable to verify local tools')).toBeTruthy()
    expect(screen.getByText('The console could not verify required local tools right now.')).toBeTruthy()
  })

  it('renders ready state listing detected tools', () => {
    render(
      <MissionToolPrerequisiteNotice
        status="ready"
        missingTools={[]}
        requiredTools={['kubectl', 'helm']}
        showNotice={true}
      />
    )
    expect(screen.getByText('Local tools ready')).toBeTruthy()
    expect(screen.getByText(/kubectl, helm/)).toBeTruthy()
  })

  it('renders blocked state with disabled-run hint', () => {
    render(
      <MissionToolPrerequisiteNotice
        status="blocked"
        missingTools={['helm']}
        requiredTools={['kubectl', 'helm']}
        showNotice={true}
      />
    )
    expect(screen.getByText('Install local tools before running')).toBeTruthy()
    expect(screen.getByText(/This mission requires helm/)).toBeTruthy()
    expect(screen.getByText('Run Mission is disabled until the required tools are installed.')).toBeTruthy()
  })

  it('renders warning state for non-blocking missing tools', () => {
    render(
      <MissionToolPrerequisiteNotice
        status="warning"
        missingTools={['helm']}
        requiredTools={['kubectl', 'helm']}
        showNotice={true}
      />
    )
    expect(screen.getByText('Local tools recommended')).toBeTruthy()
    expect(screen.getByText(/local execution steps may still require helm/)).toBeTruthy()
  })

  it('renders install links for known tools', () => {
    render(
      <MissionToolPrerequisiteNotice
        status="blocked"
        missingTools={['kubectl', 'helm']}
        requiredTools={['kubectl', 'helm']}
        showNotice={true}
      />
    )
    const kubectlLink = screen.getByText('Install kubectl')
    expect(kubectlLink.closest('a')?.getAttribute('href')).toContain('kubernetes.io')
    const helmLink = screen.getByText('Install helm')
    expect(helmLink.closest('a')?.getAttribute('href')).toContain('helm.sh')
  })

  it('does not render install link for unknown tools', () => {
    render(
      <MissionToolPrerequisiteNotice
        status="blocked"
        missingTools={['custom-tool']}
        requiredTools={['custom-tool']}
        showNotice={true}
      />
    )
    expect(screen.queryByText('Install custom-tool')).toBeNull()
  })
})
