import { describe, it, expect } from 'vitest'
import {
  computeIntotoStats,
  buildClusterStatus,
  emptyStatus,
  transformLayoutResources,
  applyLinkStatuses,
  markMissingSteps,
} from '../transforms'
import type { IntotoLayout, IntotoLayoutResource, IntotoLinkResource } from '../types'

describe('computeIntotoStats', () => {
  it('returns zero stats for empty array', () => {
    const stats = computeIntotoStats([])
    expect(stats).toEqual({
      totalLayouts: 0,
      totalSteps: 0,
      verifiedSteps: 0,
      failedSteps: 0,
      missingSteps: 0,
    })
  })

  it('computes stats for single layout', () => {
    const layouts: IntotoLayout[] = [
      {
        name: 'test-layout',
        cluster: 'prod',
        namespace: 'default',
        steps: [
          { name: 'step1', status: 'verified', functionary: 'alice', linksFound: 1 },
          { name: 'step2', status: 'failed', functionary: 'bob', linksFound: 1 },
        ],
        expectedProducts: 2,
        verifiedSteps: 1,
        failedSteps: 1,
        createdAt: '2024-01-01T00:00:00Z',
      },
    ]

    const stats = computeIntotoStats(layouts)
    expect(stats).toEqual({
      totalLayouts: 1,
      totalSteps: 2,
      verifiedSteps: 1,
      failedSteps: 1,
      missingSteps: 0,
    })
  })

  it('aggregates stats across multiple layouts', () => {
    const layouts: IntotoLayout[] = [
      {
        name: 'layout1',
        cluster: 'prod',
        namespace: 'default',
        steps: [
          { name: 'step1', status: 'verified', functionary: 'alice', linksFound: 1 },
          { name: 'step2', status: 'verified', functionary: 'bob', linksFound: 1 },
        ],
        expectedProducts: 2,
        verifiedSteps: 2,
        failedSteps: 0,
        createdAt: '2024-01-01T00:00:00Z',
      },
      {
        name: 'layout2',
        cluster: 'prod',
        namespace: 'default',
        steps: [
          { name: 'step3', status: 'failed', functionary: 'charlie', linksFound: 1 },
        ],
        expectedProducts: 1,
        verifiedSteps: 0,
        failedSteps: 1,
        createdAt: '2024-01-01T00:00:00Z',
      },
    ]

    const stats = computeIntotoStats(layouts)
    expect(stats).toEqual({
      totalLayouts: 2,
      totalSteps: 3,
      verifiedSteps: 2,
      failedSteps: 1,
      missingSteps: 0,
    })
  })

  it('calculates missing steps correctly', () => {
    const layouts: IntotoLayout[] = [
      {
        name: 'layout',
        cluster: 'prod',
        namespace: 'default',
        steps: [
          { name: 'step1', status: 'verified', functionary: 'alice', linksFound: 1 },
          { name: 'step2', status: 'unknown', functionary: 'bob', linksFound: 0 },
          { name: 'step3', status: 'unknown', functionary: 'charlie', linksFound: 0 },
        ],
        expectedProducts: 3,
        verifiedSteps: 1,
        failedSteps: 0,
        createdAt: '2024-01-01T00:00:00Z',
      },
    ]

    const stats = computeIntotoStats(layouts)
    expect(stats.missingSteps).toBe(2) // 3 total - 1 verified - 0 failed
  })

  it('handles null layouts gracefully', () => {
    const stats = computeIntotoStats(null as unknown as IntotoLayout[])
    expect(stats.totalLayouts).toBe(0)
  })
})

describe('buildClusterStatus', () => {
  it('creates cluster status with computed stats', () => {
    const layouts: IntotoLayout[] = [
      {
        name: 'layout1',
        cluster: 'prod',
        namespace: 'default',
        steps: [
          { name: 'step1', status: 'verified', functionary: 'alice', linksFound: 1 },
        ],
        expectedProducts: 1,
        verifiedSteps: 1,
        failedSteps: 0,
        createdAt: '2024-01-01T00:00:00Z',
      },
    ]

    const status = buildClusterStatus('prod', layouts)
    expect(status).toMatchObject({
      cluster: 'prod',
      installed: true,
      loading: false,
      layouts,
      totalLayouts: 1,
      totalSteps: 1,
      verifiedSteps: 1,
      failedSteps: 0,
      missingSteps: 0,
    })
  })

  it('creates status for empty layouts', () => {
    const status = buildClusterStatus('prod', [])
    expect(status.cluster).toBe('prod')
    expect(status.layouts).toEqual([])
    expect(status.totalLayouts).toBe(0)
  })
})

describe('emptyStatus', () => {
  it('creates empty status when installed', () => {
    const status = emptyStatus('prod', true)
    expect(status).toEqual({
      cluster: 'prod',
      installed: true,
      loading: false,
      layouts: [],
      totalLayouts: 0,
      totalSteps: 0,
      verifiedSteps: 0,
      failedSteps: 0,
      missingSteps: 0,
    })
  })

  it('creates empty status when not installed', () => {
    const status = emptyStatus('dev', false)
    expect(status.installed).toBe(false)
  })

  it('includes error message when provided', () => {
    const status = emptyStatus('prod', true, 'Connection failed')
    expect(status.error).toBe('Connection failed')
  })
})

describe('transformLayoutResources', () => {
  it('transforms layout resources to internal format', () => {
    const resources: IntotoLayoutResource[] = [
      {
        apiVersion: 'in-toto.io/v1alpha1',
        kind: 'Layout',
        metadata: {
          name: 'build-pipeline',
          namespace: 'default',
          creationTimestamp: '2024-01-01T00:00:00Z',
        },
        spec: {
          steps: [
            {
              name: 'code-review',
              pubkeys: ['alice-key', 'bob-key'],
              expectedMaterials: [],
              expectedProducts: [],
            },
            {
              name: 'build',
              pubkeys: ['builder-key'],
              expectedMaterials: [],
              expectedProducts: [],
            },
          ],
          inspections: [],
          keys: {},
        },
      },
    ]

    const layouts = transformLayoutResources('prod', resources)
    expect(layouts).toHaveLength(1)
    expect(layouts[0]).toMatchObject({
      name: 'build-pipeline',
      cluster: 'prod',
      namespace: 'default',
      expectedProducts: 2,
      verifiedSteps: 0,
      failedSteps: 0,
    })
    expect(layouts[0].steps).toHaveLength(2)
    expect(layouts[0].steps[0]).toMatchObject({
      name: 'code-review',
      status: 'unknown',
      functionary: 'alice-key, bob-key',
      linksFound: 0,
    })
  })

  it('handles empty resources', () => {
    const layouts = transformLayoutResources('prod', [])
    expect(layouts).toEqual([])
  })

  it('handles null resources', () => {
    const layouts = transformLayoutResources('prod', null as unknown as IntotoLayoutResource[])
    expect(layouts).toEqual([])
  })

  it('handles missing pubkeys', () => {
    const resources: IntotoLayoutResource[] = [
      {
        apiVersion: 'in-toto.io/v1alpha1',
        kind: 'Layout',
        metadata: {
          name: 'test',
          namespace: 'default',
          creationTimestamp: '2024-01-01T00:00:00Z',
        },
        spec: {
          steps: [
            {
              name: 'step1',
              expectedMaterials: [],
              expectedProducts: [],
            },
          ],
          inspections: [],
          keys: {},
        },
      },
    ]

    const layouts = transformLayoutResources('prod', resources)
    expect(layouts[0].steps[0].functionary).toBe('unknown')
  })
})

describe('applyLinkStatuses', () => {
  it('updates step status based on link verification', () => {
    const layouts: IntotoLayout[] = [
      {
        name: 'build-pipeline',
        cluster: 'prod',
        namespace: 'default',
        steps: [
          { name: 'code-review', status: 'unknown', functionary: 'alice', linksFound: 0 },
          { name: 'build', status: 'unknown', functionary: 'bob', linksFound: 0 },
        ],
        expectedProducts: 2,
        verifiedSteps: 0,
        failedSteps: 0,
        createdAt: '2024-01-01T00:00:00Z',
      },
    ]

    const links: IntotoLinkResource[] = [
      {
        apiVersion: 'in-toto.io/v1alpha1',
        kind: 'Link',
        metadata: {
          name: 'link1',
          namespace: 'default',
          labels: {
            'layout-name': 'build-pipeline',
            'step-name': 'code-review',
          },
        },
        spec: {
          name: 'code-review',
          materials: [],
          products: [],
          byproducts: {},
          command: [],
          environment: {},
        },
        status: {
          verified: true,
        },
      },
    ]

    applyLinkStatuses(layouts, links)
    expect(layouts[0].steps[0].status).toBe('verified')
    expect(layouts[0].steps[0].linksFound).toBe(1)
    expect(layouts[0].verifiedSteps).toBe(1)
  })

  it('marks step as failed when link verification fails', () => {
    const layouts: IntotoLayout[] = [
      {
        name: 'pipeline',
        cluster: 'prod',
        namespace: 'default',
        steps: [
          { name: 'test', status: 'unknown', functionary: 'alice', linksFound: 0 },
        ],
        expectedProducts: 1,
        verifiedSteps: 0,
        failedSteps: 0,
        createdAt: '2024-01-01T00:00:00Z',
      },
    ]

    const links: IntotoLinkResource[] = [
      {
        apiVersion: 'in-toto.io/v1alpha1',
        kind: 'Link',
        metadata: {
          name: 'link1',
          namespace: 'default',
          labels: {
            'layout-name': 'pipeline',
            'step-name': 'test',
          },
        },
        spec: {
          name: 'test',
          materials: [],
          products: [],
          byproducts: {},
          command: [],
          environment: {},
        },
        status: {
          verified: false,
        },
      },
    ]

    applyLinkStatuses(layouts, links)
    expect(layouts[0].steps[0].status).toBe('failed')
    expect(layouts[0].failedSteps).toBe(1)
  })

  it('skips links with missing layout name', () => {
    const layouts: IntotoLayout[] = [
      {
        name: 'pipeline',
        cluster: 'prod',
        namespace: 'default',
        steps: [
          { name: 'step', status: 'unknown', functionary: 'alice', linksFound: 0 },
        ],
        expectedProducts: 1,
        verifiedSteps: 0,
        failedSteps: 0,
        createdAt: '2024-01-01T00:00:00Z',
      },
    ]

    const links: IntotoLinkResource[] = [
      {
        apiVersion: 'in-toto.io/v1alpha1',
        kind: 'Link',
        metadata: {
          name: 'link1',
          namespace: 'default',
          labels: {},
        },
        spec: {
          name: 'step',
          materials: [],
          products: [],
          byproducts: {},
          command: [],
          environment: {},
        },
      },
    ]

    applyLinkStatuses(layouts, links)
    expect(layouts[0].steps[0].status).toBe('unknown')
    expect(layouts[0].steps[0].linksFound).toBe(0)
  })

  it('handles null links gracefully', () => {
    const layouts: IntotoLayout[] = [
      {
        name: 'pipeline',
        cluster: 'prod',
        namespace: 'default',
        steps: [
          { name: 'step', status: 'unknown', functionary: 'alice', linksFound: 0 },
        ],
        expectedProducts: 1,
        verifiedSteps: 0,
        failedSteps: 0,
        createdAt: '2024-01-01T00:00:00Z',
      },
    ]

    applyLinkStatuses(layouts, null as unknown as IntotoLinkResource[])
    expect(layouts[0].steps[0].status).toBe('unknown')
  })

  it('correctly updates counts when step status changes', () => {
    const layouts: IntotoLayout[] = [
      {
        name: 'pipeline',
        cluster: 'prod',
        namespace: 'default',
        steps: [
          { name: 'step', status: 'verified', functionary: 'alice', linksFound: 1 },
        ],
        expectedProducts: 1,
        verifiedSteps: 1,
        failedSteps: 0,
        createdAt: '2024-01-01T00:00:00Z',
      },
    ]

    const links: IntotoLinkResource[] = [
      {
        apiVersion: 'in-toto.io/v1alpha1',
        kind: 'Link',
        metadata: {
          name: 'link2',
          namespace: 'default',
          labels: {
            'layout-name': 'pipeline',
            'step-name': 'step',
          },
        },
        spec: {
          name: 'step',
          materials: [],
          products: [],
          byproducts: {},
          command: [],
          environment: {},
        },
        status: {
          verified: false,
        },
      },
    ]

    applyLinkStatuses(layouts, links)
    expect(layouts[0].steps[0].status).toBe('failed')
    expect(layouts[0].verifiedSteps).toBe(0)
    expect(layouts[0].failedSteps).toBe(1)
  })
})

describe('markMissingSteps', () => {
  it('marks steps with no links as missing', () => {
    const layouts: IntotoLayout[] = [
      {
        name: 'pipeline',
        cluster: 'prod',
        namespace: 'default',
        steps: [
          { name: 'step1', status: 'unknown', functionary: 'alice', linksFound: 0 },
          { name: 'step2', status: 'verified', functionary: 'bob', linksFound: 1 },
          { name: 'step3', status: 'unknown', functionary: 'charlie', linksFound: 0 },
        ],
        expectedProducts: 3,
        verifiedSteps: 1,
        failedSteps: 0,
        createdAt: '2024-01-01T00:00:00Z',
      },
    ]

    markMissingSteps(layouts)
    expect(layouts[0].steps[0].status).toBe('missing')
    expect(layouts[0].steps[1].status).toBe('verified') // unchanged
    expect(layouts[0].steps[2].status).toBe('missing')
  })

  it('does not mark steps with links as missing', () => {
    const layouts: IntotoLayout[] = [
      {
        name: 'pipeline',
        cluster: 'prod',
        namespace: 'default',
        steps: [
          { name: 'step', status: 'unknown', functionary: 'alice', linksFound: 1 },
        ],
        expectedProducts: 1,
        verifiedSteps: 0,
        failedSteps: 0,
        createdAt: '2024-01-01T00:00:00Z',
      },
    ]

    markMissingSteps(layouts)
    expect(layouts[0].steps[0].status).toBe('unknown') // unchanged
  })

  it('handles null layouts gracefully', () => {
    expect(() => markMissingSteps(null as unknown as IntotoLayout[])).not.toThrow()
  })

  it('handles null steps gracefully', () => {
    const layouts: IntotoLayout[] = [
      {
        name: 'pipeline',
        cluster: 'prod',
        namespace: 'default',
        steps: null as unknown as IntotoLayout['steps'],
        expectedProducts: 0,
        verifiedSteps: 0,
        failedSteps: 0,
        createdAt: '2024-01-01T00:00:00Z',
      },
    ]

    expect(() => markMissingSteps(layouts)).not.toThrow()
  })
})
