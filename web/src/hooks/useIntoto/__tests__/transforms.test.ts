import { describe, it, expect } from 'vitest'
import type { IntotoLayout, IntotoLinkResource, IntotoLayoutResource } from '../types'
import {
  computeIntotoStats,
  buildClusterStatus,
  emptyStatus,
  transformLayoutResources,
  applyLinkStatuses,
  markMissingSteps,
} from '../transforms'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLayout(
  overrides: Partial<IntotoLayout> = {},
): IntotoLayout {
  return {
    name: 'test-layout',
    cluster: 'test-cluster',
    steps: [],
    expectedProducts: 0,
    verifiedSteps: 0,
    failedSteps: 0,
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// computeIntotoStats
// ---------------------------------------------------------------------------

describe('computeIntotoStats', () => {
  it('returns zeroed stats for an empty layout list', () => {
    const stats = computeIntotoStats([])
    expect(stats.totalLayouts).toBe(0)
    expect(stats.totalSteps).toBe(0)
    expect(stats.verifiedSteps).toBe(0)
    expect(stats.failedSteps).toBe(0)
    expect(stats.missingSteps).toBe(0)
  })

  it('counts total layouts', () => {
    const layouts = [makeLayout(), makeLayout()]
    const stats = computeIntotoStats(layouts)
    expect(stats.totalLayouts).toBe(2)
  })

  it('sums steps across layouts', () => {
    const layouts = [
      makeLayout({ steps: [{ name: 's1', status: 'verified', functionary: 'f1', linksFound: 1 }], verifiedSteps: 1, failedSteps: 0 }),
      makeLayout({ steps: [{ name: 's2', status: 'failed', functionary: 'f2', linksFound: 1 }], verifiedSteps: 0, failedSteps: 1 }),
    ]
    const stats = computeIntotoStats(layouts)
    expect(stats.totalSteps).toBe(2)
    expect(stats.verifiedSteps).toBe(1)
    expect(stats.failedSteps).toBe(1)
    expect(stats.missingSteps).toBe(0)
  })

  it('computes missingSteps as total minus verified minus failed', () => {
    const layouts = [
      makeLayout({
        steps: [
          { name: 's1', status: 'verified', functionary: 'f1', linksFound: 1 },
          { name: 's2', status: 'unknown', functionary: 'f2', linksFound: 0 },
          { name: 's3', status: 'failed', functionary: 'f3', linksFound: 1 },
        ],
        verifiedSteps: 1,
        failedSteps: 1,
      }),
    ]
    const stats = computeIntotoStats(layouts)
    expect(stats.totalSteps).toBe(3)
    expect(stats.missingSteps).toBe(1)
  })

  it('handles null/undefined layouts array gracefully', () => {
    // The implementation uses `(layouts || [])` so null should be safe
    const stats = computeIntotoStats(null as unknown as IntotoLayout[])
    expect(stats.totalLayouts).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// buildClusterStatus
// ---------------------------------------------------------------------------

describe('buildClusterStatus', () => {
  it('includes cluster name in result', () => {
    const status = buildClusterStatus('prod-cluster', [])
    expect(status.cluster).toBe('prod-cluster')
  })

  it('sets installed=true and loading=false', () => {
    const status = buildClusterStatus('prod', [])
    expect(status.installed).toBe(true)
    expect(status.loading).toBe(false)
  })

  it('passes through layouts', () => {
    const layouts = [makeLayout({ name: 'my-layout' })]
    const status = buildClusterStatus('prod', layouts)
    expect(status.layouts).toHaveLength(1)
    expect(status.layouts[0].name).toBe('my-layout')
  })

  it('propagates computed stats from computeIntotoStats', () => {
    const layouts = [
      makeLayout({
        steps: [{ name: 's1', status: 'verified', functionary: 'f', linksFound: 1 }],
        verifiedSteps: 1,
        failedSteps: 0,
      }),
    ]
    const status = buildClusterStatus('prod', layouts)
    expect(status.totalLayouts).toBe(1)
    expect(status.verifiedSteps).toBe(1)
    expect(status.totalSteps).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// emptyStatus
// ---------------------------------------------------------------------------

describe('emptyStatus', () => {
  it('sets installed and cluster name', () => {
    const s = emptyStatus('my-cluster', true)
    expect(s.cluster).toBe('my-cluster')
    expect(s.installed).toBe(true)
    expect(s.loading).toBe(false)
  })

  it('sets installed=false when not installed', () => {
    const s = emptyStatus('my-cluster', false)
    expect(s.installed).toBe(false)
  })

  it('propagates optional error message', () => {
    const s = emptyStatus('my-cluster', false, 'CRD not found')
    expect(s.error).toBe('CRD not found')
  })

  it('returns zero stats', () => {
    const s = emptyStatus('my-cluster', true)
    expect(s.totalLayouts).toBe(0)
    expect(s.totalSteps).toBe(0)
    expect(s.verifiedSteps).toBe(0)
    expect(s.failedSteps).toBe(0)
    expect(s.missingSteps).toBe(0)
    expect(s.layouts).toHaveLength(0)
  })

  it('omits error when not provided', () => {
    const s = emptyStatus('my-cluster', true)
    expect(s.error).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// transformLayoutResources
// ---------------------------------------------------------------------------

describe('transformLayoutResources', () => {
  it('returns empty array for empty input', () => {
    const result = transformLayoutResources('cluster-1', [])
    expect(result).toHaveLength(0)
  })

  it('maps a layout resource to an IntotoLayout', () => {
    const resource: IntotoLayoutResource = {
      metadata: { name: 'my-layout', namespace: 'default', creationTimestamp: '2026-01-01T00:00:00Z' },
      spec: {
        steps: [
          { name: 'build', pubkeys: ['key1', 'key2'] },
          { name: 'test' },
        ],
      },
    }
    const result = transformLayoutResources('prod', [resource])
    expect(result).toHaveLength(1)
    const layout = result[0]
    expect(layout.name).toBe('my-layout')
    expect(layout.cluster).toBe('prod')
    expect(layout.namespace).toBe('default')
    expect(layout.steps).toHaveLength(2)
    expect(layout.steps[0].name).toBe('build')
    expect(layout.steps[0].functionary).toBe('key1, key2')
    expect(layout.steps[1].functionary).toBe('unknown')
  })

  it('initializes steps with unknown status and linksFound=0', () => {
    const resource: IntotoLayoutResource = {
      metadata: { name: 'my-layout' },
      spec: { steps: [{ name: 'sign' }] },
    }
    const result = transformLayoutResources('cluster', [resource])
    const step = result[0].steps[0]
    expect(step.status).toBe('unknown')
    expect(step.linksFound).toBe(0)
  })

  it('handles null input gracefully', () => {
    const result = transformLayoutResources('cluster', null as unknown as IntotoLayoutResource[])
    expect(result).toHaveLength(0)
  })

  it('sets verifiedSteps and failedSteps to 0 initially', () => {
    const resource: IntotoLayoutResource = {
      metadata: { name: 'l' },
      spec: { steps: [{ name: 's1' }, { name: 's2' }] },
    }
    const result = transformLayoutResources('cluster', [resource])
    expect(result[0].verifiedSteps).toBe(0)
    expect(result[0].failedSteps).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// applyLinkStatuses
// ---------------------------------------------------------------------------

describe('applyLinkStatuses', () => {
  it('marks a step as verified when link.status.verified is true', () => {
    const layout = makeLayout({
      name: 'my-layout',
      steps: [{ name: 'build', status: 'unknown', functionary: 'f', linksFound: 0 }],
      verifiedSteps: 0,
      failedSteps: 0,
    })
    const link: IntotoLinkResource = {
      metadata: { name: 'link-1', labels: { 'layout-name': 'my-layout', 'step-name': 'build' } },
      spec: { name: 'build' },
      status: { verified: true },
    }
    applyLinkStatuses([layout], [link])
    expect(layout.steps[0].status).toBe('verified')
    expect(layout.verifiedSteps).toBe(1)
    expect(layout.failedSteps).toBe(0)
  })

  it('marks a step as failed when link.status.verified is false', () => {
    const layout = makeLayout({
      name: 'my-layout',
      steps: [{ name: 'sign', status: 'unknown', functionary: 'f', linksFound: 0 }],
      verifiedSteps: 0,
      failedSteps: 0,
    })
    const link: IntotoLinkResource = {
      metadata: { name: 'link-2', labels: { 'layout-name': 'my-layout', 'step-name': 'sign' } },
      spec: { name: 'sign' },
      status: { verified: false },
    }
    applyLinkStatuses([layout], [link])
    expect(layout.steps[0].status).toBe('failed')
    expect(layout.failedSteps).toBe(1)
  })

  it('increments linksFound on the matching step', () => {
    const layout = makeLayout({
      name: 'l',
      steps: [{ name: 'step1', status: 'unknown', functionary: 'f', linksFound: 0 }],
      verifiedSteps: 0,
      failedSteps: 0,
    })
    const link: IntotoLinkResource = {
      metadata: { name: 'lnk', labels: { 'layout-name': 'l', 'step-name': 'step1' } },
      spec: {},
      status: { verified: true },
    }
    applyLinkStatuses([layout], [link])
    expect(layout.steps[0].linksFound).toBe(1)
  })

  it('skips links without layout-name or step-name labels', () => {
    const layout = makeLayout({
      name: 'l',
      steps: [{ name: 'step1', status: 'unknown', functionary: 'f', linksFound: 0 }],
      verifiedSteps: 0,
      failedSteps: 0,
    })
    const link: IntotoLinkResource = {
      metadata: { name: 'lnk' }, // no labels
      spec: {},
      status: { verified: true },
    }
    applyLinkStatuses([layout], [link])
    expect(layout.steps[0].status).toBe('unknown')
  })

  it('handles empty links array', () => {
    const layout = makeLayout({
      name: 'l',
      steps: [{ name: 'step1', status: 'unknown', functionary: 'f', linksFound: 0 }],
      verifiedSteps: 0,
      failedSteps: 0,
    })
    applyLinkStatuses([layout], [])
    expect(layout.steps[0].status).toBe('unknown')
  })
})

// ---------------------------------------------------------------------------
// markMissingSteps
// ---------------------------------------------------------------------------

describe('markMissingSteps', () => {
  it('marks unknown steps with no links as missing', () => {
    const layout = makeLayout({
      steps: [{ name: 's1', status: 'unknown', functionary: 'f', linksFound: 0 }],
      verifiedSteps: 0,
      failedSteps: 0,
    })
    markMissingSteps([layout])
    expect(layout.steps[0].status).toBe('missing')
  })

  it('does not change verified steps', () => {
    const layout = makeLayout({
      steps: [{ name: 's1', status: 'verified', functionary: 'f', linksFound: 1 }],
      verifiedSteps: 1,
      failedSteps: 0,
    })
    markMissingSteps([layout])
    expect(layout.steps[0].status).toBe('verified')
  })

  it('does not mark unknown steps that have links as missing', () => {
    const layout = makeLayout({
      steps: [{ name: 's1', status: 'unknown', functionary: 'f', linksFound: 1 }],
      verifiedSteps: 0,
      failedSteps: 0,
    })
    markMissingSteps([layout])
    // linksFound > 0, so status should remain 'unknown'
    expect(layout.steps[0].status).toBe('unknown')
  })

  it('handles empty layouts array', () => {
    expect(() => markMissingSteps([])).not.toThrow()
  })
})
