import { describe, expect, it } from 'vitest'
import { __testables } from '../useFluxStatus'
import type { FluxResourceStatus } from '../demoData'

describe('flux_status helpers', () => {
  it('marks deployed helm release as ready', () => {
    expect(__testables.isHelmReleaseReady('deployed')).toBe(true)
    expect(__testables.isHelmReleaseReady('superseded')).toBe(true)
    expect(__testables.isHelmReleaseReady('failed')).toBe(false)
  })

  it('extracts Ready condition status and reason', () => {
    const ready = __testables.getReadyCondition({
      conditions: [{ type: 'Ready', status: 'True', reason: 'Succeeded' }],
    })
    expect(ready).toEqual({ ready: true, reason: 'Succeeded' })

    const notReady = __testables.getReadyCondition({
      conditions: [{ type: 'Ready', status: 'False', reason: 'AuthenticationFailed' }],
    })
    expect(notReady).toEqual({ ready: false, reason: 'AuthenticationFailed' })
  })

  it('builds not-installed status when all sections are empty', () => {
    const data = __testables.buildFluxStatus([], [], [])
    expect(data.health).toBe('not-installed')
    expect(data.sources.total).toBe(0)
    expect(data.kustomizations.total).toBe(0)
    expect(data.helmReleases.total).toBe(0)
  })

  it('builds degraded status when any resource is not ready', () => {
    const sources: FluxResourceStatus[] = [
      {
        kind: 'GitRepository',
        name: 'flux-system',
        namespace: 'flux-system',
        cluster: 'dev',
        ready: true,
      },
    ]
    const kustomizations: FluxResourceStatus[] = [
      {
        kind: 'Kustomization',
        name: 'apps',
        namespace: 'flux-system',
        cluster: 'dev',
        ready: false,
      },
    ]

    const data = __testables.buildFluxStatus(sources, kustomizations, [])
    expect(data.health).toBe('degraded')
    expect(data.kustomizations.notReady).toBe(1)
  })
})
