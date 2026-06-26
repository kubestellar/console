export type CloudEventResourceState = 'ready' | 'degraded' | 'error'

export interface CloudEventResource {
  name: string
  namespace: string
  cluster: string
  kind: string
  state: CloudEventResourceState
  sink: string
  lastSeen: string
}

export interface CloudEventsDemoData {
  health: 'healthy' | 'degraded' | 'not-installed'
  brokers: {
    total: number
    ready: number
    notReady: number
  }
  triggers: {
    total: number
    ready: number
    notReady: number
  }
  eventSources: {
    total: number
    ready: number
    failed: number
  }
  deliveries: {
    successful: number
    failed: number
    unknown: number
  }
  resources: CloudEventResource[]
  lastCheckTime: string
}

const DEMO_MINUTE_MS = 60_000
const DEMO_HOUR_MS = 60 * DEMO_MINUTE_MS
const DEMO_DAY_MS = 24 * DEMO_HOUR_MS

const NOW = Date.now()

export const CLOUDEVENTS_DEMO_DATA: CloudEventsDemoData = {
  health: 'healthy',
  brokers: {
    total: 2,
    ready: 2,
    notReady: 0,
  },
  triggers: {
    total: 4,
    ready: 3,
    notReady: 1,
  },
  eventSources: {
    total: 5,
    ready: 4,
    failed: 1,
  },
  deliveries: {
    successful: 3,
    failed: 1,
    unknown: 0,
  },
  resources: [
    {
      name: 'orders-broker',
      namespace: 'eventing',
      cluster: 'dev-us-east',
      kind: 'Broker',
      state: 'ready',
      sink: 'knative-broker',
      lastSeen: new Date(NOW - (5 * DEMO_MINUTE_MS)).toISOString(),
    },
    {
      name: 'payments-trigger',
      namespace: 'eventing',
      cluster: 'dev-us-east',
      kind: 'Trigger',
      state: 'ready',
      sink: 'payments-service',
      lastSeen: new Date(NOW - (15 * DEMO_MINUTE_MS)).toISOString(),
    },
    {
      name: 'audit-pingsource',
      namespace: 'eventing',
      cluster: 'staging-eu-west',
      kind: 'PingSource',
      state: 'degraded',
      sink: 'audit-service',
      lastSeen: new Date(NOW - (2 * DEMO_HOUR_MS)).toISOString(),
    },
    {
      name: 'inventory-apisource',
      namespace: 'eventing',
      cluster: 'prod-us-central',
      kind: 'ApiServerSource',
      state: 'ready',
      sink: 'inventory-service',
      lastSeen: new Date(NOW - (8 * DEMO_MINUTE_MS)).toISOString(),
    },
    {
      name: 'legacy-containersource',
      namespace: 'legacy-events',
      cluster: 'prod-us-central',
      kind: 'ContainerSource',
      state: 'error',
      sink: 'dead-letter-sink',
      lastSeen: new Date(NOW - DEMO_DAY_MS).toISOString(),
    },
  ],
  lastCheckTime: new Date(NOW).toISOString(),
}
