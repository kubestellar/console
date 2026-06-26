import { describe, it, expect } from 'vitest'
import {
  isFluentdPod,
  isFluentdDaemonSet,
  inferOutputPluginTypes,
  estimateEventsPerSecond,
} from '../useFluentdStatus'

describe('useFluentdStatus helpers', () => {
  it('detects Fluentd pod by labels only', () => {
    expect(isFluentdPod({ labels: { app: 'fluentd' } })).toBe(true)
    expect(isFluentdPod({ labels: { 'app.kubernetes.io/name': 'fluentd' } })).toBe(true)
    expect(isFluentdPod({ labels: { app: 'not-fluentd' }, name: 'fluentd-daemon' })).toBe(false)
  })

  it('detects Fluentd daemonset by labels only', () => {
    expect(isFluentdDaemonSet({ labels: { 'k8s-app': 'fluentd-logging' } })).toBe(true)
    expect(isFluentdDaemonSet({ labels: { app: 'logger' }, name: 'fluentd' })).toBe(false)
  })

  it('extracts output plugins from labels and annotations', () => {
    const plugins = inferOutputPluginTypes([
      {
        labels: { 'fluentd-output': 'elasticsearch' },
      },
      {
        annotations: { 'fluentd.io/output-plugins': 'kafka, s3' },
      },
    ])

    expect(plugins).toEqual(expect.arrayContaining(['elasticsearch', 'kafka', 's3']))
  })

  it('estimates events per second from fluentd event timestamps', () => {
    const eventsPerSecond = estimateEventsPerSecond([
      {
        object: 'Pod/fluentd-abc',
        count: 10,
        firstSeen: '2026-03-14T00:00:00.000Z',
        lastSeen: '2026-03-14T00:00:10.000Z',
      },
    ])

    expect(eventsPerSecond).toBe(1)
  })
})
