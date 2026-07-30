/**
 * Demo data for the Knative (CNCF graduated) serverless status card.
 *
 * Represents a typical production environment running Knative Serving
 * and Knative Eventing. Used in demo mode or when no Kubernetes
 * clusters are connected.
 *
 * Knative terminology:
 * - Service:  high-level workload abstraction → manages Routes + Configurations
 * - Revision: immutable snapshot of a Configuration (code + config)
 * - Route:    maps network traffic to one or more Revisions via traffic splits
 * - Broker:   Eventing pub/sub hub that receives CloudEvents and fans out to Triggers
 * - Trigger:  subscribes to a Broker with an optional filter and delivers to a sink
 */

const DEMO_LAST_CHECK_OFFSET_MS = 45_000

// ---------------------------------------------------------------------------
// Serving types
// ---------------------------------------------------------------------------

export type KnativeServiceStatus = 'ready' | 'not-ready' | 'unknown'

export interface KnativeTrafficTarget {
  /** Revision name this target points to (empty string = @latest) */
  revisionName: string
  /** Percentage of traffic routed to this target (0–100) */
  percent: number
  /** Whether this is the @latest route tag */
  latestRevision: boolean
  /** Optional route tag (e.g. "canary", "stable") */
  tag: string
}

export interface KnativeServingService {
  name: string
  namespace: string
  status: KnativeServiceStatus
  /** URL where the service is reachable */
  url: string
  /** Name of the latest created revision */
  latestCreatedRevision: string
  /** Name of the latest ready revision */
  latestReadyRevision: string
  /** Observed generation number */
  generation: number
  /** Traffic split configuration */
  traffic: KnativeTrafficTarget[]
}

export type KnativeRevisionStatus = 'ready' | 'not-ready' | 'unknown' | 'activating'

export interface KnativeRevision {
  name: string
  namespace: string
  /** Owning service name */
  service: string
  /** Revision generation number */
  generation: number
  /** Container image used by this revision */
  image: string
  /** Number of ready replicas (can be 0 when scaled-to-zero) */
  readyReplicas: number
  status: KnativeRevisionStatus
}

// ---------------------------------------------------------------------------
// Eventing types
// ---------------------------------------------------------------------------

export type KnativeBrokerStatus = 'ready' | 'not-ready' | 'unknown'

export interface KnativeEventingBroker {
  name: string
  namespace: string
  status: KnativeBrokerStatus
  /** Number of Triggers attached to this Broker */
  triggerCount: number
  /** Whether a dead-letter sink is configured */
  hasDeadLetterSink: boolean
  /** Broker class (e.g. "MTChannelBasedBroker", "Kafka") */
  brokerClass: string
}

// ---------------------------------------------------------------------------
// Aggregate type
// ---------------------------------------------------------------------------

export interface KnativeDemoData {
  health: 'healthy' | 'degraded' | 'not-installed'
  servingControllerPods: { ready: number; total: number }
  eventingControllerPods: { ready: number; total: number }
  services: KnativeServingService[]
  revisions: KnativeRevision[]
  brokers: KnativeEventingBroker[]
  lastCheckTime: string
}

// ---------------------------------------------------------------------------
// Demo data
// ---------------------------------------------------------------------------

export const KNATIVE_DEMO_DATA: KnativeDemoData = {
  health: 'degraded',
  servingControllerPods: { ready: 2, total: 2 },
  eventingControllerPods: { ready: 1, total: 2 },
  services: [
    {
      name: 'api-gateway',
      namespace: 'production',
      status: 'ready',
      url: 'https://api-gateway.production.example.com',
      latestCreatedRevision: 'api-gateway-00005',
      latestReadyRevision: 'api-gateway-00005',
      generation: 5,
      traffic: [
        { revisionName: 'api-gateway-00005', percent: 90, latestRevision: true, tag: 'stable' },
        { revisionName: 'api-gateway-00004', percent: 10, latestRevision: false, tag: 'canary' },
      ],
    },
    {
      name: 'image-processor',
      namespace: 'production',
      status: 'ready',
      url: 'https://image-processor.production.example.com',
      latestCreatedRevision: 'image-processor-00003',
      latestReadyRevision: 'image-processor-00003',
      generation: 3,
      traffic: [
        { revisionName: 'image-processor-00003', percent: 100, latestRevision: true, tag: '' },
      ],
    },
    {
      name: 'notification-sender',
      namespace: 'staging',
      status: 'not-ready',
      url: 'https://notification-sender.staging.example.com',
      latestCreatedRevision: 'notification-sender-00002',
      latestReadyRevision: 'notification-sender-00001',
      generation: 2,
      traffic: [
        { revisionName: 'notification-sender-00001', percent: 100, latestRevision: false, tag: '' },
      ],
    },
    {
      name: 'webhook-handler',
      namespace: 'production',
      status: 'ready',
      url: 'https://webhook-handler.production.example.com',
      latestCreatedRevision: 'webhook-handler-00008',
      latestReadyRevision: 'webhook-handler-00008',
      generation: 8,
      traffic: [
        { revisionName: 'webhook-handler-00008', percent: 80, latestRevision: true, tag: 'stable' },
        { revisionName: 'webhook-handler-00007', percent: 15, latestRevision: false, tag: 'previous' },
        { revisionName: 'webhook-handler-00006', percent: 5, latestRevision: false, tag: 'canary' },
      ],
    },
  ],
  revisions: [
    { name: 'api-gateway-00005', namespace: 'production', service: 'api-gateway', generation: 5, image: 'gcr.io/prod/api-gateway:v2.3.1', readyReplicas: 3, status: 'ready' },
    { name: 'api-gateway-00004', namespace: 'production', service: 'api-gateway', generation: 4, image: 'gcr.io/prod/api-gateway:v2.3.0', readyReplicas: 1, status: 'ready' },
    { name: 'image-processor-00003', namespace: 'production', service: 'image-processor', generation: 3, image: 'gcr.io/prod/image-processor:v1.8.0', readyReplicas: 0, status: 'activating' },
    { name: 'notification-sender-00002', namespace: 'staging', service: 'notification-sender', generation: 2, image: 'gcr.io/staging/notification-sender:v0.5.0-rc1', readyReplicas: 0, status: 'not-ready' },
    { name: 'notification-sender-00001', namespace: 'staging', service: 'notification-sender', generation: 1, image: 'gcr.io/staging/notification-sender:v0.4.2', readyReplicas: 1, status: 'ready' },
    { name: 'webhook-handler-00008', namespace: 'production', service: 'webhook-handler', generation: 8, image: 'gcr.io/prod/webhook-handler:v3.1.0', readyReplicas: 4, status: 'ready' },
  ],
  brokers: [
    { name: 'default', namespace: 'production', status: 'ready', triggerCount: 5, hasDeadLetterSink: true, brokerClass: 'MTChannelBasedBroker' },
    { name: 'orders-broker', namespace: 'production', status: 'ready', triggerCount: 3, hasDeadLetterSink: true, brokerClass: 'Kafka' },
    { name: 'staging-broker', namespace: 'staging', status: 'not-ready', triggerCount: 2, hasDeadLetterSink: false, brokerClass: 'MTChannelBasedBroker' },
  ],
  lastCheckTime: new Date(Date.now() - DEMO_LAST_CHECK_OFFSET_MS).toISOString(),
}
