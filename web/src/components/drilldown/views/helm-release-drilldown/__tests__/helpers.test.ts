import { describe, expect, it } from 'vitest'

import {
  ACTION_FEEDBACK_CLEAR_MS,
  buildHelmAIContext,
  getStatusStyle,
  parseHelmResources,
} from '../helpers'

describe('ACTION_FEEDBACK_CLEAR_MS', () => {
  it('is 5000ms so callers agree on the clear timeout', () => {
    expect(ACTION_FEEDBACK_CLEAR_MS).toBe(5000)
  })
})

describe('getStatusStyle', () => {
  it.each(['deployed', 'superseded', 'Deployed', 'SUPERSEDED'])(
    'returns green for successful lifecycle status %s',
    (status) => {
      expect(getStatusStyle(status).bg).toContain('green')
    },
  )

  it.each(['pending-install', 'pending-upgrade', 'pending-rollback'])(
    'returns yellow for pending status %s',
    (status) => {
      expect(getStatusStyle(status).bg).toContain('yellow')
    },
  )

  it.each(['failed', 'uninstalling'])(
    'returns red for terminal-error status %s',
    (status) => {
      expect(getStatusStyle(status).bg).toContain('red')
    },
  )

  it('returns blue default for unknown statuses', () => {
    expect(getStatusStyle('unknown').bg).toContain('blue')
  })

  it('tolerates null/undefined/empty status', () => {
    expect(getStatusStyle(undefined as unknown as string).bg).toContain('blue')
    expect(getStatusStyle(null as unknown as string).bg).toContain('blue')
    expect(getStatusStyle('').bg).toContain('blue')
  })
})

describe('parseHelmResources', () => {
  it('returns an empty list for an empty manifest', () => {
    expect(parseHelmResources('', 'default')).toEqual([])
  })

  it('parses a single-doc manifest with an explicit namespace', () => {
    const manifest = `apiVersion: v1
kind: ConfigMap
metadata:
  name: my-cm
  namespace: apps`
    expect(parseHelmResources(manifest, 'default')).toEqual([
      { kind: 'ConfigMap', name: 'my-cm', namespace: 'apps' },
    ])
  })

  it('falls back to the release namespace when a doc omits its namespace', () => {
    const manifest = `apiVersion: v1
kind: Service
metadata:
  name: web`
    expect(parseHelmResources(manifest, 'release-ns')).toEqual([
      { kind: 'Service', name: 'web', namespace: 'release-ns' },
    ])
  })

  it('splits multi-doc manifests on ---', () => {
    const manifest = `apiVersion: v1
kind: ConfigMap
metadata:
  name: a
  namespace: n1
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: b
  namespace: n2`
    expect(parseHelmResources(manifest, 'default')).toEqual([
      { kind: 'ConfigMap', name: 'a', namespace: 'n1' },
      { kind: 'Deployment', name: 'b', namespace: 'n2' },
    ])
  })

  it('skips docs that are missing a kind or a name', () => {
    const manifest = `apiVersion: v1
metadata:
  name: nokind
---
apiVersion: v1
kind: ConfigMap
metadata:
  namespace: apps`
    expect(parseHelmResources(manifest, 'default')).toEqual([])
  })

  it('skips whitespace-only docs from spurious --- separators', () => {
    const manifest = `---

---
apiVersion: v1
kind: Secret
metadata:
  name: s
  namespace: n`
    expect(parseHelmResources(manifest, 'default')).toEqual([
      { kind: 'Secret', name: 's', namespace: 'n' },
    ])
  })
})

describe('buildHelmAIContext', () => {
  const base = { releaseName: 'my-rel', cluster: 'c1', namespace: 'ns' }

  it('emits no issues when deployed', () => {
    const ctx = buildHelmAIContext({ ...base, releaseStatus: 'deployed' })
    expect(ctx.resourceContext).toEqual({
      kind: 'HelmRelease',
      name: 'my-rel',
      cluster: 'c1',
      namespace: 'ns',
      status: 'deployed',
    })
    expect(ctx.issues).toEqual([])
  })

  it('emits a warning issue for failed status', () => {
    const ctx = buildHelmAIContext({ ...base, releaseStatus: 'failed' })
    expect(ctx.issues).toEqual([
      { name: 'my-rel', message: 'Release status: failed', severity: 'warning' },
    ])
  })

  it('emits a warning issue for any pending-* status', () => {
    for (const s of ['pending-install', 'pending-upgrade', 'pending-rollback']) {
      const ctx = buildHelmAIContext({ ...base, releaseStatus: s })
      expect(ctx.issues).toHaveLength(1)
      expect(ctx.issues[0].severity).toBe('warning')
      expect(ctx.issues[0].message).toBe(`Release status: ${s}`)
    }
  })

  it('is case-insensitive on status matching', () => {
    expect(buildHelmAIContext({ ...base, releaseStatus: 'FAILED' }).issues).toHaveLength(1)
    expect(buildHelmAIContext({ ...base, releaseStatus: 'Pending-Install' }).issues).toHaveLength(1)
  })
})
