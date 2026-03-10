/**
 * Demo data for the Strimzi Kafka operator status card.
 *
 * Represents a typical cluster running Strimzi with multiple Kafka topics
 * and consumer groups. Used in demo mode or when no Kubernetes clusters
 * are connected.
 */

export interface StrimziTopic {
  name: string
  partitions: number
  replicationFactor: number
  status: 'active' | 'inactive' | 'error'
}

export interface StrimziConsumerGroup {
  groupId: string
  lag: number
  status: 'ok' | 'warning' | 'error'
}

export interface StrimziDemoData {
  health: 'healthy' | 'degraded' | 'not-installed'
  clusterName: string
  kafkaVersion: string
  topics: StrimziTopic[]
  consumerGroups: StrimziConsumerGroup[]
  brokers: { ready: number; total: number }
  lastCheckTime: string
}

export const STRIMZI_DEMO_DATA: StrimziDemoData = {
  health: 'healthy',
  clusterName: 'my-cluster',
  kafkaVersion: '3.7.0',
  topics: [
    { name: 'orders', partitions: 12, replicationFactor: 3, status: 'active' },
    { name: 'payments', partitions: 6, replicationFactor: 3, status: 'active' },
    { name: 'user-events', partitions: 4, replicationFactor: 2, status: 'active' },
    { name: 'alerts', partitions: 2, replicationFactor: 1, status: 'inactive' },
    { name: 'dead-letter', partitions: 1, replicationFactor: 1, status: 'error' },
  ],
  consumerGroups: [
    { groupId: 'order-service', lag: 0, status: 'ok' },
    { groupId: 'payment-processor', lag: 142, status: 'warning' },
    { groupId: 'analytics-pipeline', lag: 0, status: 'ok' },
    { groupId: 'alert-handler', lag: 0, status: 'ok' },
  ],
  brokers: { ready: 3, total: 3 },
  lastCheckTime: new Date(Date.now() - 45 * 1000).toISOString(), // 45 sec ago
}
