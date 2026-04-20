// NatsServerState represents the possible states a NATS server can be in
export type NatsServerState = 'ok' | 'warning' | 'error'

// NatsServer holds info about a single NATS server in the cluster
export interface NatsServer {
  name: string
  cluster: string
  state: NatsServerState
  // connections is how many clients are currently connected
  connections: number
  // subscriptions is how many active message subscriptions exist
  subscriptions: number
  version: string
}

// NatsStream represents a JetStream stream — JetStream is NATS's
// persistent messaging layer (like Kafka topics)
export interface NatsStream {
  name: string
  cluster: string
  // messages is how many messages are stored in this stream
  messages: number
  // consumers is how many things are reading from this stream
  consumers: number
  state: NatsServerState
}

// NatsDemoData is the shape of all data our card shows
export interface NatsDemoData {
  // health is the overall system health
  health: 'healthy' | 'degraded' | 'not-installed'
  servers: {
    total: number
    ok: number
    warning: number
    error: number
  }
  messaging: {
    // totalConnections across all servers
    totalConnections: number
    // inMsgsPerSec is messages flowing IN per second
    inMsgsPerSec: number
    // outMsgsPerSec is messages flowing OUT per second
    outMsgsPerSec: number
    // totalSubscriptions across all servers
    totalSubscriptions: number
  }
  jetstream: {
    enabled: boolean
    streams: number
    totalMessages: number
    totalConsumers: number
  }
  serverList: NatsServer[]
  streamList: NatsStream[]
  lastCheckTime: string
}

// These constants make time math readable
const DEMO_MINUTE_MS = 60_000

const NOW = Date.now()

// NATS_DEMO_DATA is what users see when demo mode is ON
// Numbers are realistic for a small staging cluster
export const NATS_DEMO_DATA: NatsDemoData = {
  health: 'healthy',
  servers: {
    total: 3,
    ok: 2,
    warning: 1,
    error: 0,
  },
  messaging: {
    totalConnections: 47,
    inMsgsPerSec: 312,
    outMsgsPerSec: 289,
    totalSubscriptions: 134,
  },
  jetstream: {
    enabled: true,
    streams: 5,
    totalMessages: 18400,
    totalConsumers: 12,
  },
  serverList: [
    {
      name: 'nats-0',
      cluster: 'prod-us-east',
      state: 'ok',
      connections: 21,
      subscriptions: 58,
      version: '2.10.4',
    },
    {
      name: 'nats-1',
      cluster: 'prod-us-east',
      state: 'ok',
      connections: 18,
      subscriptions: 49,
      version: '2.10.4',
    },
    {
      name: 'nats-2',
      cluster: 'staging-eu-west',
      state: 'warning',
      connections: 8,
      subscriptions: 27,
      version: '2.10.2',
    },
  ],
  streamList: [
    {
      name: 'orders',
      cluster: 'prod-us-east',
      messages: 8200,
      consumers: 4,
      state: 'ok',
    },
    {
      name: 'payments',
      cluster: 'prod-us-east',
      messages: 5100,
      consumers: 3,
      state: 'ok',
    },
    {
      name: 'notifications',
      cluster: 'prod-us-east',
      messages: 3400,
      consumers: 3,
      state: 'ok',
    },
    {
      name: 'audit-log',
      cluster: 'staging-eu-west',
      messages: 1200,
      consumers: 1,
      state: 'warning',
    },
    {
      name: 'dead-letters',
      cluster: 'staging-eu-west',
      messages: 500,
      consumers: 1,
      state: 'ok',
    },
  ],
  lastCheckTime: new Date(NOW - (2 * DEMO_MINUTE_MS)).toISOString(),
}
