import { describe, it, expect } from 'vitest'
import {
  FLUX_DEMO_DATA,
  type FluxStatusData,
  type FluxResourceKind,
  type FluxResourceStatus,
  type FluxResourceSummary,
} from '../flux_status/demoData'

describe('FLUX_DEMO_DATA', () => {
  it('is defined', () => {
    expect(FLUX_DEMO_DATA).toBeDefined()
  })

  it('has valid health status', () => {
    const valid: FluxStatusData['health'][] = ['healthy', 'degraded', 'not-installed']
    expect(valid).toContain(FLUX_DEMO_DATA.health)
  })

  it('has valid lastCheckTime ISO string', () => {
    expect(() => new Date(FLUX_DEMO_DATA.lastCheckTime)).not.toThrow()
    expect(new Date(FLUX_DEMO_DATA.lastCheckTime).getTime()).toBeGreaterThan(0)
  })

  describe('sources summary', () => {
    it('has numeric totals', () => {
      const { sources } = FLUX_DEMO_DATA
      expect(typeof sources.total).toBe('number')
      expect(typeof sources.ready).toBe('number')
      expect(typeof sources.notReady).toBe('number')
    })

    it('ready + notReady equals total', () => {
      const { sources } = FLUX_DEMO_DATA
      expect(sources.ready + sources.notReady).toBe(sources.total)
    })

    it('ready and notReady are non-negative', () => {
      expect(FLUX_DEMO_DATA.sources.ready).toBeGreaterThanOrEqual(0)
      expect(FLUX_DEMO_DATA.sources.notReady).toBeGreaterThanOrEqual(0)
    })
  })

  describe('kustomizations summary', () => {
    it('has numeric totals', () => {
      const { kustomizations } = FLUX_DEMO_DATA
      expect(typeof kustomizations.total).toBe('number')
      expect(typeof kustomizations.ready).toBe('number')
      expect(typeof kustomizations.notReady).toBe('number')
    })

    it('ready + notReady equals total', () => {
      const { kustomizations } = FLUX_DEMO_DATA
      expect(kustomizations.ready + kustomizations.notReady).toBe(kustomizations.total)
    })
  })

  describe('helmReleases summary', () => {
    it('has numeric totals', () => {
      const { helmReleases } = FLUX_DEMO_DATA
      expect(typeof helmReleases.total).toBe('number')
      expect(typeof helmReleases.ready).toBe('number')
      expect(typeof helmReleases.notReady).toBe('number')
    })

    it('ready + notReady equals total', () => {
      const { helmReleases } = FLUX_DEMO_DATA
      expect(helmReleases.ready + helmReleases.notReady).toBe(helmReleases.total)
    })
  })

  describe('resources.sources', () => {
    it('is an array', () => {
      expect(Array.isArray(FLUX_DEMO_DATA.resources.sources)).toBe(true)
    })

    it('count matches sources.total', () => {
      expect(FLUX_DEMO_DATA.resources.sources.length).toBe(FLUX_DEMO_DATA.sources.total)
    })

    it('each source has required fields', () => {
      const validKinds: FluxResourceKind[] = ['GitRepository', 'Kustomization', 'HelmRelease']
      for (const src of FLUX_DEMO_DATA.resources.sources) {
        expect(validKinds).toContain(src.kind)
        expect(typeof src.name).toBe('string')
        expect(src.name.length).toBeGreaterThan(0)
        expect(typeof src.namespace).toBe('string')
        expect(typeof src.cluster).toBe('string')
        expect(typeof src.ready).toBe('boolean')
      }
    })

    it('not-ready sources have a reason', () => {
      for (const src of FLUX_DEMO_DATA.resources.sources) {
        if (!src.ready) {
          expect(typeof src.reason).toBe('string')
        }
      }
    })
  })

  describe('resources.kustomizations', () => {
    it('count matches kustomizations.total', () => {
      expect(FLUX_DEMO_DATA.resources.kustomizations.length).toBe(
        FLUX_DEMO_DATA.kustomizations.total,
      )
    })

    it('each kustomization has kind Kustomization', () => {
      for (const k of FLUX_DEMO_DATA.resources.kustomizations) {
        expect(k.kind).toBe('Kustomization')
      }
    })
  })

  describe('resources.helmReleases', () => {
    it('count matches helmReleases.total', () => {
      expect(FLUX_DEMO_DATA.resources.helmReleases.length).toBe(
        FLUX_DEMO_DATA.helmReleases.total,
      )
    })

    it('each release has kind HelmRelease', () => {
      for (const hr of FLUX_DEMO_DATA.resources.helmReleases) {
        expect(hr.kind).toBe('HelmRelease')
      }
    })
  })
})
