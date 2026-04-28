import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  GaugeRow,
  generateDefaultPhases,
  getDependencyNotes,
  DeployModeInfoPanel,
  ProjectInfoPanel
} from '../BlueprintInfoPanels'
import type { PayloadProject } from '../types'

describe('GaugeRow', () => {
  it('renders progress bar with correct percentage', () => {
    render(<GaugeRow label="CPU" value={4} max={8} unit=" cores" />)
    expect(screen.getByText('CPU')).toBeDefined()
    expect(screen.getByText('4 / 8 cores (50%)')).toBeDefined()
  })

  it('handles zero max gracefully', () => {
    render(<GaugeRow label="CPU" value={4} max={0} unit=" cores" />)
    expect(screen.getByText('4 / 0 cores')).toBeDefined()
  })
})

describe('generateDefaultPhases', () => {
  it('categorizes projects into logical phases based on priority and dependencies', () => {
    const projects: PayloadProject[] = [
      { name: 'cert-manager', displayName: 'Cert Manager', priority: 'required', dependencies: [], category: 'Security' },
      { name: 'falco', displayName: 'Falco', priority: 'required', dependencies: ['prometheus'], category: 'Security' },
      { name: 'prometheus', displayName: 'Prometheus', priority: 'recommended', dependencies: [], category: 'Observability' },
    ]
    
    const phases = generateDefaultPhases(projects)
    
    // Phase 1 should contain cert-manager (known infra) and prometheus (dep of falco)
    expect(phases[0].name).toBe('Core Infrastructure')
    expect(phases[0].projectNames).toContain('cert-manager')
    expect(phases[0].projectNames).toContain('prometheus')
    
    // Phase 2 should contain falco (required)
    expect(phases[1].name).toBe('Security & Networking')
    expect(phases[1].projectNames).toContain('falco')
  })
})

describe('getDependencyNotes', () => {
  it('generates human-readable notes for known integrations', () => {
    const projects: PayloadProject[] = [
      { name: 'cert-manager', displayName: 'Cert Manager', priority: 'required', dependencies: [], category: 'Security' },
      { name: 'istio', displayName: 'Istio', priority: 'required', dependencies: ['cert-manager'], category: 'Networking' },
    ]
    
    const notes = getDependencyNotes(projects)
    expect(notes).toContain('cert-manager provides TLS certificates that Istio uses for mTLS between services')
  })
})

describe('DeployModeInfoPanel', () => {
  it('renders phased rollout details', () => {
    const projects: PayloadProject[] = [
      { name: 'helm', displayName: 'Helm', priority: 'required', dependencies: [], category: 'Security' }
    ]
    render(
      <DeployModeInfoPanel
        mode="phased"
        phases={[]}
        projects={projects}
        installedProjects={new Set()}
      />
    )
    
    expect(screen.getByText('Phased Rollout')).toBeDefined()
    expect(screen.getByText('Core Infrastructure')).toBeDefined() // Auto-generated phase
    expect(screen.getByText('Time Estimate')).toBeDefined()
  })

  it('renders YOLO mode details', () => {
    render(
      <DeployModeInfoPanel
        mode="yolo"
        phases={[]}
        projects={[]}
        installedProjects={new Set()}
      />
    )
    
    expect(screen.getByText('YOLO Mode')).toBeDefined()
    expect(screen.getByText('Considerations')).toBeDefined()
  })
})
