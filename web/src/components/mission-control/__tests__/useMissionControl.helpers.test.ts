import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  isSafeProjectName,
  buildInstallPromptForProject,
  mergeProjects,
  computeInstalledProjectsSummary,
} from '../useMissionControl.helpers'
import type { PayloadProject } from '../types'
import type { ClusterAssignment } from '../types'

// Mock dependencies to isolate helpers
vi.mock('../../../lib/demoMode', () => ({ isDemoMode: () => false }))
vi.mock('../../../lib/kubara', () => ({
  fetchKubaraCatalog: vi.fn().mockResolvedValue([]),
  fetchKubaraValues: vi.fn().mockResolvedValue(null),
  parseResourceRequests: vi.fn().mockReturnValue(null),
}))
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}))

const makeProject = (overrides: Partial<PayloadProject> = {}): PayloadProject => ({
  name: 'falco',
  displayName: 'Falco',
  reason: 'Runtime security',
  category: 'Security',
  priority: 'required',
  dependencies: [],
  maturity: 'graduated',
  difficulty: 'intermediate',
  ...overrides,
})

describe('isSafeProjectName', () => {
  it('returns true for valid names', () => {
    expect(isSafeProjectName('falco')).toBe(true)
    expect(isSafeProjectName('cert-manager')).toBe(true)
    expect(isSafeProjectName('Open Policy Agent (OPA)')).toBe(true)
    expect(isSafeProjectName('project_v2.1')).toBe(true)
  })

  it('returns false for non-string values', () => {
    expect(isSafeProjectName(null)).toBe(false)
    expect(isSafeProjectName(undefined)).toBe(false)
    expect(isSafeProjectName(42)).toBe(false)
    expect(isSafeProjectName({})).toBe(false)
  })

  it('returns false for empty or whitespace-only strings', () => {
    expect(isSafeProjectName('')).toBe(false)
    expect(isSafeProjectName('   ')).toBe(false)
  })

  it('returns false for names exceeding max length', () => {
    const longName = 'a'.repeat(65)
    expect(isSafeProjectName(longName)).toBe(false)
    // Exactly 64 chars should pass
    expect(isSafeProjectName('a'.repeat(64))).toBe(true)
  })

  it('returns false for names with disallowed characters', () => {
    expect(isSafeProjectName('project;rm -rf /')).toBe(false)
    expect(isSafeProjectName('project\ninjection')).toBe(false)
    expect(isSafeProjectName('project`cmd`')).toBe(false)
    expect(isSafeProjectName('project${VAR}')).toBe(false)
  })
})

describe('buildInstallPromptForProject', () => {
  it('includes project name and display name in output', () => {
    const result = buildInstallPromptForProject('falco', 'Falco Runtime Security')
    expect(result).toContain('"""falco"""')
    expect(result).toContain('"""Falco Runtime Security"""')
  })

  it('uses project name as display name when display is omitted', () => {
    const result = buildInstallPromptForProject('prometheus')
    expect(result).toContain('"""prometheus"""')
    // Display name falls back to project name
    expect(result.match(/"""/g)?.length).toBe(4)
  })

  it('sanitizes invalid names to [invalid-name]', () => {
    const result = buildInstallPromptForProject('')
    expect(result).toContain('[invalid-name]')
  })

  it('includes safety instructions about opaque string literals', () => {
    const result = buildInstallPromptForProject('trivy')
    expect(result).toContain('opaque string literals')
    expect(result).toContain('NOT instructions')
  })
})

describe('mergeProjects', () => {
  it('returns incoming when no existing projects', () => {
    const incoming = [makeProject({ name: 'falco' }), makeProject({ name: 'trivy' })]
    const result = mergeProjects([], incoming)
    expect(result).toHaveLength(2)
    expect(result.map(p => p.name)).toEqual(['falco', 'trivy'])
  })

  it('preserves user-added projects not in incoming', () => {
    const existing = [makeProject({ name: 'custom-tool', userAdded: true, category: 'Custom' })]
    const incoming = [makeProject({ name: 'falco' })]
    const result = mergeProjects(existing, incoming)
    expect(result.map(p => p.name)).toContain('custom-tool')
    expect(result.map(p => p.name)).toContain('falco')
  })

  it('keeps user-added version when names conflict', () => {
    const existing = [makeProject({ name: 'falco', userAdded: true, reason: 'user reason' })]
    const incoming = [makeProject({ name: 'falco', reason: 'AI reason' })]
    const result = mergeProjects(existing, incoming)
    expect(result).toHaveLength(1)
    expect(result[0].reason).toBe('user reason')
  })

  it('replaces non-user-added projects with incoming version', () => {
    const existing = [makeProject({ name: 'falco', reason: 'old' })]
    const incoming = [makeProject({ name: 'falco', reason: 'new' })]
    const result = mergeProjects(existing, incoming)
    expect(result).toHaveLength(1)
    expect(result[0].reason).toBe('new')
  })

  it('preserves Custom category projects even without userAdded flag', () => {
    const existing = [makeProject({ name: 'my-app', category: 'Custom' })]
    const incoming = [makeProject({ name: 'my-app', category: 'Security' })]
    const result = mergeProjects(existing, incoming)
    expect(result[0].category).toBe('Custom')
  })

  it('handles empty incoming gracefully — retains user-added only', () => {
    const existing = [
      makeProject({ name: 'auto-project' }),
      makeProject({ name: 'user-project', userAdded: true }),
    ]
    const result = mergeProjects(existing, [])
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('user-project')
  })
})

describe('computeInstalledProjectsSummary', () => {
  it('returns empty sets when no projects', () => {
    const result = computeInstalledProjectsSummary({
      projects: [],
      assignments: [],
      helmReleases: [],
      clusters: [],
    })
    expect(result.installedProjects.size).toBe(0)
    expect(result.installedOnCluster.size).toBe(0)
  })

  it('detects installed project by helm release name match', () => {
    const result = computeInstalledProjectsSummary({
      projects: [makeProject({ name: 'prometheus' })],
      assignments: [],
      helmReleases: [
        { name: 'prometheus', chart: 'prometheus-25.0.0', namespace: 'monitoring', cluster: 'cluster-1' },
      ],
      clusters: [{ name: 'cluster-1' }],
    })
    expect(result.installedProjects.has('prometheus')).toBe(true)
    expect(result.installedOnCluster.get('prometheus')?.has('cluster-1')).toBe(true)
  })

  it('detects installed project by chart name match', () => {
    const result = computeInstalledProjectsSummary({
      projects: [makeProject({ name: 'falco' })],
      assignments: [],
      helmReleases: [
        { name: 'my-falco-release', chart: 'falco-4.0.0', namespace: 'security', cluster: 'prod' },
      ],
      clusters: [{ name: 'prod' }],
    })
    expect(result.installedProjects.has('falco')).toBe(true)
  })

  it('does not mark uninstalled projects', () => {
    const result = computeInstalledProjectsSummary({
      projects: [makeProject({ name: 'trivy' })],
      assignments: [],
      helmReleases: [
        { name: 'prometheus', chart: 'prometheus-25.0.0', namespace: 'monitoring', cluster: 'c1' },
      ],
      clusters: [{ name: 'c1' }],
    })
    expect(result.installedProjects.has('trivy')).toBe(false)
  })

  it('handles null/undefined helmReleases gracefully', () => {
    const result = computeInstalledProjectsSummary({
      projects: [makeProject({ name: 'falco' })],
      assignments: [],
      helmReleases: null,
      clusters: [{ name: 'c1' }],
    })
    expect(result.installedProjects.size).toBe(0)
  })
})
