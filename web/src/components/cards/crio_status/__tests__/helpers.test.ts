import { describe, expect, it } from 'vitest'
import {
  buildRecentImagePulls,
  extractCrioVersion,
  isCrioRuntime,
  parseReadyCount,
  summarizeCrioPods,
} from '../helpers'

describe('crio_status helpers', () => {
  it('detects CRI-O runtimes', () => {
    expect(isCrioRuntime('cri-o://1.30.0')).toBe(true)
    expect(isCrioRuntime('containerd://1.7.1')).toBe(false)
    expect(isCrioRuntime(undefined)).toBe(false)
  })

  it('extracts CRI-O version from runtime', () => {
    expect(extractCrioVersion('cri-o://1.29.8')).toBe('1.29.8')
    expect(extractCrioVersion('cri-o://not-semver')).toBe('unknown')
    expect(extractCrioVersion('')).toBe('unknown')
  })

  it('parses ready ratio safely', () => {
    expect(parseReadyCount('1/1')).toEqual({ ready: 1, total: 1 })
    expect(parseReadyCount('0/2')).toEqual({ ready: 0, total: 2 })
    expect(parseReadyCount('invalid')).toEqual({ ready: 0, total: 0 })
  })

  it('summarizes pod/container metrics', () => {
    const summary = summarizeCrioPods([
      {
        status: 'Running',
        ready: '1/1',
        containers: [{ state: 'running' }],
      },
      {
        status: 'Pending',
        ready: '0/1',
        containers: [{ state: 'waiting', reason: 'ImagePullBackOff' }],
      },
      {
        status: 'Failed',
        ready: '0/1',
        containers: [{ state: 'terminated' }],
      },
    ])

    expect(summary.runningContainers).toBe(1)
    expect(summary.pausedContainers).toBe(1)
    expect(summary.stoppedContainers).toBe(1)
    expect(summary.totalContainers).toBe(3)
    expect(summary.imagePullFailed).toBe(1)
    expect(summary.podSandboxesReady).toBe(1)
    expect(summary.podSandboxesTotal).toBe(3)
  })

  it('builds recent image pulls from events', () => {
    const pulls = buildRecentImagePulls([
      {
        reason: 'Pulled',
        message: 'Successfully pulled image "ghcr.io/acme/app:v1"',
        lastSeen: '2026-03-10T12:00:00.000Z',
      },
      {
        reason: 'Failed',
        message: 'Failed to pull image "docker.io/library/nginx:latest"',
        lastSeen: '2026-03-10T12:01:00.000Z',
      },
      {
        reason: 'Scheduled',
        message: 'Pod scheduled',
        lastSeen: '2026-03-10T12:02:00.000Z',
      },
    ])

    expect(pulls).toHaveLength(2)
    expect(pulls[0].status).toBe('failed')
    expect(pulls[1].status).toBe('success')
  })
})
