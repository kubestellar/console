import { describe, it, expect } from 'vitest'
import {
  extractApiGroup,
  lookupProject,
  deduplicateProjects,
  API_GROUP_TO_PROJECT,
} from '../apiGroupMapping'

describe('extractApiGroup', () => {
  it('extracts API group from standard CRD apiVersion', () => {
    expect(extractApiGroup('ray.io/v1alpha1')).toBe('ray.io')
    expect(extractApiGroup('karmada.io/v1alpha2')).toBe('karmada.io')
    expect(extractApiGroup('argoproj.io/v1alpha1')).toBe('argoproj.io')
  })

  it('returns null for core API (v1)', () => {
    expect(extractApiGroup('v1')).toBeNull()
  })

  it('returns null for built-in API groups', () => {
    expect(extractApiGroup('apps/v1')).toBeNull()
    expect(extractApiGroup('batch/v1')).toBeNull()
    expect(extractApiGroup('rbac.authorization.k8s.io/v1')).toBeNull()
    expect(extractApiGroup('networking.k8s.io/v1')).toBeNull()
    expect(extractApiGroup('storage.k8s.io/v1')).toBeNull()
    expect(extractApiGroup('autoscaling/v2')).toBeNull()
  })

  it('extracts subdomain API groups', () => {
    expect(extractApiGroup('work.karmada.io/v1alpha2')).toBe('work.karmada.io')
    expect(extractApiGroup('security.istio.io/v1')).toBe('security.istio.io')
    expect(extractApiGroup('serving.knative.dev/v1')).toBe('serving.knative.dev')
  })
})

describe('lookupProject', () => {
  it('finds exact matches', () => {
    const result = lookupProject('ray.io')
    expect(result).not.toBeNull()
    expect(result!.project).toBe('kuberay')
    expect(result!.displayName).toBe('KubeRay')
    expect(result!.installMission).toBe('install-kuberay.json')
  })

  it('finds subdomain matches (config.karmada.io → karmada.io)', () => {
    const result = lookupProject('config.karmada.io')
    expect(result).not.toBeNull()
    expect(result!.project).toBe('karmada')
  })

  it('finds Istio subdomains', () => {
    expect(lookupProject('telemetry.istio.io')?.project).toBe('istio')
  })

  it('finds Flux subdomains', () => {
    expect(lookupProject('helm.toolkit.fluxcd.io')?.project).toBe('flux')
    expect(lookupProject('source.toolkit.fluxcd.io')?.project).toBe('flux')
  })

  it('returns null for unknown API groups', () => {
    expect(lookupProject('custom.example.com')).toBeNull()
    expect(lookupProject('totally.unknown.io')).toBeNull()
  })

  it('maps all expected projects', () => {
    const expectedProjects = [
      'kuberay', 'karmada', 'argocd', 'cert-manager', 'prometheus',
      'strimzi', 'flux', 'istio', 'keda', 'crossplane', 'velero',
      'falco', 'harbor', 'longhorn', 'kubevirt', 'knative',
    ]
    for (const project of expectedProjects) {
      const entries = Object.values(API_GROUP_TO_PROJECT).filter(m => m.project === project)
      expect(entries.length, `No mapping found for project: ${project}`).toBeGreaterThan(0)
    }
  })
})

describe('deduplicateProjects', () => {
  it('removes duplicate projects', () => {
    const karmada1 = API_GROUP_TO_PROJECT['karmada.io']
    const karmada2 = API_GROUP_TO_PROJECT['work.karmada.io']
    const result = deduplicateProjects([karmada1, karmada2])
    expect(result).toHaveLength(1)
    expect(result[0].project).toBe('karmada')
  })

  it('keeps distinct projects', () => {
    const kuberay = API_GROUP_TO_PROJECT['ray.io']
    const karmada = API_GROUP_TO_PROJECT['karmada.io']
    const result = deduplicateProjects([kuberay, karmada])
    expect(result).toHaveLength(2)
  })

  it('handles empty input', () => {
    expect(deduplicateProjects([])).toHaveLength(0)
  })
})
