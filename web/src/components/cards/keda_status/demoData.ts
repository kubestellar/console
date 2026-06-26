/**
 * Demo data for the KEDA (Kubernetes Event-Driven Autoscaling) status card.
 *
 * Represents a typical production environment using KEDA for event-driven
 * autoscaling across multiple workloads. Used in demo mode or when no
 * Kubernetes clusters are connected.
 *
 * KEDA terminology:
 * - ScaledObject: targets a Deployment/StatefulSet, driven by event triggers
 * - ScaledJob: targets a Job, spawns pods per trigger event
 * - Trigger: the event source (Kafka, Prometheus, SQS, RabbitMQ, etc.)
 */

const DEMO_LAST_CHECK_OFFSET_MS = 45_000 // Demo data shows as checked 45 seconds ago

export type KedaTriggerType =
  | 'kafka'
  | 'prometheus'
  | 'rabbitmq'
  | 'aws-sqs-queue'
  | 'azure-servicebus'
  | 'redis'
  | 'cron'
  | 'cpu'
  | 'memory'
  | 'external'

export type KedaScaledObjectStatus = 'ready' | 'degraded' | 'paused' | 'error'

export interface KedaTrigger {
  type: KedaTriggerType
  /** Human-readable description of this trigger (queue name, metric name, etc.) */
  source: string
  /** Current queue depth / metric value observed by KEDA */
  currentValue: number
  /** Target value configured in the ScaledObject */
  targetValue: number
}

export interface KedaScaledObject {
  name: string
  namespace: string
  status: KedaScaledObjectStatus
  /** Target workload name */
  target: string
  currentReplicas: number
  desiredReplicas: number
  minReplicas: number
  maxReplicas: number
  triggers: KedaTrigger[]
}

export interface KedaDemoData {
  health: 'healthy' | 'degraded' | 'not-installed'
  operatorPods: {
    ready: number
    total: number
  }
  scaledObjects: KedaScaledObject[]
  totalScaledJobs: number
  lastCheckTime: string
}

export const KEDA_DEMO_DATA: KedaDemoData = {
  health: 'degraded',
  operatorPods: { ready: 1, total: 2 },
  scaledObjects: [
    {
      name: 'order-processor-scaler',
      namespace: 'production',
      status: 'ready',
      target: 'order-processor',
      currentReplicas: 8,
      desiredReplicas: 12,
      minReplicas: 2,
      maxReplicas: 20,
      triggers: [
        {
          type: 'kafka',
          source: 'orders-topic',
          currentValue: 4800,
          targetValue: 400,
        },
      ],
    },
    {
      name: 'metrics-consumer-scaler',
      namespace: 'production',
      status: 'ready',
      target: 'metrics-consumer',
      currentReplicas: 3,
      desiredReplicas: 3,
      minReplicas: 1,
      maxReplicas: 10,
      triggers: [
        {
          type: 'prometheus',
          source: 'http_requests_per_second',
          currentValue: 145,
          targetValue: 50,
        },
      ],
    },
    {
      name: 'notification-worker-scaler',
      namespace: 'staging',
      status: 'degraded',
      target: 'notification-worker',
      currentReplicas: 0,
      desiredReplicas: 4,
      minReplicas: 0,
      maxReplicas: 15,
      triggers: [
        {
          type: 'rabbitmq',
          source: 'notifications-queue',
          currentValue: 2340,
          targetValue: 500,
        },
      ],
    },
    {
      name: 'report-generator-scaler',
      namespace: 'production',
      status: 'paused',
      target: 'report-generator',
      currentReplicas: 0,
      desiredReplicas: 0,
      minReplicas: 0,
      maxReplicas: 5,
      triggers: [
        {
          type: 'cron',
          source: '0 2 * * *',
          currentValue: 0,
          targetValue: 1,
        },
      ],
    },
    {
      name: 'cache-warmer-scaler',
      namespace: 'production',
      status: 'error',
      target: 'cache-warmer',
      currentReplicas: 1,
      desiredReplicas: 1,
      minReplicas: 1,
      maxReplicas: 8,
      triggers: [
        {
          type: 'redis',
          source: 'pending-cache-keys',
          currentValue: 0,
          targetValue: 100,
        },
      ],
    },
  ],
  totalScaledJobs: 3,
  lastCheckTime: new Date(Date.now() - DEMO_LAST_CHECK_OFFSET_MS).toISOString(),
}
