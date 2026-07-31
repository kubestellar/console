import { describe, it, expect } from 'vitest'
import { resolveKbPath } from '../FlightPlanBlueprint.utils'
import type { PayloadProject } from '../types'

function makeProject(overrides: Partial<PayloadProject> = {}): PayloadProject {
  return {
    name: 'falco',
    displayName: 'Falco Runtime Security',
    reason: 'runtime security',
    category: 'Security',
    priority: 'required',
    dependencies: [],
    ...overrides,
  }
}

describe('resolveKbPath', () => {
  it('returns the explicit kbPath when set', () => {
    const proj = makeProject({ kbPath: 'fixes/custom/install-falco.json' })
    expect(resolveKbPath(proj)).toBe('fixes/custom/install-falco.json')
  })

  it('preserves the explicit kbPath even when it does not match convention', () => {
    const proj = makeProject({
      name: 'Some Project',
      kbPath: 'totally/different/path.json',
    })
    expect(resolveKbPath(proj)).toBe('totally/different/path.json')
  })

  it('returns the convention-based path when kbPath is missing', () => {
    const proj = makeProject({ name: 'prometheus' })
    expect(resolveKbPath(proj)).toBe(
      'fixes/cncf-install/install-prometheus.json',
    )
  })

  it('lowercases the project name for the convention slug', () => {
    const proj = makeProject({ name: 'Prometheus' })
    expect(resolveKbPath(proj)).toBe(
      'fixes/cncf-install/install-prometheus.json',
    )
  })

  it('replaces whitespace with dashes in the convention slug', () => {
    const proj = makeProject({ name: 'Open Policy Agent' })
    expect(resolveKbPath(proj)).toBe(
      'fixes/cncf-install/install-open-policy-agent.json',
    )
  })

  it('collapses runs of whitespace into a single dash', () => {
    const proj = makeProject({ name: 'Cert   Manager' })
    expect(resolveKbPath(proj)).toBe(
      'fixes/cncf-install/install-cert-manager.json',
    )
  })

  it('treats an empty string kbPath as missing and falls back to convention', () => {
    const proj = makeProject({ name: 'argo', kbPath: '' })
    expect(resolveKbPath(proj)).toBe('fixes/cncf-install/install-argo.json')
  })

  it('handles single-character names', () => {
    const proj = makeProject({ name: 'K' })
    expect(resolveKbPath(proj)).toBe('fixes/cncf-install/install-k.json')
  })
})
