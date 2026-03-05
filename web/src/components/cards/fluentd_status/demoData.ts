/**
 * Demo data for the Fluentd log collector status card.
 *
 * Represents a typical cluster running Fluentd as a DaemonSet with
 * multiple output plugins. Used in demo mode or when no Kubernetes
 * clusters are connected.
 */

export interface FluentdOutputPlugin {
  name: string
  type: string
  status: 'healthy' | 'degraded' | 'error'
  emitCount: number
  errorCount: number
}

export interface FluentdDemoData {
  health: 'healthy' | 'degraded' | 'not-installed'
  pods: {
    ready: number
    total: number
  }
  bufferUtilization: number // 0-100 percentage
  eventsPerSecond: number
  retryCount: number
  outputPlugins: FluentdOutputPlugin[]
  lastCheckTime: string
}

export const FLUENTD_DEMO_DATA: FluentdDemoData = {
  health: 'degraded',
  pods: { ready: 5, total: 6 },
  bufferUtilization: 42,
  eventsPerSecond: 1240,
  retryCount: 7,
  outputPlugins: [
    {
      name: 'elasticsearch-output',
      type: 'elasticsearch',
      status: 'healthy',
      emitCount: 982340,
      errorCount: 0,
    },
    {
      name: 'kafka-output',
      type: 'kafka2',
      status: 'degraded',
      emitCount: 451200,
      errorCount: 23,
    },
    {
      name: 's3-archive',
      type: 's3',
      status: 'healthy',
      emitCount: 104800,
      errorCount: 1,
    },
  ],
  lastCheckTime: new Date(Date.now() - 90 * 1000).toISOString(), // 90 sec ago
}
