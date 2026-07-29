import { describe, expect, it } from 'vitest'
import { AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react'

import {
  buildArgoAIContext,
  buildRestartSnippet,
  getHealthStatusStyle,
  getSyncStatusStyle,
} from '../helpers'

describe('getSyncStatusStyle', () => {
  it('returns the green/checkcircle style for "Synced" (case-insensitive)', () => {
    const style = getSyncStatusStyle('Synced')
    expect(style.icon).toBe(CheckCircle)
    expect(style.bg).toContain('green')
    expect(style.text).toContain('green')
  })

  it.each(['outofSync', 'out of sync', 'outofsync'])(
    'returns the yellow warning style for %s',
    (status) => {
      const style = getSyncStatusStyle(status)
      expect(style.icon).toBe(AlertTriangle)
      expect(style.bg).toContain('yellow')
    },
  )

  it('returns a neutral style for "unknown"', () => {
    const style = getSyncStatusStyle('unknown')
    expect(style.icon).toBe(AlertTriangle)
    expect(style.bg).toBe('bg-secondary')
  })

  it('returns the blue/refresh default style for anything else', () => {
    const style = getSyncStatusStyle('progressing')
    expect(style.icon).toBe(RefreshCw)
    expect(style.bg).toContain('blue')
  })

  it('treats undefined/null status as the default style', () => {
    expect(getSyncStatusStyle(undefined as unknown as string).icon).toBe(RefreshCw)
    expect(getSyncStatusStyle(null as unknown as string).icon).toBe(RefreshCw)
    expect(getSyncStatusStyle('').icon).toBe(RefreshCw)
  })
})

describe('getHealthStatusStyle', () => {
  it.each([
    ['Healthy', 'green'],
    ['degraded', 'red'],
    ['Progressing', 'blue'],
    ['SUSPENDED', 'yellow'],
    ['Missing', 'orange'],
  ])('maps %s → %s style', (status, color) => {
    expect(getHealthStatusStyle(status).bg).toContain(color)
  })

  it('returns a neutral style for unknown health strings', () => {
    expect(getHealthStatusStyle('nonsense').bg).toBe('bg-secondary')
  })

  it('tolerates null/undefined status', () => {
    expect(getHealthStatusStyle(undefined as unknown as string).bg).toBe('bg-secondary')
    expect(getHealthStatusStyle(null as unknown as string).bg).toBe('bg-secondary')
  })
})

describe('buildArgoAIContext', () => {
  const base = { appName: 'my-app', cluster: 'prod', namespace: 'apps' }

  it('emits no issues when synced and healthy', () => {
    const ctx = buildArgoAIContext({ ...base, syncStatus: 'Synced', healthStatus: 'Healthy' })
    expect(ctx.resourceContext).toEqual({
      kind: 'ArgoApplication',
      name: 'my-app',
      cluster: 'prod',
      namespace: 'apps',
      status: 'Synced / Healthy',
    })
    expect(ctx.issues).toEqual([])
  })

  it('marks a "critical" issue when health is Degraded', () => {
    const ctx = buildArgoAIContext({ ...base, syncStatus: 'Synced', healthStatus: 'Degraded' })
    expect(ctx.issues).toHaveLength(1)
    expect(ctx.issues[0]).toMatchObject({
      name: 'my-app',
      message: 'Sync: Synced, Health: Degraded',
      severity: 'critical',
    })
  })

  it('marks a "warning" issue when out-of-sync but healthy', () => {
    const ctx = buildArgoAIContext({ ...base, syncStatus: 'OutOfSync', healthStatus: 'Healthy' })
    expect(ctx.issues).toHaveLength(1)
    expect(ctx.issues[0].severity).toBe('warning')
  })

  it('marks a "warning" issue when health is Missing', () => {
    const ctx = buildArgoAIContext({ ...base, syncStatus: 'Synced', healthStatus: 'Missing' })
    expect(ctx.issues[0].severity).toBe('warning')
  })

  it('composes the status string from the raw inputs verbatim', () => {
    const ctx = buildArgoAIContext({ ...base, syncStatus: 'Unknown', healthStatus: 'Progressing' })
    expect(ctx.resourceContext.status).toBe('Unknown / Progressing')
  })
})

describe('buildRestartSnippet', () => {
  it('substitutes appName, namespace, and restart timestamp into the manifest', () => {
    const snippet = buildRestartSnippet('web', 'apps', '2026-07-29T12:00:00Z', 'fallback')
    expect(snippet).toContain('name: web')
    expect(snippet).toContain('namespace: apps')
    expect(snippet).toContain('kubectl.kubernetes.io/restartedAt: "2026-07-29T12:00:00Z"')
    expect(snippet).toContain('apiVersion: apps/v1')
    expect(snippet).toContain('kind: Deployment')
  })

  it('uses the fallback name when appName is empty', () => {
    const snippet = buildRestartSnippet('', 'apps', 'now', 'fallback-name')
    expect(snippet).toContain('name: fallback-name')
  })

  it('preserves the exact YAML structure (deterministic snapshot)', () => {
    const snippet = buildRestartSnippet('a', 'b', 't', 'f')
    expect(snippet.split('\n')[0]).toBe('apiVersion: apps/v1')
    expect(snippet.endsWith('\n')).toBe(true)
  })
})
