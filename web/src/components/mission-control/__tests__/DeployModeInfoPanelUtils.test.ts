import { describe, it, expect } from 'vitest'
import { getDependencyNotes, generateDefaultPhases } from '../DeployModeInfoPanelUtils'
import type { PayloadProject } from '../types'

function project(overrides: Partial<PayloadProject> & Pick<PayloadProject, 'name'>): PayloadProject {
  return {
    displayName: overrides.name,
    reason: 'test',
    category: 'test',
    priority: 'recommended',
    dependencies: [],
    ...overrides,
  }
}

describe('getDependencyNotes', () => {
  it('returns [] for an empty payload', () => {
    expect(getDependencyNotes([])).toEqual([])
  })

  it('returns [] when no known dep matrix entry matches', () => {
    const projects = [
      project({ name: 'unknown-a', dependencies: ['unknown-b'] }),
      project({ name: 'unknown-b' }),
    ]
    expect(getDependencyNotes(projects)).toEqual([])
  })

  it('surfaces a forward-match note (project depends on a listed dep present in payload)', () => {
    const projects = [
      project({ name: 'istio', dependencies: ['cert-manager'] }),
      project({ name: 'cert-manager' }),
    ]
    const notes = getDependencyNotes(projects)
    expect(notes).toContain(
      'cert-manager provides TLS certificates that Istio uses for mTLS between services',
    )
  })

  it('does not emit a forward-match note when the dep is not in the payload', () => {
    // cert-manager is a dependency but only present in the notes matrix, not in the payload.
    const projects = [project({ name: 'istio', dependencies: ['cert-manager'] })]
    expect(getDependencyNotes(projects)).toEqual([])
  })

  it('emits a wildcard note when the dep is listed with a * entry (helm)', () => {
    const projects = [project({ name: 'anything', dependencies: ['helm'] })]
    expect(getDependencyNotes(projects)).toEqual([
      'Helm must be available on the cluster before any Helm-based installations',
    ])
  })

  it('emits reverse-mapping notes (dep-in-payload triggers note about downstream target)', () => {
    // prometheus is the "source" in the notes matrix; falco is a target.
    // Neither project declares dependencies, but the reverse walk should still surface the note.
    const projects = [project({ name: 'prometheus' }), project({ name: 'falco' })]
    expect(getDependencyNotes(projects)).toContain(
      'Falco exports metrics to Prometheus for runtime security alerting',
    )
  })

  it('deduplicates notes even when the same note would be emitted twice', () => {
    // helm's wildcard note can be triggered by each project depending on helm; ensure we get it once.
    const projects = [
      project({ name: 'a', dependencies: ['helm'] }),
      project({ name: 'b', dependencies: ['helm'] }),
    ]
    const notes = getDependencyNotes(projects)
    const helmNote = 'Helm must be available on the cluster before any Helm-based installations'
    expect(notes.filter((n) => n === helmNote)).toHaveLength(1)
  })

  it('emits multiple distinct notes when several matrix entries apply', () => {
    const projects = [
      project({ name: 'cert-manager' }),
      project({ name: 'istio', dependencies: ['cert-manager'] }),
      project({ name: 'prometheus' }),
      project({ name: 'falco' }),
    ]
    const notes = getDependencyNotes(projects)
    expect(notes).toEqual(expect.arrayContaining([
      'cert-manager provides TLS certificates that Istio uses for mTLS between services',
      'Falco exports metrics to Prometheus for runtime security alerting',
    ]))
    // No duplicates.
    expect(new Set(notes).size).toBe(notes.length)
  })
})

describe('generateDefaultPhases', () => {
  it('returns [] for an empty payload', () => {
    expect(generateDefaultPhases([])).toEqual([])
  })

  it('places known infra projects in phase 1 with correct estimate', () => {
    const projects = [project({ name: 'helm' }), project({ name: 'cert-manager' })]
    const phases = generateDefaultPhases(projects)
    expect(phases).toHaveLength(1)
    expect(phases[0]).toMatchObject({
      phase: 1,
      name: 'Core Infrastructure',
      projectNames: ['helm', 'cert-manager'],
      // 2 projects * 180s + 120s overhead = 480s
      estimatedSeconds: 480,
    })
  })

  it('promotes a project to phase 1 when it is a dependency of another project', () => {
    // "custom-infra" is not in the built-in infra name set, but is a dependency of "app".
    const projects = [
      project({ name: 'app', dependencies: ['custom-infra'], priority: 'required' }),
      project({ name: 'custom-infra' }),
    ]
    const phases = generateDefaultPhases(projects)
    const phase1 = phases.find((p) => p.name === 'Core Infrastructure')
    expect(phase1?.projectNames).toContain('custom-infra')
    // The consumer "app" (priority=required) should land in phase 2.
    const phase2 = phases.find((p) => p.name === 'Security & Networking')
    expect(phase2?.projectNames).toEqual(['app'])
  })

  it('places non-infra required projects in phase 2 with correct estimate', () => {
    const projects = [project({ name: 'falco', priority: 'required' })]
    const phases = generateDefaultPhases(projects)
    expect(phases).toEqual([
      {
        phase: 1,
        name: 'Security & Networking',
        projectNames: ['falco'],
        // 1 project * 210s + 120s overhead = 330s
        estimatedSeconds: 330,
      },
    ])
  })

  it('places non-infra, non-required projects in phase 3 with correct estimate', () => {
    const projects = [
      project({ name: 'grafana', priority: 'optional' }),
      project({ name: 'loki', priority: 'recommended' }),
    ]
    const phases = generateDefaultPhases(projects)
    expect(phases).toEqual([
      {
        phase: 1,
        name: 'Monitoring & Services',
        projectNames: ['grafana', 'loki'],
        // 2 projects * 150s + 60s overhead = 360s
        estimatedSeconds: 360,
      },
    ])
  })

  it('compacts phase numbering when the middle bucket is empty', () => {
    // helm → phase 1 (infra); grafana → phase 3 (leftover). Phase 2 is empty and skipped.
    const projects = [project({ name: 'helm' }), project({ name: 'grafana', priority: 'optional' })]
    const phases = generateDefaultPhases(projects)
    expect(phases.map((p) => p.name)).toEqual(['Core Infrastructure', 'Monitoring & Services'])
    // Numbering compacts: 1, 2 (not 1, 3).
    expect(phases.map((p) => p.phase)).toEqual([1, 2])
  })

  it('produces all three phases in order when each bucket is populated', () => {
    const projects = [
      project({ name: 'helm' }),
      project({ name: 'falco', priority: 'required' }),
      project({ name: 'grafana', priority: 'optional' }),
    ]
    const phases = generateDefaultPhases(projects)
    expect(phases.map((p) => p.name)).toEqual([
      'Core Infrastructure',
      'Security & Networking',
      'Monitoring & Services',
    ])
    expect(phases.map((p) => p.phase)).toEqual([1, 2, 3])
  })

  it('never places a project in more than one phase', () => {
    // cert-manager is a known infra project AND priority=required — must not double-count.
    const projects = [
      project({ name: 'cert-manager', priority: 'required' }),
      project({ name: 'falco', priority: 'required' }),
    ]
    const phases = generateDefaultPhases(projects)
    const allNames = phases.flatMap((p) => p.projectNames)
    expect(allNames).toEqual(Array.from(new Set(allNames)))
    // cert-manager belongs to infra, not security.
    expect(phases.find((p) => p.name === 'Core Infrastructure')?.projectNames).toContain('cert-manager')
    expect(phases.find((p) => p.name === 'Security & Networking')?.projectNames).not.toContain('cert-manager')
  })
})
