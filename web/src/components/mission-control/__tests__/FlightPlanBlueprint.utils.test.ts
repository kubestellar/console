import { describe, it, expect } from 'vitest'
import type { PayloadProject } from '../types'
import { resolveKbPath } from '../FlightPlanBlueprint.utils'

function project(overrides: Partial<PayloadProject>): PayloadProject {
  return {
    name: overrides.name ?? 'p',
    displayName: overrides.displayName ?? 'P',
    reason: overrides.reason ?? '',
    category: overrides.category ?? 'observability',
    priority: overrides.priority ?? 'recommended',
    dependencies: overrides.dependencies ?? [],
    ...overrides,
  }
}

describe('resolveKbPath', () => {
  it('returns the explicit kbPath when provided', () => {
    const proj = project({ name: 'Foo', kbPath: 'fixes/custom/foo.json' })
    expect(resolveKbPath(proj)).toBe('fixes/custom/foo.json')
  })

  it('derives a convention-based path from a lowercased single-word name', () => {
    expect(resolveKbPath(project({ name: 'falco' }))).toBe(
      'fixes/cncf-install/install-falco.json',
    )
  })

  it('lowercases mixed-case names', () => {
    expect(resolveKbPath(project({ name: 'Falco' }))).toBe(
      'fixes/cncf-install/install-falco.json',
    )
  })

  it('replaces whitespace runs with a single hyphen', () => {
    expect(resolveKbPath(project({ name: 'Cert Manager' }))).toBe(
      'fixes/cncf-install/install-cert-manager.json',
    )
    expect(resolveKbPath(project({ name: '  spaced   out  ' }))).toBe(
      'fixes/cncf-install/install--spaced-out-.json',
    )
  })

  it('prefers explicit kbPath even when it is a non-conventional path', () => {
    const proj = project({ name: 'Falco', kbPath: '/absolute/override.json' })
    expect(resolveKbPath(proj)).toBe('/absolute/override.json')
  })
})
