import { describe, it, expect } from 'vitest'
import { buildAllResources, getStatusBgColor } from '../namespaceResourceUtils'
import type { BuildAllResourcesParams } from '../namespaceResourceUtils'

const emptyParams: BuildAllResourcesParams = {
  deployments: [],
  pods: [],
  services: [],
  jobs: [],
  hpas: [],
  configmaps: [],
  secrets: [],
  serviceAccounts: [],
  pvcs: [],
}

describe('buildAllResources', () => {
  it('returns an empty list when every input is empty', () => {
    expect(buildAllResources(emptyParams)).toEqual([])
  })

  it('includes deployments with the correct kind and detail', () => {
    const result = buildAllResources({
      ...emptyParams,
      deployments: [{ name: 'api', namespace: 'default', status: 'running', replicas: 3, readyReplicas: 3, updatedReplicas: 3, availableReplicas: 3, progress: 100 }],
    })
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ kind: 'Deployment', name: 'api', statusColor: 'green', detail: '3/3' })
  })

  it('includes pods', () => {
    const result = buildAllResources({
      ...emptyParams,
      pods: [{ name: 'pod-1', namespace: 'default', status: 'Running', ready: '1/1', restarts: 0, age: '1d' }],
    })
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ kind: 'Pod', name: 'pod-1', statusColor: 'green', detail: '1/1' })
  })

  it('includes services and marks a LoadBalancer with no externalIP as provisioning', () => {
    const result = buildAllResources({
      ...emptyParams,
      services: [{ name: 'svc-1', namespace: 'default', type: 'LoadBalancer' }],
    })
    expect(result).toHaveLength(1)
    expect(result[0].kind).toBe('Service')
    expect(result[0].data?.externalIP).toBe('Provisioning')
  })

  it('shows the actual externalIP for a provisioned LoadBalancer service', () => {
    const result = buildAllResources({
      ...emptyParams,
      services: [{ name: 'svc-1', namespace: 'default', type: 'LoadBalancer', externalIP: '1.2.3.4' }],
    })
    expect(result[0].data?.externalIP).toBe('1.2.3.4')
  })

  it('does not mark non-LoadBalancer services as provisioning', () => {
    const result = buildAllResources({
      ...emptyParams,
      services: [{ name: 'svc-1', namespace: 'default', type: 'ClusterIP' }],
    })
    expect(result[0].data?.externalIP).toBeUndefined()
  })

  it('includes jobs', () => {
    const result = buildAllResources({
      ...emptyParams,
      jobs: [{ name: 'job-1', namespace: 'default', status: 'Complete', completions: '1/1' }],
    })
    expect(result[0]).toMatchObject({ kind: 'Job', statusColor: 'green', detail: '1/1' })
  })

  it('includes HPAs, ConfigMaps, Secrets, ServiceAccounts, and PVCs', () => {
    const result = buildAllResources({
      ...emptyParams,
      hpas: [{ name: 'hpa-1', namespace: 'default', reference: 'deploy/api', minReplicas: 1, maxReplicas: 5, currentReplicas: 2 }],
      configmaps: [{ name: 'cm-1', namespace: 'default', dataCount: 3 }],
      secrets: [{ name: 'secret-1', namespace: 'default', type: 'Opaque', dataCount: 2 }],
      serviceAccounts: [{ name: 'sa-1', namespace: 'default', secrets: ['s1'] }],
      pvcs: [{ name: 'pvc-1', namespace: 'default', status: 'Bound', capacity: '10Gi' }],
    })
    const kinds = result.map(r => r.kind)
    expect(kinds).toEqual(['HPA', 'ConfigMap', 'Secret', 'ServiceAccount', 'PVC'])
    expect(result.find(r => r.kind === 'PVC')).toMatchObject({ statusColor: 'green', detail: '10Gi' })
  })

  it('handles a serviceAccount with no secrets gracefully', () => {
    const result = buildAllResources({
      ...emptyParams,
      serviceAccounts: [{ name: 'sa-1', namespace: 'default' }],
    })
    expect(result[0].status).toBe('0 secrets')
  })
})

describe('getStatusBgColor', () => {
  it.each([
    ['green', 'bg-green-500/20 text-green-400'],
    ['blue', 'bg-blue-500/20 text-blue-400'],
    ['yellow', 'bg-yellow-500/20 text-yellow-400'],
    ['red', 'bg-red-500/20 text-red-400'],
    ['cyan', 'bg-cyan-500/20 text-cyan-400'],
    ['purple', 'bg-purple-500/20 text-purple-400'],
    ['orange', 'bg-orange-500/20 text-orange-400'],
  ])('maps %s to the expected classes', (color, expected) => {
    expect(getStatusBgColor(color)).toBe(expected)
  })

  it('falls back to the default gray classes for unknown colors', () => {
    expect(getStatusBgColor('not-a-color')).toBe('bg-gray-500/20 text-muted-foreground dark:bg-gray-400/20')
  })
})
